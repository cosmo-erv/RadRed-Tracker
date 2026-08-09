#!/usr/bin/env node
/**
 * Regenerates src/data/game.json, src/data/dex.json and public/sprites/*.png.
 *
 * Sources (downloaded once into .cache/, which is gitignored):
 *   - Radical Red route / encounter / boss data: nuzlocke.app (BSD-3-Clause, see NOTICE)
 *   - Species names, types, base stats, evolution families: PokeAPI CSV data
 *   - Box sprites: PokeAPI/sprites (generation-viii icons)
 *
 * The generated files are committed, so `npm run build` never needs the network.
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cache = resolve(root, '.cache')
const NUZ = 'https://raw.githubusercontent.com/domtronn/nuzlocke.app/master/src/lib/data'
const POKEAPI = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv'
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

await mkdir(cache, { recursive: true })

async function cached(name, url, binary = false) {
  const file = resolve(cache, name)
  if (!existsSync(file)) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(file, buf)
  }
  return binary ? readFile(file) : readFile(file, 'utf8')
}

const json = async (name, url) => JSON.parse(await cached(name, url))

function csv(text) {
  const [header, ...lines] = text.trim().split('\n')
  const cols = header.split(',')
  return lines.map((line) => {
    // PokeAPI CSVs only quote fields containing commas
    const values = []
    let cur = ''
    let quoted = false
    for (const ch of line) {
      if (ch === '"') quoted = !quoted
      else if (ch === ',' && !quoted) (values.push(cur), (cur = ''))
      else cur += ch
    }
    values.push(cur)
    return Object.fromEntries(cols.map((c, i) => [c, values[i]]))
  })
}

/* ------------------------------------------------------------------ sources */

const routes = await json('routes.json', `${NUZ}/routes.json`)
const league = await json('league.json', `${NUZ}/league.json`)
const patches = (await json('patches.json', `${NUZ}/patches.json`)).radred

const pokemonRows = csv(await cached('pokemon.csv', `${POKEAPI}/pokemon.csv`))
const speciesRows = csv(await cached('pokemon_species.csv', `${POKEAPI}/pokemon_species.csv`))
const nameRows = csv(await cached('species_names.csv', `${POKEAPI}/pokemon_species_names.csv`))
const typeRows = csv(await cached('pokemon_types.csv', `${POKEAPI}/pokemon_types.csv`))
const typeNames = csv(await cached('types.csv', `${POKEAPI}/types.csv`))
const statRows = csv(await cached('pokemon_stats.csv', `${POKEAPI}/pokemon_stats.csv`))

const typeById = new Map(typeNames.map((t) => [t.id, t.identifier]))
const speciesById = new Map(speciesRows.map((s) => [s.id, s]))
const englishName = new Map(
  nameRows.filter((n) => n.local_language_id === '9').map((n) => [n.pokemon_species_id, n.name])
)
const pokemonBySlug = new Map(pokemonRows.map((p) => [p.identifier, p]))
const typesByPokemonId = new Map()
for (const row of typeRows) {
  const list = typesByPokemonId.get(row.pokemon_id) ?? []
  list[Number(row.slot) - 1] = typeById.get(row.type_id)
  typesByPokemonId.set(row.pokemon_id, list)
}
const STAT_KEYS = { 1: 'hp', 2: 'atk', 3: 'def', 4: 'spa', 5: 'spd', 6: 'spe' }
const statsByPokemonId = new Map()
for (const row of statRows) {
  const key = STAT_KEYS[row.stat_id]
  if (!key) continue
  const stats = statsByPokemonId.get(row.pokemon_id) ?? {}
  stats[key] = Number(row.base_stat)
  statsByPokemonId.set(row.pokemon_id, stats)
}

/* ------------------------------------------------------- ace trainer dumps */

/**
 * Radical Red's Ace Trainers are boss-tier fights the community docs group
 * with the mini-bosses, but they are not in the nuzlocke.app dataset. Their
 * teams come from Rudo2204's 4.1 trainer dumps instead.
 *
 * The dumps are gists, and gist.githubusercontent.com is not reachable from
 * here, so the file content is lifted out of the rendered gist page.
 */
