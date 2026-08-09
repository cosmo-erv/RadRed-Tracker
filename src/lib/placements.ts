import { extras, steps } from './game'
import type { Mode } from './types'

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

export interface PlacementResult {
  placements: Record<string, string>
  placed: number
  /** Named fights the documented order already puts in the run. */
  alreadyPlaced: number
  /** Lines nothing was recognised in, for the user to eyeball. */
  skipped: string[]
}

/**
 * Turns a pasted list of "where you meet them" into pins.
 *
 * No source reachable from the build has mini-boss locations, so this is
 * deliberately forgiving about shape. It accepts what a guide reads like:
 *
 *   Mt. Moon: Super Nerd Miguel, Lass Ali
 *
 *   Mt. Moon
 *   Super Nerd Miguel
 *
 * and what a spreadsheet gives you when you copy a block of cells, where the
 * columns are tab-separated and may carry levels, Pokémon and notes alongside:
 *
 *   Mt. Moon → Super Nerd Miguel → Thwackey, Bibarel → cap -3
 *
 * Every cell is checked against the known locations and the known fights.
 * A recognised location sets where following trainers land, so column order
 * does not matter, and unrecognised cells are ignored rather than guessed at —
 * a spreadsheet row is mostly cells this app has no opinion about.
 */
export function parsePlacements(text: string, mode: Mode): PlacementResult {
  const places = new Map<string, string>()
  for (const step of steps(mode)) {
    if (step.kind === 'route') places.set(key(step.name), step.id)
  }

  // Fights the documented order already places live in the run itself, so a
  // list naming them needs recognising without being pinned again.
  const settled = new Set<string>()
  for (const step of steps(mode)) {
    if (step.kind !== 'boss') continue
    for (const label of [`${step.name} ${step.trainer}`, step.trainer]) settled.add(key(label))
  }

  const fights = new Map<string, string>()
  for (const fight of extras(mode)) {
    if (fight.group !== 'ace-trainer') continue
    // First entry wins, so a repeated first name keeps the earlier fight
    // instead of being silently retargeted by a later one.
    for (const label of [`${fight.name} ${fight.trainer}`, fight.trainer]) {
      if (!fights.has(key(label))) fights.set(key(label), fight.id)
    }
  }

  const placements: Record<string, string> = {}
  const skipped: string[] = []
  let alreadyPlaced = 0
  let current: string | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const cells = line
      .split(/\t|[:,;/|]/)
      .map((cell) => cell.trim().replace(/^[-*•\d.\s]+/, '').trim())
      .filter(Boolean)

    const place = cells.map((cell) => places.get(key(cell))).find(Boolean)
    if (place) current = place

    let pinned = 0
    for (const cell of cells) {
      if (settled.has(key(cell))) {
        pinned++
        alreadyPlaced++
        continue
      }
      const fightId = fights.get(key(cell))
      if (!fightId) continue
      pinned++
      if (current) placements[fightId] = current
    }

    // A line that named only a place is doing its job. Anything else that
    // pinned nothing is worth showing back — a misspelled or unknown trainer
    // would otherwise vanish into a row full of Pokémon names.
    const placeOnly = place && cells.length === 1
    if (pinned === 0 && !placeOnly && skipped.length < 8) skipped.push(line.slice(0, 60))
  }

  return { placements, placed: Object.keys(placements).length, alreadyPlaced, skipped }
}
