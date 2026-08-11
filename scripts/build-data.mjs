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
import { existsSync, readFileSync } from 'node:fs'
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
const moveRows = csv(await cached('moves.csv', `${POKEAPI}/moves.csv`))

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
  'basculegion-f': 'basculegion-female',
  flabébé: 'flabebe',
  meowstic: 'meowstic-male',
  'meowstic-f': 'meowstic-female',
  'oinkologne-f': 'oinkologne-female',
  'oinkologne-m': 'oinkologne-male',
  'pikachu-surfing': 'pikachu',
  screamtail: 'scream-tail',
  'squawkabilly-white': 'squawkabilly-white-plumage',
  tatsugiri: 'tatsugiri-curly',
  tornadus: 'tornadus-incarnate',
  'zygarde-10%': 'zygarde-10',
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

/**
 * Teams transcribed from the documentation PDF (see scripts/extract-doc-teams.py).
 * The dumps repeat a trainer's name across several fights and the older data is
 * too stale to tell them apart, so where the sheet covers a fight it decides
 * which dump entry belongs to it.
 */
const docTeams = JSON.parse(
  readFileSync(resolve(root, 'scripts/data/doc-teams.json'), 'utf8')
)

const docTeamsByTrainer = new Map()
for (const entry of docTeams) {
  const list = docTeamsByTrainer.get(entry.trainer) ?? []
  list.push(entry)
  docTeamsByTrainer.set(entry.trainer, list)
}

/** Fraction of a documented team that a dump entry reproduces. */
function docOverlap(candidate, docEntry) {
  const base = (slug) => slug.split('-')[0].replace(/^\?/, '')
  const theirs = new Set(docEntry.species.map(base))
  const ours = new Set(candidate.team.map((mon) => base(dumpSlug(mon.species))))
  const shared = [...theirs].filter((slug) => ours.has(slug)).length
  return shared / Math.max(theirs.size, 1)
}

/** The dump entry that best reproduces a documented team for this trainer. */
function docPick(boss, candidates) {
  // Our labels carry variant suffixes the sheet does not ("Pryce (Team A)").
  const plain = boss.trainer.toUpperCase().replace(/\s*\(.*?\)/g, '').trim()
  const entries = [
    ...(docTeamsByTrainer.get(boss.trainer.toUpperCase()) ?? []),
    ...(docTeamsByTrainer.get(plain) ?? [])
  ]
  let best = null
  for (const entry of entries) {
    for (const candidate of candidates) {
      const score = docOverlap(candidate, entry)
      if (!best || score > best.score) best = { candidate, score, page: entry.page }
    }
  }
  return best && best.score >= 0.5 ? best : null
}

