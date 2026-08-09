import { useState } from 'react'
import { GAME, dex, label, steps } from '../lib/game'
import { actions, useRun } from '../lib/store'
import { bestStab, multiplierClass, multiplierLabel } from '../lib/types-chart'
import type { BossMon, BossStep, Encounter } from '../lib/types'
import { GROUP_LABELS } from '../lib/display'
import { Sheet, Sprite, TypeBadge, Types } from './ui'

type Tab = 'team' | 'matchup'

export function BossSheet({ step, onClose }: { step: BossStep; onClose: () => void }) {
  const run = useRun()
  const [tab, setTab] = useState<Tab>('team')

  const yours = Object.values(run.encounters)
    .filter((encounter) => encounter.status === 'party' || encounter.status === 'box')
    .sort((a, b) => (a.status === b.status ? a.at - b.at : a.status === 'party' ? -1 : 1))

  return (
    <Sheet
      title={step.trainer}
      subtitle={
        <span className="row" style={{ gap: 6 }}>
          {step.speciality ? <TypeBadge type={step.speciality} /> : null}
          {GROUP_LABELS[step.group]}
          {/* Ace Trainers carry no location, so their name is just the group. */}
          {step.name && step.name !== GROUP_LABELS[step.group] ? ` · ${step.name}` : ''}
          {step.levelCap ? ` · Level cap ${step.levelCap}` : ''}
          {step.scaled ? ' · scales with your cap' : ''}
        </span>
      }
      onClose={onClose}
    >
      {step.optional ? <PlaceInRun step={step} /> : null}

      {step.verified === false ? (
        <p className="tiny" style={{ margin: 0, color: 'var(--warn)' }}>
          This roster is still the older 4.0 data — it could not be matched to a 4.1 fight, so
          check it in-game before you plan around it.
        </p>
      ) : null}

      <div className="scroller filters">
        <button aria-pressed={tab === 'team'} onClick={() => setTab('team')}>
          Their team ({step.team.length})
        </button>
        <button aria-pressed={tab === 'matchup'} onClick={() => setTab('matchup')}>
          Matchups
        </button>
      </div>

      {tab === 'team' ? (
        <div className="card">
          {step.team.map((mon, index) => (
            <BossMonCard key={`${mon.slug}-${index}`} mon={mon} />
          ))}
        </div>
      ) : (
        <MatchupGrid team={step.team} yours={yours} />
      )}
    </Sheet>
  )
}

/**
 * Mini-bosses have no location in any source, so the run pins them by hand.
 * A plain select is the right control here — iOS gives it a native wheel.
 */
function PlaceInRun({ step }: { step: BossStep }) {
  const run = useRun()
  const placed = run.placements[step.id] ?? ''
  const places = steps(run.mode).filter((entry) => entry.kind === 'route')

  return (
    <label className="stack" style={{ gap: 6 }}>
      <span className="tiny dim">
        {placed ? 'Placed in your run at' : 'Met this somewhere? Pin it to your run'}
      </span>
      <select
        value={placed}
        onChange={(event) => actions.placeFight(step.id, event.target.value || null)}
      >
        <option value="">Not placed</option>
        {places.map((place) => (
          <option key={place.id} value={place.id}>
            {place.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function BossMonCard({ mon }: { mon: BossMon }) {
  const entry = dex(mon.slug)
  const ability = GAME.abilities[mon.ability ?? '']
  const item = GAME.items[mon.held ?? '']
  return (
    <div className="boss-mon">
      <div style={{ textAlign: 'center' }}>
        <Sprite slug={mon.slug} size="lg" />
        {mon.level > 0 ? <div className="tiny dim">Lv {mon.level}</div> : null}
        {mon.offset !== undefined ? (
          <div className="tiny dim">cap {mon.offset === 0 ? '±0' : mon.offset}</div>
        ) : null}
      </div>
      <div className="grow">
        <div className="spread">
          <strong>{entry.name}</strong>
          <Types slug={mon.slug} />
        </div>
        <div className="tiny muted" style={{ marginTop: 2 }}>
          {mon.ability ? label(ability?.name ?? mon.ability) : 'Unknown ability'}
          {mon.held ? ` · ${label(item?.name ?? mon.held)}` : ''}
        </div>
        {mon.moves.length ? (
          <div className="moves">
            {mon.moves.map((move) => (
              <span key={move} className="move">
                {label(move)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Two reads on one grid: what your Pokémon hit for (its best STAB against each
 * of theirs) and, on the second line, what theirs hits you for.
 */
function MatchupGrid({ team, yours }: { team: BossMon[]; yours: Encounter[] }) {
  if (yours.length === 0)
    return <p className="empty">Log some catches first and your matchups show up here.</p>

  return (
    <div className="stack">
      <div className="matchup-row" style={{ gridTemplateColumns: `minmax(96px, 1.2fr) repeat(${team.length}, 1fr)` }}>
        <span className="tiny dim">You ↓ / Them →</span>
        {team.map((mon, index) => (
          <span key={`${mon.slug}-${index}`} style={{ textAlign: 'center' }}>
            <Sprite slug={mon.slug} size="sm" />
          </span>
        ))}
      </div>

      {yours.map((encounter) => {
        const slug = encounter.slug!
        return (
          <div
            key={encounter.locId}
            className="matchup-row"
            style={{ gridTemplateColumns: `minmax(96px, 1.2fr) repeat(${team.length}, 1fr)` }}
          >
            <span className="row" style={{ gap: 6 }}>
              <Sprite slug={slug} size="sm" />
              <span className="tiny truncate">{encounter.nickname || dex(slug).name}</span>
            </span>
            {team.map((mon, index) => {
              const offence = bestStab(slug, mon.slug)
              const threat = bestStab(mon.slug, slug)
              return (
                <span
                  key={`${mon.slug}-${index}`}
                  className={`mx ${multiplierClass(offence)}`}
                  title={`You hit for ${multiplierLabel(offence)}, they hit for ${multiplierLabel(threat)}`}
                >
                  {multiplierLabel(offence)}
                  <br />
                  <span style={{ opacity: 0.75, fontWeight: 500 }}>
                    ↩ {multiplierLabel(threat)}
                  </span>
                </span>
              )
            })}
          </div>
        )
      })}

      <p className="tiny dim">
        Top number: your best same-type move against them. Bottom: their best against you. Based on
        typing only — abilities, items and coverage moves still decide fights.
      </p>
    </div>
  )
}
