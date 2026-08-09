import { useMemo, useState } from 'react'
import { dex, extras, isBoss, levelCap, nextBoss, progress, steps } from '../lib/game'
import { actions, useRun } from '../lib/store'
import type { BossStep, Encounter, RouteStep, Step } from '../lib/types'
import { GROUP_COLORS, GROUP_LABELS, STATUS_META } from '../lib/display'
import { EncounterSheet } from './EncounterSheet'
import { BossSheet } from './BossSheet'
import { Sprite } from './ui'

type Filter = 'all' | 'todo' | 'bosses'

export function RunScreen() {
  const run = useRun()
  const [filter, setFilter] = useState<Filter>('all')
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

  const visible = useMemo(() => {
    if (filter === 'bosses') return ordered.filter(isBoss)
    if (filter === 'todo')
      return ordered.filter((step) =>
        isBoss(step) ? !run.defeated[step.id] : !run.encounters[step.id]
      )
    return ordered
  }, [ordered, filter, run])

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
            <p className="empty">Nothing left here — try another filter.</p>
          ) : null}
        </div>

        {filter !== 'todo' && unplaced.length > 0 ? (
          <section className="stack">
            <h2 className="section-title">Mini-bosses · not placed yet</h2>
            <p className="tiny dim" style={{ margin: 0 }}>
              No source lists where these stand. Open one and pin it to the place you met it and it
              will sit there in the run from then on.
            </p>
            {unplaced.slice(0, shown).map((fight) => (
              <BossRow
                key={fight.id}
                step={fight}
                defeated={Boolean(run.defeated[fight.id])}
                isNext={false}
                onOpen={() => setOpenBoss(fight)}
              />
            ))}
            {unplaced.length > shown ? (
              <button className="btn block" onClick={() => setShown((value) => value + 20)}>
                Show more ({unplaced.length - shown} left)
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
  return (
    <button className="step" onClick={onOpen}>
      <EncounterSlot encounter={encounter} />
      <span className="grow truncate">
        <span className="title truncate" style={{ display: 'block' }}>
          {step.name}
        </span>
        <span className="meta truncate" style={{ display: 'block' }}>
          {encounter
            ? `${encounter.slug ? dex(encounter.slug).name : 'No encounter'}${
                encounter.nickname ? ` “${encounter.nickname}”` : ''
              } · ${meta?.label}`
            : `${step.encounters.length} possible encounters`}
        </span>
      </span>
      <span className="dim" aria-hidden>
        ›
      </span>
    </button>
  )
}

function EncounterSlot({ encounter }: { encounter?: Encounter }) {
  if (!encounter) return <span className="slot">+</span>
  if (!encounter.slug) return <span className="slot filled">✖</span>
  return (
    <span className={`slot filled${encounter.status === 'dead' ? ' dead' : ''}`}>
      <Sprite slug={encounter.slug} size="sm" />
    </span>
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
        </span>
        <span className="meta truncate" style={{ display: 'block' }}>
          {GROUP_LABELS[step.group]} · {step.name}
          {step.levelCap ? ` · Lv ${step.levelCap}` : ''}
          {step.verified === false ? ' · 4.0 data' : ''}
        </span>
      </button>
      <span className="row" style={{ gap: 4 }}>
        {step.team.slice(0, 3).map((mon, index) => (
          <Sprite key={`${mon.slug}-${index}`} slug={mon.slug} size="sm" />
        ))}
      </span>
    </div>
  )
}