/** Builds a boss team out of a dump entry. */
function dumpTeam(trainer) {
  const team = trainer.team
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

  // Dropping a member silently is how a four-Pokémon fight quietly becomes a
  // three-Pokémon fight; an unknown species is a build error, not a shrug.
  const unknown = team.filter((mon) => !dex[mon.slug]).map((mon) => mon.slug)
  if (unknown.length) {
    throw new Error(`${trainer.name} (#${trainer.id}) has un-indexed species: ${unknown.join(', ')}`)
  }
  return team
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
      // Double battles inherit both halves.
      const trainers = (Array.isArray(inherited) ? inherited : [inherited])
        .map((id) => (id === undefined ? null : byId.get(id)))
        .filter(Boolean)
      if (trainers.length === 0) {
        log.unverified.push(`${mode}: ${boss.trainer}`)
        continue
      }
      if (trainers.length === 1) {
        log.matched.push({ ...useDumpTeam(boss, trainers[0], mode), inherited: true })
        continue
      }
      const before = boss.team.map((mon) => mon.slug)
      boss.team = trainers.flatMap((trainer) => dumpTeam(trainer))
      boss.scaled = boss.team.some((mon) => mon.offset !== undefined)
      boss.levelCap = boss.team.reduce((max, mon) => Math.max(max, mon.level), 0)
      boss.verified = true
      log.matched.push({
        mode,
        trainer: boss.trainer,
        id: trainers.map((t) => t.id).join('+'),
        inherited: true,
        added: boss.team.map((mon) => mon.slug).filter((slug) => !before.includes(slug)),
        removed: before.filter((slug) => !boss.team.some((mon) => mon.slug === slug))
      })
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
    // A double battle is one fight in the run and two trainers in the dump.
    if (name.includes('&')) {
      const halves = name.split('&').map((half) => pool.get(half.trim()) ?? [])
      for (const boss of group) {
        const teams = halves.map((options) => {
          const best = options
            .map((candidate) => ({ candidate, score: matchScore(boss, candidate) }))
            .sort((a, b) => b.score - a.score)[0]
          return best?.candidate ?? null
        })
        if (teams.some((team) => !team)) {
          log.unverified.push(`${mode}: ${boss.trainer} (double battle, half missing)`)
          continue
        }
        const before = boss.team.map((mon) => mon.slug)
        boss.team = teams.flatMap((trainer) => dumpTeam(trainer))
        boss.scaled = boss.team.some((mon) => mon.offset !== undefined)
        boss.levelCap = boss.team.reduce((max, mon) => Math.max(max, mon.level), 0)
        boss.verified = true
        assignments.set(boss.key, teams.map((team) => team.id))
        log.matched.push({
          mode,
          trainer: boss.trainer,
          id: teams.map((team) => team.id).join('+'),
          added: boss.team.map((mon) => mon.slug).filter((slug) => !before.includes(slug)),
          removed: before.filter((slug) => !boss.team.some((mon) => mon.slug === slug))
        })
      }
      continue
    }

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
    for (const boss of group) {
      if (takenBosses.has(boss)) continue
      // The scorer could not separate this trainer's fights; ask the sheet.
      const picked = docPick(
        boss,
        candidates.filter((candidate) => !takenCandidates.has(candidate))
      )
      if (picked) {
        takenBosses.add(boss)
        takenCandidates.add(picked.candidate)
        assignments.set(boss.key, picked.candidate.id)
        log.matched.push({
          ...useDumpTeam(boss, picked.candidate, mode),
          viaDoc: `p${picked.page} (${Math.round(picked.score * 100)}%)`
        })
        continue
      }
      log.unverified.push(`${mode}: ${boss.trainer} (no confident match)`)
    }
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

// Boss rosters get replaced with their 4.1 versions further down and the route
// trainers are listed in full, so every species in the dumps needs an entry.
for (const list of Object.values(allTrainers))
  for (const trainer of list)
    for (const mon of trainer.team) usedSlugs.add(dumpSlug(mon.species))

const dex = {}
const spriteJobs = new Map() // slug -> ordered list of candidate sprite URLs
const unresolved = []

/** Adds one species to the dex, resolving forms, patches and its sprite. */
function addDexEntry(slug) {
  if (dex[slug]) return true
  const fake = patches.fakemon?.[slug]
  const alias = ALIAS[slug] ?? slug
  const row = pokemonBySlug.get(alias)
  // Fakemon (Seviian forms etc.) fall back to the base species for sprites/stats.
  const baseSlug = fake ? (fake.baseSpecies ?? slug.replace(/-sevii$/, '')) : null
  const baseRow = row ?? pokemonBySlug.get(ALIAS[baseSlug] ?? baseSlug ?? '')
  if (!baseRow) {
    unresolved.push(slug)
    return false
  }

  const species = speciesById.get(baseRow.species_id)
  const patch = patches.pokemon?.[slug]
  const types = fake?.types ?? patch?.types ?? typesByPokemonId.get(baseRow.id) ?? ['normal']
  const stats = {
    ...(statsByPokemonId.get(baseRow.id) ?? {}),
    ...(fake?.baseStats ?? {}),
    ...(patch?.stats ?? {})
  }

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

  const defaultRow = pokemonRows.find(
    (p) => p.species_id === baseRow.species_id && p.is_default === '1'
  )
  spriteJobs.set(
    slug,
    [
      `${SPRITES}/versions/generation-viii/icons/${baseRow.id}.png`,
      defaultRow ? `${SPRITES}/versions/generation-viii/icons/${defaultRow.id}.png` : null,
      `${SPRITES}/versions/generation-viii/icons/${species.id}.png`,
      // Species newer than the gen-viii icon set (Paldea, Hisui) only have full sprites.
      `${SPRITES}/${baseRow.id}.png`
    ].filter(Boolean)
  )
  return true
}

for (const slug of [...usedSlugs].sort()) addDexEntry(slug)

/* --------------------------------------------------------------- evolutions */

const childSpecies = new Map()
for (const row of speciesRows) {
  const parent = row.evolves_from_species_id
  if (!parent) continue
  if (!childSpecies.has(parent)) childSpecies.set(parent, [])
  childSpecies.get(parent).push(row)
}

/**
 * What a species can evolve into. Regional forms keep their suffix where the
 * evolved form exists (Alolan Rattata -> Alolan Raticate); where it does not,
 * the plain children are offered and the player picks (Galarian Meowth has
 * Perrserker among Persian's line).
 */
function evolutionsOf(slug) {
  const entry = dex[slug]
  if (!entry || entry.fakemon) return []
  const species = speciesRows.find((row) => Number(row.id) === entry.dex)
  if (!species) return []

  const suffix = slug.startsWith(`${species.identifier}-`)
    ? slug.slice(species.identifier.length + 1)
    : null
  // Megas and gigantamax forms are battle states, not evolutions.
  if (suffix && /^(mega|mega-x|mega-y|gmax)$/.test(suffix)) return []

  const targets = []
  for (const child of childSpecies.get(species.id) ?? []) {
    const suffixed = suffix ? `${child.identifier}-${suffix}` : null
    if (suffixed && (dex[suffixed] || pokemonBySlug.has(suffixed))) targets.push(suffixed)
    else if (pokemonBySlug.has(child.identifier)) targets.push(child.identifier)
    else {
      // Some species only exist under a form name, e.g. basculegion-male.
      const formed = pokemonRows.find((p) => p.species_id === child.id && p.is_default === '1')
      if (formed) targets.push(formed.identifier)
    }
  }
  return [...new Set(targets)]
}

// Pull evolution targets into the dex so they have names, types and sprites.
// This walks to a fixed point: a species added here needs its own evolutions
// resolved too, or a line stops dead at whatever stage the game data mentioned
// (Wurmple reaching Cascoon, but Cascoon never reaching Dustox).
const pending = [...Object.keys(dex)]
while (pending.length > 0) {
  const slug = pending.pop()
  for (const target of evolutionsOf(slug)) {
    if (!dex[target] && addDexEntry(target)) pending.push(target)
  }
}

for (const slug of Object.keys(dex)) {
  const targets = evolutionsOf(slug)
  const missing = targets.filter((target) => !dex[target])
  if (missing.length) throw new Error(`${slug} evolves into un-indexed ${missing.join(', ')}`)
  if (targets.length) dex[slug].evo = targets
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

/** Trainer classes that are already covered as ordered boss fights. */
const BOSS_CLASSES =
  /^(Leader|Elite Four|Champion|Boss|Rocket Admin|Rival|Player|Professor|\{PK\}\{MN\} Trainer|\{PK\}\{MN\} Prof)/

/**
 * Every fight the dumps know about that is not one of the ordered bosses.
 *
 * Two tiers, and the dumps separate them cleanly: Radical Red scales the
 * levels of its mini-bosses to your badge cap ("Max Level - 3") while ordinary
 * route trainers sit at fixed levels below it. Ace Trainers count as
 * mini-bosses whichever way their levels are written — that is how the
 * community docs class them, and Super Nerd Miguel by the Mt. Moon fossils
 * belongs to the same tier despite his trainer class.
 *
 * The dumps carry no location, so these are browsed rather than placed in
 * the run.
 */
function buildExtraTrainers(mode, steps) {
  // Fixed-level trainers can at least be tied to a stretch of the run: the
  // first boss whose cap is not below their team.
  const caps = steps
    .filter((step) => step.kind === 'boss' && !step.scaled && step.levelCap > 0)
    .map((step) => ({ cap: step.levelCap, trainer: step.trainer }))

  const segmentFor = (level) =>
    level > 0 ? (caps.find((entry) => entry.cap >= level)?.trainer ?? null) : null

  const entries = allTrainers[mode]
    .filter((trainer) => {
      if (trainer.name.startsWith('Ace Trainer')) return true
      if (BOSS_CLASSES.test(trainer.name)) return false
      const scaled = trainer.team.some((mon) => /Max Level/i.test(mon.level ?? ''))
      // One-Pokémon fights are noise unless they scale to your cap.
      return scaled || trainer.team.length >= 2
    })
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

      const scaled = team.some((mon) => mon.offset !== undefined)
      const ace = trainer.name.startsWith('Ace Trainer')
      const levelCap = team.reduce((max, mon) => Math.max(max, mon.level), 0)
      // The class is everything before the trainer's own name.
      const [, className = trainer.name, given = ''] =
        trainer.name.match(/^(.*?)\s+(\S+(?:\s&\s\S+)?)$/) ?? []

      return {
        kind: 'boss',
        id: `t:${trainer.id}`,
        key: `t-${trainer.id}`,
        name: ace ? 'Ace Trainer' : className,
        trainer: given || trainer.name,
        group: ace || scaled ? 'ace-trainer' : 'trainer',
        speciality: null,
        optional: true,
        verified: true,
        scaled,
        levelCap,
        ...(scaled ? {} : { segment: segmentFor(levelCap) }),
        team
      }
    })
    .filter((entry) => entry.team.length > 0)

  // Cap-scaled fights have no level to place them by, so they sort last.
  return entries.sort(
    (a, b) =>
      Number(a.scaled) - Number(b.scaled) ||
      a.levelCap - b.levelCap ||
      a.trainer.localeCompare(b.trainer)
  )
}

