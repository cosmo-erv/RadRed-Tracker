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
    const team = (boss?.pokemon ?? []).map((mon) => ({
      slug: mon.name,
      level: Number(mon.level) || 0,
      ability: mon.ability || null,
      held: mon.held || null,
      moves: (mon.moves ?? []).filter(Boolean)
    }))
    return {
      kind: 'boss',
      id: `boss:${key}:${index}`,
      key,
      name: fixSpelling(step.name),
      trainer: fixSpelling(boss?.name ?? step.boss ?? 'Trainer'),
      group: step.group ?? 'boss',
      speciality: boss?.speciality ?? null,
      levelCap: team.reduce((max, mon) => Math.max(max, mon.level), 0),
      team
    }
  })
}

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const game = {
  title: 'Radical Red 4.1',
  generatedAt: new Date().toISOString().slice(0, 10),
  moves: patches.move ?? {},
  abilities: patches.ability ?? {},
  items: patches.item ?? {},
  modes: {
    normal: buildSteps('normal'),
    hardcore: buildSteps('hardcore')
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
  `game.json: ${game.modes.normal.length} normal steps, ${game.modes.hardcore.length} hardcore steps\n` +
    `dex.json:  ${Object.keys(dex).length} species\n` +
    `sprites:   ${downloaded} downloaded, ${failed} missing`
)
