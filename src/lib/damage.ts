import { GAME, dex, statsAt } from './game'
import { effectiveness } from './types-chart'
import type { Slug } from './types'

export interface MoveInfo {
  type: string
  power: number
  category: 'physical' | 'special' | 'status'
  /** Null when the move cannot miss. */
  accuracy?: number | null
  /** Radical Red changed this move's numbers. */
  patched?: boolean
  /** A Radical Red original, entered by hand from its in-game description. */
  custom?: boolean
  effect?: string
}

export const move = (slug: string): MoveInfo | null =>
  (GAME.moves as Record<string, MoveInfo>)[slug] ?? null

export interface Combatant {
  slug: Slug
  level: number
}

export interface Hit {
  /** Move slug, or a type/category pair when this is an estimate. */
  move: string
  info: MoveInfo
  /** Fraction of the defender's HP at the worst and best damage roll. */
  min: number
  max: number
  /** Rolls needed to knock the defender out, at the worst roll. */
  hits: number
  effect: number
  stab: boolean
  /** True when the moveset is unknown and this is a stand-in. */
  estimated?: boolean
}

/**
 * Gen-V onwards damage, the part of it that can be known here: level, base
 * stats at 31 IVs and no EVs, STAB, and the type chart. The 0.85–1.00 roll
 * becomes a min/max pair rather than an average, because a nuzlocke turns on
 * the worst roll, not the middle one.
 *
 * Deliberately outside its scope: abilities, held items, stat stages, weather,
 * screens, terrain and crits. Those are multipliers on top, so a real hit
 * lands at or above `min` far more often than below it — but Levitate or a
 * Choice Band will move a number, and the UI says so.
 */
export function hit(attacker: Combatant, defender: Combatant, info: MoveInfo): Hit | null {
  if (info.category === 'status' || info.power <= 0) return null

  const attackStats = statsAt(attacker.slug, attacker.level)
  const defenceStats = statsAt(defender.slug, defender.level)
  if (!attackStats || !defenceStats) return null

  const attack = info.category === 'physical' ? attackStats.atk : attackStats.spa
  const defence = info.category === 'physical' ? defenceStats.def : defenceStats.spd
  const effect = effectiveness(info.type, dex(defender.slug).types)
  const stab = dex(attacker.slug).types.includes(info.type)
  const label = `${info.type}-${info.category}`

  if (effect === 0) {
    return { move: label, info, min: 0, max: 0, hits: Infinity, effect, stab }
  }

  const base =
    Math.floor(
      Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * info.power * attack) / defence) / 50
    ) + 2
  const scaled = base * (stab ? 1.5 : 1) * effect
  const low = Math.floor(scaled * 0.85)
  const hp = defenceStats.hp

  return {
    move: label,
    info,
    min: low / hp,
    max: Math.floor(scaled) / hp,
    hits: low > 0 ? Math.ceil(hp / low) : Infinity,
    effect,
    stab
  }
}

/** The same, for a move named in the move table. */
export function hitWith(attacker: Combatant, defender: Combatant, slug: string): Hit | null {
  const info = move(slug)
  const result = info && hit(attacker, defender, info)
  return result ? { ...result, move: slug } : null
}

/** The hardest of a set of named moves, judged on its worst roll. */
export function bestOf(attacker: Combatant, defender: Combatant, moves: string[]): Hit | null {
  let best: Hit | null = null
  for (const slug of moves) {
    const result = hitWith(attacker, defender, slug)
    if (result && (!best || result.min > best.min)) best = result
  }
  return best
}

/**
 * What a Pokémon could hit for when its moveset is unknown: an ordinary
 * same-type move of middling power, tried physical and special so the better
 * of its attacking stats is used. A stand-in, flagged as one, until you tell
 * the app which four moves it actually has.
 */
const REFERENCE_POWER = 80

export function estimate(attacker: Combatant, defender: Combatant): Hit | null {
  let best: Hit | null = null
  for (const type of dex(attacker.slug).types) {
    for (const category of ['physical', 'special'] as const) {
      const result = hit(attacker, defender, { type, power: REFERENCE_POWER, category })
      if (result && (!best || result.min > best.min)) best = result
    }
  }
  return best ? { ...best, estimated: true } : null
}

export const percent = (value: number) => `${Math.round(value * 100)}%`

/** How a knockout count reads: 2 rolls is "2HKO". */
export function knockout(result: Hit | null): string {
  if (!result || result.hits === Infinity) return '—'
  if (result.hits === 1) return 'OHKO'
  return `${result.hits}HKO`
}

/**
 * Colour band for a hit, read from how close it is to a knockout — and from
 * whose knockout it is. A two-hit KO is good news when you are dealing it and
 * the reason to switch when you are taking it, so the same number has to read
 * green one way and red the other.
 */
export function hitClass(result: Hit | null, direction: 'dealt' | 'taken' = 'dealt'): string {
  if (!result || result.min === 0) return direction === 'dealt' ? 'mx-immune' : 'mx-safe'
  const severity = result.hits === 1 ? 3 : result.hits <= 2 ? 2 : result.hits >= 5 ? 0 : 1
  if (direction === 'taken') {
    return ['mx-safe', 'mx-neutral', 'mx-danger', 'mx-danger2'][severity]
  }
  return ['mx-resist', 'mx-neutral', 'mx-super', 'mx-super2'][severity]
}