/* -------------------------------------------------------------- move table */

/**
 * Power, type and damage class for every move, so the app can work out what a
 * fight actually does to your team rather than guessing from typing alone.
 *
 * PokeAPI is the source. Radical Red renames a handful of moves and adds its
 * own, so those are aliased or declared here; anything still unresolved is
 * reported by the build and shows in the app as "not in the move data" rather
 * than being quietly treated as a 0-power move.
 */
const DAMAGE_CLASS = { 1: 'status', 2: 'physical', 3: 'special' }

/** Radical Red's move slugs against PokeAPI's. */
const MOVE_ALIAS = {
  'vise-grip': 'vice-grip',
  'king-s-shield': 'kings-shield',
  'disarm-cry': 'disarming-voice',
  'drain-kiss': 'draining-kiss',
  'crafty-guard': 'crafty-shield',
  'soupercell-slam': 'supercell-slam',
  'freeze-dry': 'freeze-dry',
  'natures-madness': 'natures-madness'
}

/**
 * Moves Radical Red adds outright. Values read off the in-game move
 * descriptions; flagged so the UI can say they are hand-entered.
 */
const CUSTOM_MOVES = {
  'dark-hole': { type: 'dark', power: 80, category: 'special', custom: true },
  'draco-barrage': { type: 'dragon', power: 90, category: 'physical', custom: true },
  'aqua-fang': { type: 'water', power: 65, category: 'physical', custom: true },
  'soul-robbery': { type: 'ghost', power: 75, category: 'physical', custom: true }
}

