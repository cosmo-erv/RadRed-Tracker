import { extras, steps } from './game'
import type { Mode } from './types'

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

export interface PlacementResult {
  placements: Record<string, string>
  placed: number
  unknownTrainers: string[]
  unknownPlaces: string[]
}

/**
 * Turns a pasted list of "where you meet them" into pins.
 *
 * No source reachable from the build has mini-boss locations, so this accepts
 * whatever shape a player can copy out of a guide:
 *
 *   Mt. Moon: Super Nerd Miguel, Lass Ali
 *
 *   Mt. Moon
 *   Super Nerd Miguel
 *   Lass Ali
 *
 * A line naming a location switches context; every other line is read as
 * trainer names for that location. Trainers match on their name with or
 * without the class, so "Miguel" and "Super Nerd Miguel" both land.
 */
export function parsePlacements(text: string, mode: Mode): PlacementResult {
  const places = new Map<string, string>()
  for (const step of steps(mode)) {
    if (step.kind === 'route') places.set(key(step.name), step.id)
  }

  const fights = new Map<string, string>()
  for (const fight of extras(mode)) {
    if (fight.group !== 'ace-trainer') continue
    // Later entries never clobber earlier ones, so duplicate first names keep
    // the first fight rather than silently retargeting.
    for (const label of [`${fight.name} ${fight.trainer}`, fight.trainer]) {
      if (!fights.has(key(label))) fights.set(key(label), fight.id)
    }
  }

  const placements: Record<string, string> = {}
  const unknownTrainers: string[] = []
  const unknownPlaces: string[] = []
  let current: string | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*•\d.\s]+/, '')
    if (!line) continue

    const [head, ...rest] = line.split(':')
    const inlinePlace = places.get(key(head))
    if (inlinePlace) {
      current = inlinePlace
      const trailing = rest.join(':').trim()
      if (!trailing) continue
      for (const name of trailing.split(/[,;/]+/)) claim(name)
      continue
    }

    // A bare line that looks like a location but is not one is worth reporting:
    // silently reading it as a trainer name would scatter the pins.
    if (rest.length > 0 && !fights.has(key(head))) {
      unknownPlaces.push(head.trim())
      current = null
      continue
    }

    for (const name of line.split(/[,;/]+/)) claim(name)
  }

  function claim(rawName: string) {
    const name = rawName.trim()
    if (!name) return
    const fightId = fights.get(key(name))
    if (!fightId) {
      unknownTrainers.push(name)
      return
    }
    if (current) placements[fightId] = current
  }

  return {
    placements,
    placed: Object.keys(placements).length,
    unknownTrainers,
    unknownPlaces
  }
}
