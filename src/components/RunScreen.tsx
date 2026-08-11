import { useMemo, useState } from 'react'
import { dex, extras, isBoss, levelCap, nextBoss, progress, steps, variantOf } from '../lib/game'
import { actions, useRun } from '../lib/store'
import type { BossStep, Encounter, RouteStep, Step } from '../lib/types'
import { GROUP_COLORS, GROUP_LABELS, STATUS_META } from '../lib/display'
import { EncounterSheet } from './EncounterSheet'
import { BossSheet } from './BossSheet'
import { Sprite } from './ui'

type Filter = 'all' | 'todo' | 'bosses'

/** Matches a step against the search box: its own name, or anything on it. */
function matches(step: Step, query: string, run: ReturnType<typeof useRun>) {
  if (!query) return true
  const haystack: string[] = []
  if (isBoss(step)) {
    haystack.push(step.trainer, step.name, GROUP_LABELS[step.group])
    for (const mon of variantOf(step, run.starter).team) haystack.push(dex(mon.slug).name)
  } else {
    haystack.push(step.name)
    const encounter = run.encounters[step.id]
    if (encounter?.nickname) haystack.push(encounter.nickname)
    // Search the species you could still meet here, not just the one you did.
    for (const slug of encounter?.slug ? [encounter.slug] : step.encounters)
      haystack.push(dex(slug).name)
  }
  return haystack.join(' ').toLowerCase().includes(query)
}

export function RunScreen() {
  const run = useRun()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [openRoute, setOpenRoute] = useState<RouteStep | null>(null)
  const [shown, setShown] = useState(20)
  const [openBoss, setOpenBoss] = useState<BossStep | null>(null)

  const all = steps(run.mode)
  const upcoming = nextBoss(run)
  const cap = levelCap(run)
  const stats = progress(run)

  // Mini-bosses have no location in any source, so they sit where you pinned
  // them and otherwise wait in a group at the end of the run.
  const miniBosses = useMemo(
    () => extras(run.mode).filter((fight) => fight.group === 'ace-trainer'),
    [run.mode]
  )

  const { ordered, unplaced } = useMemo(() => {
    const placedBy = new Map<string, BossStep[]>()
    const waiting: BossStep[] = []
    for (const fight of miniBosses) {
      const stepId = run.placements[fight.id]
      if (!stepId) waiting.push(fight)
      else placedBy.set(stepId, [...(placedBy.get(stepId) ?? []), fight])
    }
    const list: Step[] = []
    for (const step of all) {
      list.push(step)
      for (const fight of placedBy.get(step.id) ?? []) list.push(fight)
    }
    return { ordered: list, unplaced: waiting }
  }, [all, miniBosses, run.placements])

  // The unplaced group is part of the run's list, so the search has to reach
  // it too — a fight you cannot place is exactly one you would search for.
  const unplacedShown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return unplaced.filter((fight) => matches(fight, needle, run))
  }, [unplaced, query, run])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return ordered.filter((step) => {
      if (filter === 'bosses' && !isBoss(step)) return false
      if (filter === 'todo' && (isBoss(step) ? run.defeated[step.id] : run.encounters[step.id]))
        return false
      return matches(step, needle, run)
    })
  }, [ordered, filter, query, run])

  const percent = Math.round((stats.bosses / Math.max(stats.totalBosses, 1)) * 100)

  return (
    <>
      <header className="topbar">
        <div className="spread">
          <div className="grow truncate">
            <h1>{run.name}</h1>
            <div className="sub truncate">
              {upcoming
                ? `Next: ${upcoming.trainer} · ${upcoming.name}`
                : 'Run complete — champion!'}
            </div>
          </div>
          {cap ? (
            <span className="chip accent" title="Level cap for the next boss">
              Cap {cap}
            </span>
          ) : null}
        </div>
      </header>

      <div className="screen">
        <section className="card stack" style={{ padding: 14, gap: 12 }}>
          <div className="progress-bar" aria-hidden>
            <span style={{ width: `${percent}%` }} />
          </div>
          <div className="stats">
            <div>
              <div className="value">
                {stats.gyms}/{stats.totalGyms}
              </div>
              <div className="key">Badges</div>
            </div>
            <div>
              <div className="value">
                {stats.bosses}/{stats.totalBosses}
              </div>
              <div className="key">Bosses</div>
            </div>
            <div>
              <div className="value">{stats.alive}</div>
              <div className="key">Alive</div>
            </div>
            <div>
              <div className="value" style={{ color: stats.deaths ? 'var(--bad)' : undefined }}>
                {stats.deaths}
              </div>
              <div className="key">Deaths</div>
            </div>
          </div>
        </section>

        <input
          type="search"
          value={query}
          placeholder="Find a route, trainer or Pokémon"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="scroller filters">
          {(
            [
              ['all', 'Everything'],
              ['todo', 'To do'],
              ['bosses', 'Bosses']
            ] as [Filter, string][]
          ).map(([value, text]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {text}
            </button>
          ))}
        </div>

        <div className="stack">
          {visible.map((step) =>
            isBoss(step) ? (
              <BossRow
                key={step.id}
                step={step}
                defeated={Boolean(run.defeated[step.id])}
                isNext={upcoming?.id === step.id}
                onOpen={() => setOpenBoss(step)}
              />
            ) : (
              <RouteRow
                key={step.id}
                step={step}
                encounter={run.encounters[step.id]}
                onOpen={() => setOpenRoute(step)}
              />
            )
          )}
          {visible.length === 0 ? (
            <p className="empty">
              {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Nothing left here — try another filter.'}
            </p>
          ) : null}
        </div>

        {filter !== 'todo' && unplacedShown.length > 0 ? (
          <section className="stack">
            <h2 className="section-title">Mini-bosses · not placed yet</h2>
            <p className="tiny dim" style={{ margin: 0 }}>
              No source lists where these stand. Open one and pin it to the place you met it and it
              will sit there in the run from then on.
            </p>
            {unplacedShown.slice(0, shown).map((fight) => (
              <BossRow
                key={fight.id}
                step={fight}
                defeated={Boolean(run.defeated[fight.id])}
                isNext={false}
                onOpen={() => setOpenBoss(fight)}
              />
            ))}
            {unplacedShown.length > shown ? (
              <button className="btn block" onClick={() => setShown((value) => value + 20)}>
                Show more ({unplacedShown.length - shown} left)
              </button>
            ) : null}
          </section>
        ) : null}
      </div>

      {openRoute ? <EncounterSheet step={openRoute} onClose={() => setOpenRoute(null)} /> : null}
      {openBoss ? <BossSheet step={openBoss} onClose={() => setOpenBoss(null)} /> : null}
    </>
  )
}