function buildMoves() {
  const table = {}
  for (const row of moveRows) {
    const category = DAMAGE_CLASS[Number(row.damage_class_id)]
    if (!category) continue
    table[row.identifier] = {
      type: typeById.get(row.type_id) ?? 'normal',
      power: Number(row.power) || 0,
      category
    }
  }

  // Hidden Power is one move per type in the dumps; all are 60 BP special.
  for (const type of typeById.values()) {
    if (type === 'normal' || type === 'fairy' || type === 'shadow' || type === 'unknown') continue
    table[`hidden-power-${type}`] = { type, power: 60, category: 'special' }
  }

  for (const [slug, target] of Object.entries(MOVE_ALIAS)) {
    if (!table[slug] && table[target]) table[slug] = table[target]
  }
  Object.assign(table, CUSTOM_MOVES)

  // Radical Red's own rebalances win over the mainline numbers.
  for (const [slug, patch] of Object.entries(patches.move ?? {})) {
    const power = Number(patch.power)
    const existing = table[slug]
    table[slug] = {
      ...existing,
      ...(patch.type ? { type: patch.type.toLowerCase() } : {}),
      ...(Number.isFinite(power) && power > 0 ? { power } : {}),
      ...(patch.category ? { category: patch.category.toLowerCase() } : {}),
      ...(existing ? { patched: true } : {}),
      ...(patch.effect ? { effect: patch.effect } : {})
    }
  }
  return table
}

