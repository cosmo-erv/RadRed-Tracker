import gameJson from '../data/game.json'
import dexJson from '../data/dex.json'
import type { BossStep, DexEntry, Game, Mode, Run, Slug, Step } from './types'

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

export const bst = (slug: Slug) =>
  Object.values(dex(slug).stats).reduce((sum, value) => sum + (value ?? 0), 0)

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
  return boss && boss.levelCap > 0 ? boss.levelCap : null
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
