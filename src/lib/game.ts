import gameJson from '../data/game.json'
import dexJson from '../data/dex.json'
import type { BossStep, BossVariant, DexEntry, Game, Mode, Run, Slug, Starter, Step } from './types'

export const GAME = gameJson as unknown as Game
export const DEX = dexJson as unknown as Record<Slug, DexEntry>

const UNKNOWN: DexEntry = { name: '???', dex: 0, types: ['normal'], gen: 1, family: 0, stats: {} }

export const dex = (slug: Slug): DexEntry => DEX[slug] ?? UNKNOWN

declare global {
  interface Window {
    /** Single-file builds inline every sprite as a data URI under this map. */
    __SPRITE_DATA__?: Record<string, string>
  }
}

export const spriteUrl = (slug: Slug) =>
  window.__SPRITE_DATA__?.[slug] ?? `${import.meta.env.BASE_URL}sprites/${slug}.png`

export const steps = (mode: Mode): Step[] => GAME.modes[mode]

/** Ace Trainers: boss-tier fights that no source places on the map. */
export const extras = (mode: Mode): BossStep[] => GAME.extras[mode] ?? []

export const isBoss = (step: Step): step is BossStep => step.kind === 'boss'

/** The run's first step, where you log the starter you chose. */
export const starterStepId = (mode: Mode): string | null =>
  steps(mode).find((step) => step.kind === 'route' && step.name === 'Starter')?.id ?? null

/**
 * Which branch a species puts you on. Every Radical Red starter leads with
 * grass, fire or water, so the choice reads straight off its typing — Mudkip
 * counts as water exactly like Squirtle does.
 */
export function starterTypeOf(slug: Slug): Starter | null {
  const first = dex(slug).types[0]
  return first === 'grass' || first === 'fire' || first === 'water' ? first : null
}

/**
 * The team you will actually face. Rival fights carry one roster per starter,
 * because the rival takes the one that beats yours.
 */
export function variantOf(step: BossStep, starter: Starter | null): BossVariant {
  const branch = starter ? step.variants?.[starter] : undefined
  return branch ?? { team: step.team, levelCap: step.levelCap, scaled: step.scaled }
}

export const bst = (slug: Slug) =>
  Object.values(dex(slug).stats).reduce((sum, value) => sum + (value ?? 0), 0)

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const
export type StatKey = (typeof STAT_KEYS)[number]
export const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe'
}

/**
 * What a Pokémon's stats actually read at a level. Assumes 31 IVs, no EVs and
 * a neutral nature — the numbers you get before any training, which is what
 * matters when you are deciding whether something can take a hit.
 */
export function statsAt(slug: Slug, level: number): Record<StatKey, number> | null {
  if (!level || level < 1) return null
  const base = dex(slug).stats
  const out = {} as Record<StatKey, number>
  for (const key of STAT_KEYS) {
    const value = base[key]
    if (value === undefined) return null
    out[key] =
      key === 'hp'
        ? Math.floor(((2 * value + 31) * level) / 100) + level + 10
        : Math.floor(((2 * value + 31) * level) / 100 + 5)
  }
  return out
}

/** Prettifies a kebab-case data slug: `flame-charge` -> `Flame Charge`. */
export const label = (slug?: string | null) =>
  (slug ?? '')
    .split('-')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')

/**
 * The next boss you have not beaten. In a hardcore nuzlocke this fight sets
 * your level cap, so it drives the header, the team screen warnings and the
 * default matchup target.
 */
export function nextBoss(run: Run): BossStep | null {
  for (const step of steps(run.mode)) {
    if (isBoss(step) && !run.defeated[step.id]) return step
  }
  return null
}

export function levelCap(run: Run): number | null {
  const boss = nextBoss(run)
  if (!boss) return null
  const cap = variantOf(boss, run.starter).levelCap
  return cap > 0 ? cap : null
}

export interface Progress {
  bosses: number
  totalBosses: number
  gyms: number
  totalGyms: number
  caught: number
  routes: number
  totalRoutes: number
  deaths: number
  alive: number
}

export function progress(run: Run): Progress {
  const list = steps(run.mode)
  const bosses = list.filter(isBoss)
  // Rematch fights share the gym-leader group but do not hand out badges.
  const gyms = bosses.filter(
    (boss) => boss.group === 'gym-leader' && !/rematch/i.test(boss.trainer)
  )
  const encounters = Object.values(run.encounters)
  return {
    bosses: bosses.filter((boss) => run.defeated[boss.id]).length,
    totalBosses: bosses.length,
    gyms: gyms.filter((boss) => run.defeated[boss.id]).length,
    totalGyms: gyms.length,
    caught: encounters.filter((e) => e.status !== 'missed').length,
    routes: encounters.length,
    totalRoutes: list.length - bosses.length,
    deaths: encounters.filter((e) => e.status === 'dead').length,
    alive: encounters.filter((e) => e.status === 'party' || e.status === 'box').length
  }
}

/**
 * Dupes clause: a species is a duplicate when something from the same
 * evolution family has already been encountered (dead ones still count).
 */
export function familiesCaught(run: Run): Map<number, string> {
  const families = new Map<number, string>()
  for (const encounter of Object.values(run.encounters)) {
    if (encounter.status === 'missed' || !encounter.slug) continue
    const entry = dex(encounter.slug)
    if (!families.has(entry.family)) families.set(entry.family, encounter.slug)
  }
  return families
}