const moveTable = buildMoves()

/* ------------------------------------------------- documented fight order */

/**
 * The community documentation spreadsheet is the only source that gives the
 * order, the location and the level cap of each fight. It is blocked from this
 * build environment, so the relevant sheet is transcribed into
 * scripts/data/fight-order.txt and read from there.
 */
function parseFightOrder() {
  const file = readFileSync(resolve(root, 'scripts/data/fight-order.txt'), 'utf8')
  return file
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line, index) => {
      const [name, cap, location, optional] = line.split('|').map((cell) => cell.trim())
      return {
        order: index,
        name,
        cap: Number(cap) || null,
        location,
        optional: optional === 'optional'
      }
    })
}

/**
 * Docs location names against the route names the run actually uses. Several
 * docs locations are interiors the route data has no step for (Silph Co. sits
 * inside Saffron City), so each maps to a list and the first that exists in
 * the current mode wins.
 */
const DOC_PLACES = {
  'NUGGET BRIDGE': ['Route 24'],
  'DIG HOUSE': ["Diglett's Cave"],
  'GAME CORNER': ['Celadon City'],
  'ROCKET HIDEOUT': ['Celadon City'],
  'CELADON CITY HOTEL': ['Celadon City'],
  'CINNABAR ISLAND LAB': ['Cinnabar Island'],
  'CINNABAR ISLAND GYM': ['Cinnabar Island'],
  'POKEMON MANSION 4F': ['Pokémon Mansion'],
  'POKEMON TOWER': ['Pokémon Tower'],
  'SILPH CO.': ['Saffron City'],
  'ELITE FOUR': ['Indigo Plateau', 'Victory Road'],
  CHAMPION: ['Indigo Plateau', 'Victory Road'],
  'INDIGO PLATEAU': ['Indigo Plateau', 'Victory Road'],
  'S.S. ANNE': ['S.S. Anne', 'Vermilion City'],
  'VERMILLION CITY': ['Vermilion City'],
  'MT. MOON': ['Mt. Moon']
}

/** Docs trainer names against the dump's, where the sheet abbreviates. */
const DOC_TRAINERS = {
  'CATCHER CALE': 'Bug Catcher Cale',
  'BIRD KE. SEBASTIAN': 'Bird Keeper Sebastian',
  'TAMER RAMIRO': 'Dragon Tamer Ramiro',
  'BLACK BELT KETCHUP': '{PK}{MN} Trainer Ketchup',
  'BEAUTY SAM': '{PK}{MN} Trainer Sam',
  'BEAUTY SHELLY': '{PK}{MN} Trainer Shelly',
  'DUMASS KID': 'Dumbass Gian',
  'DUMASS JOJO FAN': 'Dumbass Jojo Fan',
  'DUMASS CREATOR': 'Dumbass Creator',
  'ACE HALEY': 'Lass Haley',
  'ACE COLE': 'Tamer Cole',
  GHOST: 'Channeler Rachel',
  GUARD: 'Gatekeeper Owen',
  'LEFT GUARD': 'Gatekeeper Logan',
  'ACE NELLE': 'Ace Trainer Nelle',
  'ACE WILTON': 'Ace Trainer Wilton'
}

const docKey = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Documented teams indexed by the bare name the sheet's order list uses. */
const docTeamsByKey = new Map()
for (const entry of docTeams) {
  const slot = docTeamsByKey.get(docKey(entry.trainer)) ?? []
  slot.push(entry)
  docTeamsByKey.set(docKey(entry.trainer), slot)
}

/**
 * The order list names a fight by class and given name ("LASS ANNE"); the team
 * pages name it by the given name alone. Whichever form the pages use is the
 * key both sides get counted under.
 */
function docTeamKey(rawName) {
  const mapped = DOC_TRAINERS[rawName] ?? rawName
  for (const form of [mapped, mapped.split(/\s+/).pop() ?? '']) {
    const key = docKey(form)
    if (docTeamsByKey.has(key)) return key
  }
  return null
}