/**
 * One line per route. The species you caught reads inline rather than needing
 * a tap, which is the difference between scanning the run and walking it.
 */
function RouteRow({
  step,
  encounter,
  onOpen
}: {
  step: RouteStep
  encounter?: Encounter
  onOpen: () => void
}) {
  const meta = encounter ? STATUS_META[encounter.status] : null
  const species = encounter?.slug ? dex(encounter.slug).name : null
  return (
    <button
      className={`step tight${encounter ? ` logged status-${encounter.status}` : ''}`}
      onClick={onOpen}
    >
      {encounter?.slug ? (
        <Sprite
          slug={encounter.slug}
          size="sm"
          className={encounter.status === 'dead' ? 'dead-sprite' : ''}
        />
      ) : (
        <span className="slot sm">{encounter ? '✖' : '+'}</span>
      )}
      <span className="title truncate">{step.name}</span>
      <span className="grow meta truncate" style={{ textAlign: 'right' }}>
        {encounter
          ? encounter.nickname && species
            ? `${encounter.nickname} (${species})`
            : (species ?? 'Skipped')
          : `${step.encounters.length} possible`}
      </span>
      {meta ? <span className={`chip ${meta.tone}`}>{meta.label}</span> : null}
      <span className="dim" aria-hidden>
        ›
      </span>
    </button>
  )
}

function BossRow({
  step,
  defeated,
  isNext,
  onOpen
}: {
  step: BossStep
  defeated: boolean
  isNext: boolean
  onOpen: () => void
}) {
  const run = useRun()
  const shown = variantOf(step, run.starter)
  return (
    <div
      className={`step boss${defeated ? ' done' : ''}`}
      style={{
        ['--group' as string]: GROUP_COLORS[step.group],
        boxShadow: isNext ? '0 0 0 1px var(--accent)' : undefined
      }}
    >
      <button
        className={`tickbox${defeated ? ' on' : ''}`}
        aria-label={defeated ? `Mark ${step.trainer} as not beaten` : `Mark ${step.trainer} beaten`}
        aria-pressed={defeated}
        onClick={() => actions.toggleDefeated(step.id)}
      >
        ✓
      </button>
      <button className="grow truncate" style={{ textAlign: 'left' }} onClick={onOpen}>
        <span className="title truncate" style={{ display: 'block' }}>
          {step.trainer}
          {step.optional ? <span className="chip tiny-chip">optional</span> : null}
        </span>
        <span className="meta truncate" style={{ display: 'block' }}>
          {GROUP_LABELS[step.group]} · {step.name}
          {step.verified === false ? ' · 4.0 data' : ''}
        </span>
      </button>
      {shown.levelCap ? <span className="chip accent">cap {shown.levelCap}</span> : null}
      {/* The whole team, not the first three: knowing what is coming is the
          point of the row. Three to a line keeps six inside a phone's width. */}
      <span className="team-strip">
        {shown.team.map((mon, index) => (
          <Sprite key={`${mon.slug}-${index}`} slug={mon.slug} size="sm" />
        ))}
      </span>
    </div>
  )
}
