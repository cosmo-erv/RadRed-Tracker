import { useMemo, useState } from 'react'
import { isBoss, steps } from '../lib/game'
import { actions, useRun } from '../lib/store'
import type { BossGroup, BossStep } from '../lib/types'
import { GROUP_COLORS, GROUP_LABELS } from '../lib/display'
import { BossSheet } from './BossSheet'
import { Sprite } from './ui'

const GROUPS: (BossGroup | 'all')[] = [
  'all',
  'gym-leader',
  'elite-four',
  'rival',
  'evil-team',
  'mini-boss'
]

export function BossScreen() {
  const run = useRun()
  const [group, setGroup] = useState<BossGroup | 'all'>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<BossStep | null>(null)

  const bosses = useMemo(() => steps(run.mode).filter(isBoss), [run.mode])
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return bosses.filter(
      (boss) =>
        (group === 'all' || boss.group === group) &&
        (!term ||
          boss.trainer.toLowerCase().includes(term) ||
          boss.name.toLowerCase().includes(term))
    )
  }, [bosses, group, query])

  const beaten = bosses.filter((boss) => run.defeated[boss.id]).length

  return (
    <>
      <header className="topbar">
        <h1>Bosses</h1>
        <div className="sub">
          {beaten} of {bosses.length} beaten · {run.mode === 'hardcore' ? 'Hardcore' : 'Normal'}{' '}
          teams
        </div>
      </header>

      <div className="screen">
        <input
          type="search"
          inputMode="search"
          placeholder="Search trainer or place…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="scroller filters">
          {GROUPS.map((value) => (
            <button key={value} aria-pressed={group === value} onClick={() => setGroup(value)}>
              {value === 'all' ? 'All' : GROUP_LABELS[value]}
            </button>
          ))}
        </div>

        <div className="stack">
          {visible.map((boss) => (
            <div
              key={boss.id}
              className={`step boss${run.defeated[boss.id] ? ' done' : ''}`}
              style={{ ['--group' as string]: GROUP_COLORS[boss.group] }}
            >
              <button
                className={`tickbox${run.defeated[boss.id] ? ' on' : ''}`}
                aria-pressed={Boolean(run.defeated[boss.id])}
                aria-label={`Mark ${boss.trainer} beaten`}
                onClick={() => actions.toggleDefeated(boss.id)}
              >
                ✓
              </button>
              <button className="grow truncate" style={{ textAlign: 'left' }} onClick={() => setOpen(boss)}>
                <span className="title truncate" style={{ display: 'block' }}>
                  {boss.trainer}
                </span>
                <span className="meta truncate" style={{ display: 'block' }}>
                  {boss.name} · {boss.team.length} Pokémon
                  {boss.levelCap ? ` · Lv ${boss.levelCap}` : ''}
                </span>
              </button>
              <span className="row" style={{ gap: 2 }}>
                {boss.team.slice(0, 3).map((mon, index) => (
                  <Sprite key={`${mon.slug}-${index}`} slug={mon.slug} size="sm" />
                ))}
              </span>
            </div>
          ))}
          {visible.length === 0 ? <p className="empty">No bosses match that.</p> : null}
        </div>
      </div>

      {open ? <BossSheet step={open} onClose={() => setOpen(null)} /> : null}
    </>
  )
}