const ACE_DUMPS = {
  normal: '7f9e4a3ceaf077d623d3c37b1f921601',
  hardcore: 'ed23cfda024998b566128318963ea7a5'
}

function gistText(pageHtml) {
  const rows = [...pageHtml.matchAll(/<td[^>]*class="[^"]*blob-code[^"]*"[^>]*>(.*?)<\/td>/gs)]
  return rows
    .map(([, cell]) =>
      cell
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
    )
    .join('\n')
}

/** Splits a dump into trainers, each with a parsed team. */
function parseDump(text) {
  const trainers = []
  let current = null
  for (const line of text.split('\n')) {
    const header = line.match(/^(.+?)\s*\(id: (0x[0-9a-fA-F]+)\)\s*$/)
    if (header) {
      current = { name: header[1].trim(), id: Number(header[2]), lines: [] }
      trainers.push(current)
    } else if (current) current.lines.push(line)
  }

  for (const trainer of trainers) {
    trainer.team = trainer.lines
      .join('\n')
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.includes('Ability:'))
      .map((chunk) => {
        const rows = chunk.split('\n')
        const lead = rows[0].match(/^(.+?)(?:\s\((?:M|F)\))?(?:\s@\s(.+))?$/)
        const find = (prefix) =>
          rows.find((row) => row.startsWith(prefix))?.slice(prefix.length).trim() ?? null
        return {
          species: lead[1].trim(),
          item: lead[2]?.trim() ?? null,
          ability: find('Ability:'),
          level: find('Level:'),
          moves: rows.filter((row) => row.startsWith('- ')).map((row) => row.slice(2).trim())
        }
      })
  }
  return trainers
}

/** "Max Level - 2" -> offset -2; "Max Level" -> offset 0; "47" -> level 47. */
function dumpLevel(raw) {
  if (!raw) return { level: 0 }
  const scaled = raw.match(/Max Level(?:\s*-\s*(\d+))?/i)
  if (scaled) return { offset: scaled[1] ? -Number(scaled[1]) : 0 }
  const number = Number(raw.match(/\d+/)?.[0])
  return { level: Number.isFinite(number) ? number : 0 }
}

