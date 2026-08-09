export type Slug = string

export interface Stats {
  hp: number
  atk: number
  def: number
  spa: number
  spd: number
  spe: number
}

export interface DexEntry {
  name: string
  dex: number
  types: string[]
  gen: number
  family: number
  stats: Partial<Stats>
  /** Radical Red original species (Seviian forms, custom megas). */
  fakemon?: boolean
  /** Stats or typing differ from the mainline games. */
  patched?: boolean
}

export interface RouteStep {
  kind: 'route'
  id: string
  name: string
  encounters: Slug[]
}

export interface BossMon {
  slug: Slug
  level: number
  /** Set when the level is derived from the cap, e.g. -2 means "cap − 2". */
  offset?: number
  ability: string | null
  held: string | null
  moves: string[]
}

export type BossGroup = 'gym-leader' | 'elite-four' | 'rival' | 'evil-team' | 'mini-boss' | 'boss'

export interface BossStep {
  kind: 'boss'
  id: string
  key: string
  name: string
  trainer: string
  group: BossGroup
  speciality: string | null
  /** True when this fight's levels track your badge cap rather than being fixed. */
  scaled: boolean
  /** The cap the scaled levels were resolved against. */
  anchorCap?: number
  levelCap: number
  team: BossMon[]
}

export type Step = RouteStep | BossStep
export type Mode = 'normal' | 'hardcore'

export interface Game {
  title: string
  generatedAt: string
  moves: Record<string, { power?: string; type?: string; effect?: string }>
  abilities: Record<string, { name: string; effect: string }>
  items: Record<string, { name: string; sprite: string; effect: string }>
  modes: Record<Mode, Step[]>
}

/** Where a logged encounter ended up. */
export type Status = 'party' | 'box' | 'dead' | 'missed'

export interface Encounter {
  locId: string
  /** Absent when a route was skipped without meeting anything. */
  slug?: Slug
  nickname?: string
  level?: number
  status: Status
  at: number
}

export interface Rules {
  /** Dupes clause: warn when a species family has already been caught. */
  dupes: boolean
  /** Flag party members above the next boss's ace level. */
  levelCap: boolean
  /** Hardcore: no items in battle, set mode — shown as a reminder only. */
  hardcore: boolean
}

export interface Run {
  v: 1
  id: string
  name: string
  mode: Mode
  rules: Rules
  encounters: Record<string, Encounter>
  defeated: Record<string, boolean>
  startedAt: number
  updatedAt: number
}
