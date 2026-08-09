import { dex } from './game'
import type { Slug } from './types'

export const TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy'
] as const

export type PokeType = (typeof TYPES)[number]

export const TYPE_COLORS: Record<string, string> = {
  normal: '#9fa19f',
  fire: '#e8622a',
  water: '#3a8ce0',
  electric: '#e5c229',
  grass: '#57ab4a',
  ice: '#57c8d6',
  fighting: '#c6432f',
  poison: '#9a4a9a',
  ground: '#cba54a',
  flying: '#8fa8e8',
  psychic: '#e0518a',
  bug: '#8fac2a',
  rock: '#b09a4a',
  ghost: '#6a5a9a',
  dragon: '#5a45c6',
  dark: '#6a5548',
  steel: '#7a9aa8',
  fairy: '#e07ac2'
}

/** Only non-1× matchups; everything else is neutral. */
const CHART: Record<string, Record<string, number>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: {
    fire: 0.5,
    water: 2,
    grass: 0.5,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    bug: 0.5,
    rock: 2,
    dragon: 0.5,
    steel: 0.5
  },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: {
    normal: 2,
    ice: 2,
    poison: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2,
    ghost: 0,
    dark: 2,
    steel: 2,
    fairy: 0.5
  },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: {
    fire: 0.5,
    grass: 2,
    fighting: 0.5,
    poison: 0.5,
    flying: 0.5,
    psychic: 2,
    ghost: 0.5,
    dark: 2,
    steel: 0.5,
    fairy: 0.5
  },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
}

/** Damage multiplier of one attacking type against a defending type combo. */
export function effectiveness(attack: string, defenders: string[]): number {
  return defenders.reduce((total, type) => total * (CHART[attack]?.[type] ?? 1), 1)
}

/** Best same-type-attack multiplier `attacker` can land on `defender`. */
export function bestStab(attacker: Slug, defender: Slug): number {
  const defenderTypes = dex(defender).types
  return dex(attacker).types.reduce(
    (best, type) => Math.max(best, effectiveness(type, defenderTypes)),
    0
  )
}

/** How every attacking type fares against this species. */
export function defensiveProfile(slug: Slug): { type: string; value: number }[] {
  const defenders = dex(slug).types
  return TYPES.map((type) => ({ type, value: effectiveness(type, defenders) })).filter(
    (row) => row.value !== 1
  )
}

export function multiplierLabel(value: number): string {
  if (value === 0) return '0×'
  if (value === 0.25) return '¼×'
  if (value === 0.5) return '½×'
  if (value === 1) return '1×'
  return `${value}×`
}

export function multiplierClass(value: number): string {
  if (value === 0) return 'mx-immune'
  if (value < 1) return 'mx-resist'
  if (value > 2) return 'mx-super2'
  if (value > 1) return 'mx-super'
  return 'mx-neutral'
}
