import { useSyncExternalStore } from 'react'
import { starterStepId, starterTypeOf } from './game'
import type { Encounter, Mode, Rules, Run, Save, Starter, Status } from './types'

const KEY = 'radred.save.v2'
/** Where single-run saves lived before attempts existed. */
const LEGACY_KEY = 'radred.run.v1'

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

const newId = () => Math.random().toString(36).slice(2, 10)

function freshRun(name = 'Attempt 1'): Run {
  const now = Date.now()
  return {
    v: 1,
    id: newId(),
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

/** Fills in fields that were added after a run was first saved. */
function reviveRun(parsed: Run): Run {
  const base = freshRun()
  return {
    ...base,
    ...parsed,
    id: parsed.id || base.id,
    rules: { ...base.rules, ...parsed.rules },
    placements: parsed.placements ?? {},
    starter: parsed.starter ?? null
  }
}

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Save
      const runs = (parsed?.runs ?? []).map(reviveRun)
      if (runs.length > 0) {
        const activeId = runs.some((entry) => entry.id === parsed.activeId)
          ? parsed.activeId
          : runs[0].id
        return { v: 2, activeId, runs }
      }
    }
    // A save from before attempts existed becomes the first attempt.
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const parsed = reviveRun(JSON.parse(legacy) as Run)
      return { v: 2, activeId: parsed.id, runs: [parsed] }
    }
  } catch {
    // Falls through to a clean save rather than stranding the app.
  }
  const first = freshRun()
  return { v: 2, activeId: first.id, runs: [first] }
}

let save: Save = load()
const listeners = new Set<() => void>()

const activeRun = () => save.runs.find((entry) => entry.id === save.activeId) ?? save.runs[0]
let run: Run = activeRun()

function persist() {
  run = activeRun()
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    // Covered by the storageAvailable banner; the run continues in memory.
  }
  listeners.forEach((listener) => listener())
}

// Write the save back in the current shape straight away, so a run migrated
// from the old single-run key is stored as an attempt from its first load
// rather than being re-migrated on every open.
persist()

/** Writes a change to the attempt currently being played. */
function commit(next: Run) {
  const updated = { ...next, updatedAt: Date.now() }
  save = {
    ...save,
    runs: save.runs.map((entry) => (entry.id === updated.id ? updated : entry))
  }
  persist()
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

/** Every attempt, newest last, for the run switcher. */
export const useSave = () => useSyncExternalStore(subscribe, () => save)

export const actions = {
  rename(name: string) {
    commit({ ...run, name })
  },

  /** Switches which attempt is being played. */
  switchRun(id: string) {
    if (!save.runs.some((entry) => entry.id === id)) return
    save = { ...save, activeId: id }
    persist()
  },

  /**
   * Starts another attempt alongside the current one. Difficulty and clauses
   * carry over — you rarely change those between attempts — but nothing else.
   */
  newRun() {
    const created = {
      ...freshRun(`Attempt ${save.runs.length + 1}`),
      mode: run.mode,
      rules: run.rules
    }
    save = { v: 2, activeId: created.id, runs: [...save.runs, created] }
    persist()
  },

  /** Removes an attempt. The last one standing is kept and emptied instead. */
  deleteRun(id: string) {
    if (save.runs.length <= 1) {
      actions.reset()
      return
    }
    const runs = save.runs.filter((entry) => entry.id !== id)
    save = { v: 2, runs, activeId: id === save.activeId ? runs[runs.length - 1].id : save.activeId }
    persist()
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

  /** Bumps a Pokémon's KO tally; never below zero. */
  addKo(locId: string, delta: number) {
    const existing = run.encounters[locId]
    if (!existing) return
    actions.updateEncounter(locId, { kos: Math.max(0, (existing.kos ?? 0) + delta) })
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

  /** Empties the current attempt in place, keeping its name and slot. */
  reset(name = run.name) {
    commit({ ...freshRun(name), id: run.id, mode: run.mode, rules: run.rules })
  },

  replace(next: Run) {
    commit({ ...freshRun(), ...next, id: run.id, v: 1 })
  },

  /** Exports every attempt, so one file is the whole tracker. */
  export(): string {
    return JSON.stringify(save, null, 2)
  },

  /**
   * Takes either shape: a whole save from this version, or a single run from
   * before attempts existed. Imported attempts are added rather than replacing
   * what is already here, so a file cannot silently wipe a run in progress.
   */
  import(json: string): { ok: true; added: number } | { ok: false; error: string } {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return { ok: false, error: 'Could not read that file — is it valid JSON?' }
    }
    if (!parsed || typeof parsed !== 'object')
      return { ok: false, error: 'That file does not look like a saved run.' }

    const incoming = (parsed as Save).runs ?? [parsed as Run]
    const runs = incoming.filter((entry) => entry && typeof entry === 'object' && entry.encounters)
    if (runs.length === 0) return { ok: false, error: 'That file does not look like a saved run.' }

    // Re-key on the way in: an attempt imported twice should not collide with
    // the copy already here.
    const taken = new Set(save.runs.map((entry) => entry.id))
    const added = runs.map((entry) => {
      const revived = reviveRun(entry)
      return taken.has(revived.id) ? { ...revived, id: newId() } : revived
    })
    save = { v: 2, runs: [...save.runs, ...added], activeId: added[0].id }
    persist()
    return { ok: true, added: added.length }
  }
}

/** Party is capped at six, same as the game. */
export const PARTY_LIMIT = 6

export function partyMembers(current: Run) {
  return Object.values(current.encounters)
    .filter((encounter) => encounter.status === 'party')
    .sort((a, b) => a.at - b.at)
}
