import { useEffect, useMemo, useState } from 'react'
import { extras, isBoss, steps } from '../lib/game'
import { actions, useRun } from '../lib/store'
import type { BossGroup, BossStep } from '../lib/types'
import { GROUP_COLORS, GROUP_LABELS } from '../lib/display'
import { BossSheet } from './BossSheet'
import { Sprite } from './ui'

/** "story" is every fight the run walks through; the rest are browsable. */
type Filter = 'story' | BossGroup

const FILTERS: Filter[] = [
  'story',
  'ace-trainer',
  'gym-leader',
  'elite-four',
  'rival',
  'evil-team',
  'mini-boss',
  'trainer'
]

const FILTER_LABELS: Record<Filter, string> = { ...GROUP_LABELS, story: 'Story' }

const NOTES: Partial<Record<Filter, string>> = {
  'ace-trainer':
    'The fights built to end runs: Ace Trainers and every trainer whose levels scale with your badge cap, whatever their class — Super Nerd Miguel by the Mt. Moon fossils is one. No source lists where each stands, so they are not placed on the map.',
  'mini-boss': 'The Johto leaders, placed in the run where you meet them.',
  trainer:
    'Ordinary trainers, sorted by level. “Before X” is inferred from their team’s level, not from where they actually stand.'
}

/** Rows rendered before the list asks you to load more. */
const PAGE = 60

export function BossScreen() {
  const run = useRun()
  const [filter, setFilter] = useState<Filter>('story')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<BossStep | null>(null)

  const fights = useMemo(
    () => [...steps(run.mode).filter(isBoss), ...extras(run.mode)],
    [run.mode]
  )

  const term = query.trim().toLowerCase()

  // Searching looks across every fight, not just the selected filter: the
  // trainer you have just walked into is exactly the one you cannot classify.
  const matches = useMemo(() => {
    if (term)
      return fights.filter(
        (fight) =>
          fight.trainer.toLowerCase().includes(term) ||
          fight.name.toLowerCase().includes(term) ||
          fight.team.some((mon) => mon.slug.includes(term))
      )
    return fights.filter((fight) =>
      filter === 'story' ? !fight.optional : fight.group === filter
    )
  }, [fights, filter, term])

  useEffect(() => setLimit(PAGE), [filter, query])

  const story = fights.filter((fight) => !fight.optional)
  const miniBosses = fights.filter((fight) => fight.group === 'ace-trainer').length
  const beaten = story.filter((fight) => run.defeated[fight.id]).length
  const visible = matches.slice(0, limit)

  return (
    <>
      <header className="topbar">
        <h1>Fights</h1>
        <div className="sub">
          {beaten}/{story.length} story fights beaten · {miniBosses} mini-bosses ·{' '}
          {run.mode === 'hardcore' ? 'Hardcore' : 'Normal'}
        </div>
      </header>

      <div className="screen">
        <input
          type="search"
          inputMode="search"
          placeholder="Search trainer, place or Pokémon…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="scroller filters">
          {FILTERS.map((value) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {FILTER_LABELS[value]}
            </button>
          ))}
        </div>

        {term ? (
          <p className="tiny dim" style={{ margin: 0 }}>
            Searching every fight, including route trainers.
          </p>
        ) : NOTES[filter] ? (
          <p className="tiny dim" style={{ margin: 0 }}>
            {NOTES[filter]}
          </p>
        ) : null}

        <div className="stack">
          {visible.map((fight) => (
            <div
              key={fight.id}
              className={`step boss${run.defeated[fight.id] ? ' done' : ''}`}
              style={{ ['--group' as string]: GROUP_COLORS[fight.group] }}
            >
              <button
                className={`tickbox${run.defeated[fight.id] ? ' on' : ''}`}
                aria-pressed={Boolean(run.defeated[fight.id])}
                aria-label={`Mark ${fight.trainer} beaten`}
                onClick={() => actions.toggleDefeated(fight.id)}
              >
                ✓
              </button>
              <button
                className="grow truncate"
                style={{ textAlign: 'left' }}
                onClick={() => setOpen(fight)}
              >
                <span className="title truncate" style={{ display: 'block' }}>
                  {fight.trainer}
                </span>
                <span className="meta truncate" style={{ display: 'block' }}>
                  {fight.name} · {fight.team.length} Pokémon
                  {fight.levelCap ? ` · Lv ${fight.levelCap}` : ''}
                  {fight.scaled && !fight.levelCap ? ' · at your cap' : ''}
                  {fight.segment ? ` · before ${fight.segment}` : ''}
                  {fight.verified === false ? ' · 4.0 data' : ''}
                </span>
              </button>
              <span className="row" style={{ gap: 2 }}>
                {fight.team.slice(0, 3).map((mon, index) => (
                  <Sprite key={`${mon.slug}-${index}`} slug={mon.slug} size="sm" />
                ))}
              </span>
            </div>
          ))}

          {matches.length === 0 ? <p className="empty">No fights match that.</p> : null}

          {matches.length > visible.length ? (
            <button className="btn block" onClick={() => setLimit((value) => value + PAGE)}>
              Show more ({matches.length - visible.length} left)
            </button>
          ) : null}
        </div>
      </div>

      {open ? <BossSheet step={open} onClose={() => setOpen(null)} /> : null}
    </>
  )
}