/** Fraction of a documented team that a built fight reproduces. */
function fightOverlap(fight, docEntry) {
  const base = (slug) => slug.split('-')[0].replace(/^\?/, '')
  const theirs = new Set(docEntry.species.map(base))
  const ours = new Set(fight.team.map((mon) => base(mon.slug)))
  const shared = [...theirs].filter((slug) => ours.has(slug)).length
  return shared / Math.max(theirs.size, 1)
}

/**
 * Moves the mini-bosses the documentation places into the run itself, in the
 * documented order, at the documented location, with the documented level cap
 * as the anchor their scaled levels resolve against.
 *
 * Fights the sheet names but this build cannot resolve stay in the browsable
 * list rather than being placed on a guess.
 */
function applyFightOrder(mode, orderedSteps, extraFights, log, placements) {
  const routesByName = new Map()
  for (const step of orderedSteps) {
    if (step.kind === 'route') routesByName.set(docKey(step.name), step)
  }

  const byName = new Map()
  for (const fight of extraFights) {
    for (const label of [`${fight.name} ${fight.trainer}`, fight.trainer]) {
      const slot = byName.get(docKey(label)) ?? []
      slot.push(fight)
      byName.set(docKey(label), slot)
    }
  }

  const order = parseFightOrder()
  const namesOf = (entry) => entry.name.split('&').map((part) => part.trim())

  // Where the sheet lists a name as many times as the team pages show it, the
  // two lists describe the same fights in the same order, so the nth listing
  // and the nth page are the same fight. That is the only thing that tells the
  // two Rocket grunts apart: they share a name, a class and a level cap, and
  // differ only in the team on their page.
  const docSeen = new Map()
  const aligned = new Set()
  for (const entry of order) {
    for (const name of namesOf(entry)) {
      const key = docTeamKey(name)
      if (key) docSeen.set(key, (docSeen.get(key) ?? 0) + 1)
    }
  }
  for (const [key, count] of docSeen) {
    if (docTeamsByKey.get(key).length === count) aligned.add(key)
  }

  const byId = new Map(extraFights.map((fight) => [fight.id, fight]))
  const taken = new Set()
  const nth = new Map()
  const resolve1 = (rawName, slot) => {
    const mapped = DOC_TRAINERS[rawName] ?? rawName
    const key = docTeamKey(rawName)
    const index = key ? (nth.get(key) ?? 0) : 0
    if (key) nth.set(key, index + 1)

    // Both dumps number their trainers alike, so hardcore takes whichever
    // fight normal mode settled on rather than guessing again off teams that
    // its harder rosters have evolved out of recognition.
    const mirrored = byId.get(placements.get(slot))
    if (mirrored && !taken.has(mirrored)) return mirrored

    const docEntry = aligned.has(key) ? docTeamsByKey.get(key)[index] : null

    for (const candidate of [mapped, mapped.replace(/^(ACE|BEAUTY)\s+/i, '')]) {
      const options = (byName.get(docKey(candidate)) ?? []).filter((fight) => !taken.has(fight))
      if (options.length === 0) continue
      if (docEntry) {
        const best = options
          .map((fight) => ({ fight, score: fightOverlap(fight, docEntry) }))
          .sort((a, b) => b.score - a.score)[0]
        if (best.score >= 0.5) return best.fight
      }
      // Otherwise a name like "GRUNT" matches several fights; the sheet only
      // lists the mini-boss tier, so prefer one that scales with the cap.
      return options.find((fight) => fight.scaled) ?? options[0]
    }
    return null
  }

  const placed = []
  for (const entry of order) {
    const candidates = DOC_PLACES[entry.location] ?? [entry.location]
    const place = candidates.map((name) => routesByName.get(docKey(name))).find(Boolean)

    // "LOLA & SHEILA" is two trainers fought back to back in one spot.
    const resolved = namesOf(entry)
      .map((name, index) => ({ slot: `${entry.order}:${index}`, fight: resolve1(name, `${entry.order}:${index}`) }))
      .filter(({ fight }) => fight)

    if (resolved.length === 0 || !place) {
      // Story fights are already in the run under their own entry; only report
      // the ones that should have landed somewhere and did not.
      if (resolved.length > 0 && !place)
        log.unplaced.push(`${mode}: ${entry.name} → ${entry.location}?`)
      continue
    }

    for (const { slot, fight } of resolved) {
      taken.add(fight)
      placements.set(slot, fight.id)
      fight.optional = entry.optional
      fight.docsCap = entry.cap
      placed.push({ fight, place, order: entry.order })
    }
  }

  // Insert each placed fight after its location, keeping documented order.
  const afterStep = new Map()
  for (const { fight, place, order } of placed.sort((a, b) => a.order - b.order)) {
    if (!afterStep.has(place.id)) afterStep.set(place.id, [])
    afterStep.get(place.id).push(fight)
  }

  const merged = []
  for (const step of orderedSteps) {
    merged.push(step)
    for (const fight of afterStep.get(step.id) ?? []) merged.push(fight)
  }

  const placedIds = new Set(placed.map(({ fight }) => fight.id))
  log.placed.push(`${mode}: ${placedIds.size} placed`)
  return { steps: merged, remaining: extraFights.filter((fight) => !placedIds.has(fight.id)) }
}