/** Dump species names are Showdown-style; turn them into PokeAPI slugs. */
function dumpSlug(name) {
  const slug = name
    .replace(/\s*\(Gender unknown\)/i, '')
    .trim()
    .replace(/[.'’:]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
  return DUMP_ALIAS[slug] ?? slug
}

const DUMP_ALIAS = {
  'arceus-bug': 'arceus',
  basculegion: 'basculegion-male',
  dudunsparce: 'dudunsparce-two-segment',
  landorus: 'landorus-incarnate',
  'necrozma-dawn-wings': 'necrozma-dawn',
  'necrozma-dusk-mane': 'necrozma-dusk',
  'ogerpon-cornerstone': 'ogerpon-cornerstone-mask',
  'ogerpon-hearthflame': 'ogerpon-hearthflame-mask',
  'ogerpon-wellspring': 'ogerpon-wellspring-mask',
  palafin: 'palafin-zero',
  'pikachu-flying': 'pikachu',
  squawkabilly: 'squawkabilly-green-plumage',
  urshifu: 'urshifu-single-strike',
  zygarde: 'zygarde-50',
  enamorus: 'enamorus-incarnate',
  keldeo: 'keldeo-ordinary',
  'keldeo-resolute': 'keldeo-resolute',
  lycanroc: 'lycanroc-midday',
  maushold: 'maushold-family-of-four',
  morpeko: 'morpeko-full-belly'
}

const allTrainers = {}
const aceTrainers = {}
for (const [mode, gistId] of Object.entries(ACE_DUMPS)) {
  const page = await cached(`ace-${mode}.html`, `https://gist.github.com/Rudo2204/${gistId}`)
  allTrainers[mode] = parseDump(gistText(page)).filter((trainer) => trainer.team.length > 0)
  aceTrainers[mode] = allTrainers[mode].filter(
    // Five or more Pokémon is what separates the boss-tier Ace Trainers from
    // the ordinary route trainers sharing the class name.
    (trainer) => trainer.name.startsWith('Ace Trainer') && trainer.team.length >= 5
  )
}

/* ------------------------------------------------- matching bosses to 4.1 */

/** Strips the trainer class so "Leader Falkner" and "Falkner" line up. */
const bareName = (name) =>
  name
    .replace(/^(Leader Lt\.|Leader|Elite Four|Champion|Boss|Rocket Admin|Rival|Player|\{PK\}\{MN\} Trainer)\s+/i, '')
    .replace(/^Lt\.\s*/i, '')
    .toLowerCase()
    .trim()

/** The nuzlocke.app names for the same people. */
const TRAINER_ALIAS = {
  gary: 'terry',
  'admin archer': 'archer',
  'admin ariana': 'ariana',
  'champion gary': 'terry'
}

/** Boss label -> the name to look for in the dump. */
function matchName(trainer) {
  const base = trainer
    .replace(/\s*\(.*\)\s*/g, '')
    .replace(/\s*Rematch\s*/i, '')
    .toLowerCase()
    .trim()
  const stripped = base.replace(/^lt\.\s*/, '')
  return TRAINER_ALIAS[stripped] ?? stripped
}

/** How well a dump entry matches a roster we already have. */
function matchScore(boss, candidate) {
  const have = new Set(boss.team.map((mon) => mon.slug))
  const theirs = new Set(candidate.team.map((mon) => dumpSlug(mon.species)))
  const shared = [...have].filter((slug) => theirs.has(slug)).length
  const union = new Set([...have, ...theirs]).size || 1

  const levels = candidate.team.map((mon) => dumpLevel(mon.level))
  const candidateScaled = levels.some((entry) => entry.offset !== undefined)
  const anchor = boss.anchorCap ?? boss.levelCap
  const candidateCap = Math.max(
    ...levels.map((entry) => (entry.offset !== undefined ? anchor + entry.offset : entry.level))
  )

  return (
    (shared / union) * 10 +
    // A fight that scales like ours is far more likely to be the same fight.
    (candidateScaled === Boolean(boss.scaled) ? 1.5 : -1.5) -
    Math.min(Math.abs(candidateCap - boss.levelCap), 40) * 0.1 -
    Math.abs(candidate.team.length - boss.team.length) * 0.3
  )
}

/** Confidence floor for trusting a matched roster over the older data. */
const MATCH_FLOOR = 3

/** Builds a boss team out of a dump entry. */
function dumpTeam(trainer) {
  return trainer.team
    .map((mon) => {
      const { level = 0, offset } = dumpLevel(mon.level)
      return {
        slug: dumpSlug(mon.species),
        level,
        ...(offset !== undefined ? { offset } : {}),
        ability: mon.ability ? slugify(mon.ability) : null,
        held: mon.item && mon.item.toLowerCase() !== 'none' ? slugify(mon.item) : null,
        moves: mon.moves.map(slugify)
      }
    })
    .filter((mon) => dex[mon.slug])
}

function useDumpTeam(boss, trainer, mode) {
  const team = dumpTeam(trainer)
  const before = boss.team.map((mon) => mon.slug)
  boss.team = team
  boss.scaled = team.some((mon) => mon.offset !== undefined)
  boss.levelCap = team.reduce((max, mon) => Math.max(max, mon.level), 0)
  boss.verified = true
  return {
    mode,
    trainer: boss.trainer,
    id: trainer.id,
    added: team.map((mon) => mon.slug).filter((slug) => !before.includes(slug)),
    removed: before.filter((slug) => !team.some((mon) => mon.slug === slug))
  }
}

/**
 * Replaces boss rosters with their Radical Red 4.1 teams.
 *
 * Trainers appear in the dump several times (story fight, rematch, late-game
 * version), so same-name fights are assigned one-to-one, best score first, and
 * never share an entry. A fight whose best candidate is still a weak match
 * keeps its older roster and is flagged unverified rather than guessed at.
 *
 * Both dumps use identical trainer ids, so hardcore does not re-run the guess:
 * each hardcore fight takes the id its normal-mode counterpart matched.
 */
function applyDumpTeams(steps, mode, log, assignments) {
  const trainers = allTrainers[mode]
  const byId = new Map(trainers.map((trainer) => [trainer.id, trainer]))
  const bosses = steps.filter((step) => step.kind === 'boss')

  if (mode !== 'normal') {
    for (const boss of bosses) {
      const inherited = assignments.get(boss.key.replace(/_hard$/, ''))
      const trainer = inherited === undefined ? null : byId.get(inherited)
      if (trainer) log.matched.push({ ...useDumpTeam(boss, trainer, mode), inherited: true })
      else log.unverified.push(`${mode}: ${boss.trainer}`)
    }
    return steps
  }

  const pool = new Map()
  for (const trainer of trainers) {
    const name = bareName(trainer.name)
    if (!pool.has(name)) pool.set(name, [])
    pool.get(name).push(trainer)
  }

  const byName = new Map()
  for (const boss of bosses) {
    const name = matchName(boss.trainer)
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(boss)
  }

  for (const [name, group] of byName) {
    const candidates = pool.get(name) ?? []
    if (candidates.length === 0) {
      for (const boss of group) log.unverified.push(`${mode}: ${boss.trainer} (no “${name}” in dump)`)
      continue
    }

    const pairs = []
    for (const boss of group)
      for (const candidate of candidates)
        pairs.push({ boss, candidate, score: matchScore(boss, candidate) })
    pairs.sort((a, b) => b.score - a.score)

    const takenBosses = new Set()
    const takenCandidates = new Set()
    for (const { boss, candidate, score } of pairs) {
      if (takenBosses.has(boss) || takenCandidates.has(candidate)) continue
      if (score < MATCH_FLOOR) continue
      takenBosses.add(boss)
      takenCandidates.add(candidate)
      assignments.set(boss.key, candidate.id)
      log.matched.push({ ...useDumpTeam(boss, candidate, mode), score: Number(score.toFixed(1)) })
    }
    for (const boss of group)
      if (!takenBosses.has(boss)) log.unverified.push(`${mode}: ${boss.trainer} (no confident match)`)
  }
  return steps
}

/** Slugs the Radical Red data uses that PokeAPI spells differently. */
const ALIAS = {
  basculin: 'basculin-red-striped',
  darmanitan: 'darmanitan-standard',
  'darmanitan-galar': 'darmanitan-galar-standard',
  eiscue: 'eiscue-ice',
  frillish: 'frillish-male',
  jellicent: 'jellicent-male',
  indeedee: 'indeedee-male',
  'indeedee-f': 'indeedee-female',
  mimikyu: 'mimikyu-disguised',
  minior: 'minior-red-meteor',
  oricorio: 'oricorio-baile',
  pumpkaboo: 'pumpkaboo-average',
  pyroar: 'pyroar-male',
  toxtricity: 'toxtricity-amped',
  'toxtricity-mega': 'toxtricity-amped',
  typenull: 'type-null',
  wishiwashi: 'wishiwashi-solo',
  'pikachu-rockstar': 'pikachu-rock-star',
  'arceus-fairy': 'arceus',
  'arceus-ground': 'arceus',
  'arceus-steel': 'arceus',
  'silvally-fairy': 'silvally',
  'silvally-ghost': 'silvally'
}

const FORM_LABELS = {
  alola: 'Alolan',
  galar: 'Galarian',
  hisui: 'Hisuian',
  paldea: 'Paldean',
  sevii: 'Seviian',
  mega: 'Mega',
  'mega-x': 'Mega X',
  'mega-y': 'Mega Y',
  gmax: 'Gigantamax'
}

const titleCase = (s) => s.replace(/(^|[\s-])([a-z])/g, (_, p, c) => p + c.toUpperCase())

function displayName(slug) {
  const fake = patches.fakemon?.[slug]
  if (fake) return fake.label ?? fake.name
  const row = pokemonBySlug.get(ALIAS[slug] ?? slug)
  if (!row) return titleCase(slug.replace(/-/g, ' '))

  const species = speciesById.get(row.species_id)
  const base = englishName.get(row.species_id) ?? titleCase(species.identifier)
  if (slug === species.identifier || !slug.includes('-')) return base

  const suffix = slug.slice(species.identifier.length + 1)
  if (FORM_LABELS[suffix]) return `${FORM_LABELS[suffix]} ${base}`
  return `${base} (${titleCase(suffix.replace(/-/g, ' '))})`
}

/* --------------------------------------------------------------------- dex */

/** Every species slug referenced anywhere in the Radical Red data. */
const usedSlugs = new Set()
for (const mode of ['radred', 'radred_hard'])
  for (const step of routes[mode]) for (const slug of step.encounters ?? []) usedSlugs.add(slug)
for (const boss of Object.values(league.radred))
  for (const mon of boss.pokemon) usedSlugs.add(mon.name)
for (const list of Object.values(aceTrainers))
  for (const trainer of list) for (const mon of trainer.team) usedSlugs.add(dumpSlug(mon.species))

// Boss rosters get replaced with their 4.1 versions further down, which pulls
// in species the older dataset never referenced (most of gen 9).
const bossMatchNames = new Set(
  Object.values(league.radred).map((boss) => matchName(boss.name ?? ''))
)
for (const list of Object.values(allTrainers))
  for (const trainer of list)
    if (bossMatchNames.has(bareName(trainer.name)))
      for (const mon of trainer.team) usedSlugs.add(dumpSlug(mon.species))

const dex = {}
const spriteJobs = new Map() // slug -> ordered list of candidate sprite URLs
const unresolved = []

for (const slug of [...usedSlugs].sort()) {
  const fake = patches.fakemon?.[slug]
  const alias = ALIAS[slug] ?? slug
  const row = pokemonBySlug.get(alias)
  // Fakemon (Seviian forms etc.) fall back to the base species for sprites/stats.
  const baseSlug = fake ? (fake.baseSpecies ?? slug.replace(/-sevii$/, '')) : null
  const baseRow = row ?? pokemonBySlug.get(ALIAS[baseSlug] ?? baseSlug ?? '')
  if (!baseRow) {
    unresolved.push(slug)
    continue
  }
  const species = speciesById.get(baseRow.species_id)
  const patch = patches.pokemon?.[slug]
  const types = fake?.types ?? patch?.types ?? typesByPokemonId.get(baseRow.id) ?? ['normal']
  const stats = { ...(statsByPokemonId.get(baseRow.id) ?? {}), ...(fake?.baseStats ?? {}), ...(patch?.stats ?? {}) }

  dex[slug] = {
    name: displayName(slug),
    dex: Number(species.id),
    types: types.filter(Boolean),
    gen: Number(species.generation_id),
    family: Number(species.evolution_chain_id),
    stats,
    ...(fake ? { fakemon: true } : {}),
    ...(patch?.stats || fake ? { patched: true } : {})
  }

  const defaultRow = pokemonRows.find((p) => p.species_id === baseRow.species_id && p.is_default === '1')
  spriteJobs.set(slug, [
    `${SPRITES}/versions/generation-viii/icons/${baseRow.id}.png`,
    defaultRow ? `${SPRITES}/versions/generation-viii/icons/${defaultRow.id}.png` : null,
    `${SPRITES}/versions/generation-viii/icons/${species.id}.png`,
    // Species newer than the gen-viii icon set (Paldea, Hisui) only have full sprites.
    `${SPRITES}/${baseRow.id}.png`
  ].filter(Boolean))
}

if (unresolved.length) console.warn('Unresolved species:', unresolved.join(', '))

/* -------------------------------------------------------------------- game */

/** Typos in the upstream location / trainer names. */
const SPELLING = {
  'Virdian Forest': 'Viridian Forest',
  'Fuschia City': 'Fuchsia City',
  'Vermillion City': 'Vermilion City',
  'Vermillion City Gym': 'Vermilion City Gym',
  'Digletts Cave': "Diglett's Cave",
  'Prye (Team C)': 'Pryce (Team C)'
}

const fixSpelling = (name) => SPELLING[name] ?? name

const bossKeyFor = (value, mode) =>
  mode === 'hardcore' && league.radred[`${value}_hard`] ? `${value}_hard` : value

function buildSteps(mode) {
  const source = routes[mode === 'hardcore' ? 'radred_hard' : 'radred']
  const seen = new Map()
  return source.map((step, index) => {
    if (step.type === 'route') {
      const name = fixSpelling(step.name)
      // A couple of location names repeat across the run; keep ids unique and stable.
      const count = (seen.get(name) ?? 0) + 1
      seen.set(name, count)
      const id = `loc:${slugify(name)}${count > 1 ? `:${count}` : ''}`
      return {
        kind: 'route',
        id,
        name,
        encounters: [...new Set(step.encounters ?? [])].filter((s) => dex[s])
      }
    }
    const key = bossKeyFor(step.value, mode)
    const boss = league.radred[key]
    const team = (boss?.pokemon ?? []).map((mon) => {
      // Rematches, mini-bosses and most hardcore fights scale with your level
      // cap; the source writes those as an offset ("+0", "-2") instead of a
      // level. Resolving the offset needs the whole run order, so it happens
      // in resolveScaledLevels below.
      const scaled = /^[+-]/.test(String(mon.level))
      return {
        slug: mon.name,
        level: scaled ? 0 : Number(mon.level) || 0,
        ...(scaled ? { offset: Number(mon.level) } : {}),
        ability: mon.ability || null,
        held: mon.held || null,
        moves: (mon.moves ?? []).filter(Boolean)
      }
    })
    return {
      kind: 'boss',
      id: `boss:${key}:${index}`,
      key,
      name: fixSpelling(step.name),
      trainer: fixSpelling(boss?.name ?? step.boss ?? 'Trainer'),
      group: step.group ?? 'boss',
      speciality: boss?.speciality ?? null,
      scaled: team.some((mon) => mon.offset !== undefined),
      levelCap: team.reduce((max, mon) => Math.max(max, mon.level), 0),
      // Flipped by applyDumpTeams when a 4.1 roster is matched to this fight.
      verified: false,
      team
    }
  })
}

/**
 * Turns "-2" into a real level. The anchor is the badge cap in force at that
 * point of the run: the ace level of the next gym leader with fixed levels,
 * falling back to the last one behind when a fight sits after the 8th gym.
 */
function resolveScaledLevels(steps) {
  const anchors = steps
    .map((step, index) =>
      step.kind === 'boss' && step.group === 'gym-leader' && !step.scaled && step.levelCap > 0
        ? { index, cap: step.levelCap }
        : null
    )
    .filter(Boolean)

  for (const [index, step] of steps.entries()) {
    if (step.kind !== 'boss' || !step.scaled) continue
    const ahead = anchors.find((anchor) => anchor.index >= index)
    const behind = [...anchors].reverse().find((anchor) => anchor.index < index)
    const anchor = ahead ?? behind
    if (!anchor) continue

    step.anchorCap = anchor.cap
    for (const mon of step.team) {
      if (mon.offset !== undefined) mon.level = Math.max(1, anchor.cap + mon.offset)
    }
    step.levelCap = step.team.reduce((max, mon) => Math.max(max, mon.level), 0)
  }
  return steps
}

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Ace Trainers as boss-shaped entries. The dumps carry no location, so these
 * are not placed in the run order — they are browsed and ticked off from the
 * Bosses tab, sorted by level.
 */
function buildAceTrainers(mode) {
  return aceTrainers[mode]
    .map((trainer) => {
      const team = trainer.team
        .map((mon) => {
          const slug = dumpSlug(mon.species)
          if (!dex[slug]) return null
          const { level = 0, offset } = dumpLevel(mon.level)
          return {
            slug,
            level,
            ...(offset !== undefined ? { offset } : {}),
            ability: mon.ability ? slugify(mon.ability) : null,
            held: mon.item && mon.item.toLowerCase() !== 'none' ? slugify(mon.item) : null,
            moves: mon.moves.map(slugify)
          }
        })
        .filter(Boolean)

      return {
        kind: 'boss',
        id: `ace:${trainer.id}`,
        key: `ace-${trainer.id}`,
        name: 'Ace Trainer',
        trainer: trainer.name.replace(/^Ace Trainer\s*/, ''),
        group: 'ace-trainer',
        speciality: null,
        optional: true,
        scaled: team.some((mon) => mon.offset !== undefined),
        levelCap: team.reduce((max, mon) => Math.max(max, mon.level), 0),
        team
      }
    })
    .filter((entry) => entry.team.length >= 5)
    // Cap-scaled fights are the late-game ones, so they sort after the fixed
    // levels rather than ahead of them on a levelCap of 0.
    .sort(
      (a, b) =>
        Number(a.scaled) - Number(b.scaled) ||
        a.levelCap - b.levelCap ||
        a.trainer.localeCompare(b.trainer)
    )
}

const matchLog = { matched: [], unverified: [] }
const dumpAssignments = new Map()

const game = {
  title: 'Radical Red 4.1',
  generatedAt: new Date().toISOString().slice(0, 10),
  moves: patches.move ?? {},
  abilities: patches.ability ?? {},
  items: patches.item ?? {},
  modes: {
    // Legacy teams first (they anchor the matching), then the 4.1 rosters, then
    // level resolution again for the offsets the new teams brought with them.
    normal: resolveScaledLevels(
      applyDumpTeams(resolveScaledLevels(buildSteps('normal')), 'normal', matchLog, dumpAssignments)
    ),
    hardcore: resolveScaledLevels(
      applyDumpTeams(
        resolveScaledLevels(buildSteps('hardcore')),
        'hardcore',
        matchLog,
        dumpAssignments
      )
    )
  },
  extras: {
    normal: buildAceTrainers('normal'),
    hardcore: buildAceTrainers('hardcore')
  }
}

await mkdir(resolve(root, 'src/data'), { recursive: true })
await writeFile(resolve(root, 'src/data/game.json'), JSON.stringify(game))
await writeFile(resolve(root, 'src/data/dex.json'), JSON.stringify(dex))

/* ----------------------------------------------------------------- sprites */

const spriteDir = resolve(root, 'public/sprites')
await mkdir(spriteDir, { recursive: true })
const have = new Set(existsSync(spriteDir) ? await readdir(spriteDir) : [])
let downloaded = 0
let failed = 0

for (const [slug, candidates] of spriteJobs) {
  if (have.has(`${slug}.png`)) continue
  let saved = false
  for (const url of candidates) {
    const res = await fetch(url)
    if (!res.ok) continue
    await writeFile(resolve(spriteDir, `${slug}.png`), Buffer.from(await res.arrayBuffer()))
    saved = true
    downloaded++
    break
  }
  if (!saved) {
    failed++
    console.warn('No sprite for', slug)
  }
}

console.log(
  `bosses:    ${matchLog.matched.length} rosters updated to 4.1, ` +
    `${matchLog.unverified.length} left on the older data (flagged in-app)`
)
for (const entry of matchLog.unverified) console.log('  unverified:', entry)
await writeFile(resolve(cache, 'match-report.json'), JSON.stringify(matchLog, null, 2))

console.log(
  `game.json: ${game.modes.normal.length} normal steps, ${game.modes.hardcore.length} hardcore steps\n` +
    `ace:       ${game.extras.normal.length} normal, ${game.extras.hardcore.length} hardcore\n` +
    `dex.json:  ${Object.keys(dex).length} species\n` +
    `sprites:   ${downloaded} downloaded, ${failed} missing`
)
