import { useSyncExternalStore } from 'react'
import { starterStepId, starterTypeOf } from './game'
import type { Encounter, Mode, Rules, Run, Starter, Status } from './types'

const KEY = 'radred.run.v1'

/**
 * Some contexts (private browsing, sandboxed frames) hand back a localStorage
 * that throws on use. The run still works in memory there, but it will not
 * survive a reload — the UI says so rather than losing work quietly.
 */
export const storageAvailable = (() => {
  try {
    localStorage.setItem('radred.probe', '1')
    localStorage.removeItem('radred.probe')
    return true
  } catch {
    return false
  }
})()

function freshRun(name = 'My Nuzlocke'): Run {
  const now = Date.now()
  return {
    v: 1,
    id: Math.random().toString(36).slice(2, 10),
    name,
    mode: 'normal',
    rules: { dupes: true, levelCap: true, hardcore: false },
    encounters: {},
    defeated: {},
    placements: {},
    starter: null,
    startedAt: now,
    updatedAt: now
  }
}

function load(): Run {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return freshRun()
    const parsed = JSON.parse(raw) as Run
    if (parsed?.v !== 1) return freshRun()
    return {
      ...freshRun(),
      ...parsed,
      rules: { ...freshRun().rules, ...parsed.rules },
      // Added after the first runs were saved.
      placements: parsed.placements ?? {},
      starter: parsed.starter ?? null
    }
  } catch {
    return freshRun()
  }
}

let run: Run = load()
const listeners = new Set<() => void>()

function commit(next: Run) {
  run = { ...next, updatedAt: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(run))
  } catch {
    // Covered by the storageAvailable banner; the run continues in memory.
  }
  listeners.forEach((listener) => listener())
}

/**
 * Logging your starter is the starter choice — the rival takes the type that
 * beats it, so his fights follow from this without setting it twice.
 */
function starterFor(locId: string, slug?: string) {
  if (!slug || locId !== starterStepId(run.mode)) return null
  return starterTypeOf(slug)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useRun = () => useSyncExternalStore(subscribe, () => run)

export const actions = {
  rename(name: string) {
    commit({ ...run, name })
  },

  setStarter(starter: Starter | null) {
    commit({ ...run, starter })
  },

  setMode(mode: Mode) {
    commit({ ...run, mode })
  },

  setRule<K extends keyof Rules>(rule: K, value: Rules[K]) {
    commit({ ...run, rules: { ...run.rules, [rule]: value } })
  },

  logEncounter(locId: string, patch: Partial<Encounter> & { status: Status }) {
    const existing = run.encounters[locId]
    const encounter: Encounter = {
      ...existing,
      ...patch,
      locId,
      at: existing?.at ?? Date.now()
    }
    commit({
      ...run,
      encounters: { ...run.encounters, [locId]: encounter },
      starter: starterFor(locId, encounter.slug) ?? run.starter
    })
  },

  updateEncounter(locId: string, patch: Partial<Encounter>) {
    const existing = run.encounters[locId]
    if (!existing) return
    const encounter = { ...existing, ...patch }
    commit({
      ...run,
      encounters: { ...run.encounters, [locId]: encounter },
      starter: starterFor(locId, encounter.slug) ?? run.starter
    })
  },

  clearEncounter(locId: string) {
    const encounters = { ...run.encounters }
    delete encounters[locId]
    commit({ ...run, encounters })
  },

  setStatus(locId: string, status: Status) {
    actions.updateEncounter(locId, { status })
  },

  /** Pins a mini-boss to the step you met it at, or unpins with null. */
  placeFight(fightId: string, stepId: string | null) {
    const placements = { ...run.placements }
    if (stepId) placements[fightId] = stepId
    else delete placements[fightId]
    commit({ ...run, placements })
  },

  /** Bulk-pins mini-bosses, e.g. from a pasted list. */
  placeMany(placements: Record<string, string>) {
    commit({ ...run, placements: { ...run.placements, ...placements } })
  },

  toggleDefeated(stepId: string) {
    const defeated = { ...run.defeated }
    if (defeated[stepId]) delete defeated[stepId]
    else defeated[stepId] = true
    commit({ ...run, defeated })
  },

  reset(name = run.name) {
    commit({ ...freshRun(name), mode: run.mode, rules: run.rules })
  },

  replace(next: Run) {
    commit({ ...freshRun(), ...next, v: 1 })
  },

  export(): string {
    return JSON.stringify(run, null, 2)
  },

  import(json: string): { ok: true } | { ok: false; error: string } {
    try {
      const parsed = JSON.parse(json) as Run
      if (!parsed || typeof parsed !== 'object' || !parsed.encounters)
        return { ok: false, error: 'That file does not look like a saved run.' }
      actions.replace(parsed)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not read that file — is it valid JSON?' }
    }
  }
}

/** Party is capped at six, same as the game. */
export const PARTY_LIMIT = 6

export function partyMembers(current: Run) {
  return Object.values(current.encounters)
    .filter((encounter) => encounter.status === 'party')
    .sort((a, b) => a.at - b.at)
}