/* --------------------------------------------------------- rival branches */

const STARTER_FAMILIES = {
  grass: ['bulbasaur', 'ivysaur', 'venusaur'],
  fire: ['charmander', 'charmeleon', 'charizard'],
  water: ['squirtle', 'wartortle', 'blastoise']
}

/** The rival takes the starter that beats yours. */
const PLAYER_FOR_RIVAL = { grass: 'water', fire: 'grass', water: 'fire' }

function starterOf(trainer) {
  const slugs = trainer.team.map((mon) => dumpSlug(mon.species))
  for (const [type, family] of Object.entries(STARTER_FAMILIES)) {
    if (slugs.some((slug) => family.includes(slug))) return type
  }
  return null
}

/**
 * The rival's team depends on which starter you picked, and the dump stores
 * the three branches as consecutive trainers that differ only in that line.
 * Grouping them lets a run show the branch that matches its starter — and
 * incidentally settles rival fights the scorer could never pin down, since it
 * was choosing between three teams that are all "right".
 */
function rivalGroups(mode) {
  const rivals = allTrainers[mode]
    .filter((trainer) => /^(Rival|Champion)\s/.test(trainer.name))
    .map((trainer) => ({ trainer, starter: starterOf(trainer) }))
    .filter((entry) => entry.starter)
    .sort((a, b) => a.trainer.id - b.trainer.id)

  const groups = []
  let current = []
  for (const entry of rivals) {
    const previous = current[current.length - 1]
    const consecutive = previous && entry.trainer.id === previous.trainer.id + 1
    const repeats = current.some((member) => member.starter === entry.starter)
    if (!consecutive || repeats) {
      if (current.length) groups.push(current)
      current = []
    }
    current.push(entry)
  }
  if (current.length) groups.push(current)
  return groups.filter((group) => group.length >= 2)
}

/** Attaches the three starter branches to each rival fight. */
function applyRivalVariants(mode, orderedSteps, log) {
  const groups = rivalGroups(mode)
  const taken = new Set()

  for (const step of orderedSteps) {
    if (step.kind !== 'boss' || step.group !== 'rival') continue
    // Brendan and May do not branch; only the player-named rival does.
    if (!/gary|terry/i.test(step.trainer)) continue

    let best = null
    for (const group of groups) {
      if (taken.has(group)) continue
      const score = Math.max(...group.map((member) => matchScore(step, member.trainer)))
      if (!best || score > best.score) best = { group, score }
    }
    if (!best) continue

    taken.add(best.group)
    step.variants = {}
    for (const member of best.group) {
      const player = PLAYER_FOR_RIVAL[member.starter]
      const team = dumpTeam(member.trainer)
      step.variants[player] = {
        team,
        levelCap: team.reduce((max, mon) => Math.max(max, mon.level), 0),
        scaled: team.some((mon) => mon.offset !== undefined)
      }
    }

    // Default to a branch so the fight still reads sensibly with no starter set.
    const fallback = step.variants.water ?? Object.values(step.variants)[0]
    step.team = fallback.team
    step.levelCap = fallback.levelCap
    step.scaled = fallback.scaled
    step.verified = true
    log.rivals.push(`${mode}: ${step.trainer} @${step.name} → ${Object.keys(step.variants).join('/')}`)
  }
  return orderedSteps
}

/** Placed fights get their scaled levels from the documented cap. */
function resolveDocsLevels(orderedSteps) {
  for (const step of orderedSteps) {
    if (step.kind !== 'boss' || !step.docsCap) continue
    for (const mon of step.team) {
      if (mon.offset !== undefined) mon.level = Math.max(1, step.docsCap + mon.offset)
    }
    step.levelCap = step.team.reduce((max, mon) => Math.max(max, mon.level), 0)
  }
  return orderedSteps
}

const matchLog = { matched: [], unverified: [], placed: [], unplaced: [], rivals: [] }
const dumpAssignments = new Map()

const normalSteps = resolveScaledLevels(
  applyDumpTeams(resolveScaledLevels(buildSteps('normal')), 'normal', matchLog, dumpAssignments)
)
const hardcoreSteps = resolveScaledLevels(
  applyDumpTeams(resolveScaledLevels(buildSteps('hardcore')), 'hardcore', matchLog, dumpAssignments)
)

applyRivalVariants('normal', normalSteps, matchLog)
applyRivalVariants('hardcore', hardcoreSteps, matchLog)

const orderAssignments = new Map()
const normalOrder = applyFightOrder(
  'normal',
  normalSteps,
  buildExtraTrainers('normal', normalSteps),
  matchLog,
  orderAssignments
)
const hardcoreOrder = applyFightOrder(
  'hardcore',
  hardcoreSteps,
  buildExtraTrainers('hardcore', hardcoreSteps),
  matchLog,
  orderAssignments
)

const game = {
  title: 'Radical Red 4.1',
  generatedAt: new Date().toISOString().slice(0, 10),
  moves: moveTable,
  abilities: patches.ability ?? {},
  items: patches.item ?? {},
  // Legacy teams anchor the matching, then the 4.1 rosters replace them, then
  // level resolution runs again for the offsets the new teams brought with them.
  modes: {
    normal: resolveDocsLevels(normalOrder.steps),
    hardcore: resolveDocsLevels(hardcoreOrder.steps)
  },
  extras: { normal: normalOrder.remaining, hardcore: hardcoreOrder.remaining }
}

// A move the calculator cannot price is a fight it will under-report, so the
// build says how many rather than letting them pass silently.
const fightMoves = new Set()
for (const mode of ['normal', 'hardcore']) {
  const teams = [...game.modes[mode].filter((step) => step.kind === 'boss'), ...game.extras[mode]]
  for (const fight of teams) {
    for (const variant of [fight, ...Object.values(fight.variants ?? {})])
      for (const mon of variant.team ?? []) for (const move of mon.moves) fightMoves.add(move)
  }
}
const unpriced = [...fightMoves].filter((move) => !moveTable[move])
matchLog.moves = [
  `${Object.keys(moveTable).length} indexed, ${fightMoves.size - unpriced.length}/${fightMoves.size} on fights priced` +
    (unpriced.length ? ` — missing: ${unpriced.join(', ')}` : '')
]

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
for (const entry of matchLog.placed) console.log('  order:', entry)
for (const entry of matchLog.unplaced) console.log('  unplaced:', entry)
console.log(`  rivals:   ${matchLog.rivals.length} fights carry starter branches`)
for (const entry of matchLog.moves) console.log('  moves:   ', entry)
await writeFile(resolve(cache, 'match-report.json'), JSON.stringify(matchLog, null, 2))

console.log(
  `game.json: ${game.modes.normal.length} normal steps, ${game.modes.hardcore.length} hardcore steps\n` +
    `trainers:  ${game.extras.normal.filter((t) => t.group === 'ace-trainer').length} mini-bosses, ` +
    `${game.extras.normal.filter((t) => t.group === 'trainer').length} route trainers\n` +
    `dex.json:  ${Object.keys(dex).length} species\n` +
    `sprites:   ${downloaded} downloaded, ${failed} missing`
)
