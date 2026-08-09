import { useMemo, useState } from 'react'
import { bst, dex, levelCap, nextBoss, steps } from '../lib/game'
import { actions, PARTY_LIMIT, useRun } from '../lib/store'
import { bestStab, defensiveProfile, multiplierClass, multiplierLabel } from '../lib/types-chart'
import type { Encounter, Status } from '../lib/types'
import { STATUS_META } from '../lib/display'
import { Empty, Sheet, Sprite, TypeBadge, Types } from './ui'
import { EvolvePicker } from './EvolvePicker'

const SECTIONS: { status: Status; title: string }[] = [
  { status: 'party', title: 'Party' },
  { status: 'box', title: 'Box' },
  { status: 'dead', title: 'Graveyard' },
  { status: 'missed', title: 'Missed' }
]

export function TeamScreen() {
  const run = useRun()
  const [open, setOpen] = useState<Encounter | null>(null)
  const cap = levelCap(run)
  const boss = nextBoss(run)

  const locationNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const step of steps(run.mode)) map.set(step.id, step.name)
    return map
  }, [run.mode])

  const byStatus = useMemo(() => {
    const groups: Record<Status, Encounter[]> = { party: [], box: [], dead: [], missed: [] }
    for (const encounter of Object.values(run.encounters)) groups[encounter.status].push(encounter)
    for (const list of Object.values(groups)) list.sort((a, b) => a.at - b.at)
    return groups
  }, [run.encounters])

  const current = open ? run.encounters[open.locId] : null

  return (
    <>
      <header className="topbar">
        <div className="spread">
          <div className="grow">
            <h1>Team</h1>
            <div className="sub">
              {byStatus.party.length}/{PARTY_LIMIT} in party · {byStatus.box.length} boxed ·{' '}
              {byStatus.dead.length} lost
            </div>
          </div>
          {cap ? <span className="chip accent">Cap {cap}</span> : null}
        </div>
      </header>

      <div className="screen">
        {Object.values(run.encounters).length === 0 ? (
          <Empty>
            No catches yet. Log your first encounter on the <strong>Run</strong> tab.
          </Empty>
        ) : null}

        {SECTIONS.map(({ status, title }) => {
          const list = byStatus[status]
          if (list.length === 0) return null
          return (
            <section key={status} className="stack">
              <h2 className="section-title">
                {title} · {list.length}
              </h2>
              {list.map((encounter) => (
                <MemberCard
                  key={encounter.locId}
                  encounter={encounter}
                  where={locationNames.get(encounter.locId) ?? ''}
                  cap={run.rules.levelCap ? cap : null}
                  onOpen={() => setOpen(encounter)}
                />
              ))}
            </section>
          )
        })}

        {byStatus.party.length > 0 && boss ? (
          <section className="stack">
            <h2 className="section-title">Party coverage vs {boss.trainer}</h2>
            <div className="card" style={{ padding: 12 }}>
              {boss.team.map((mon, index) => {
                const best = byStatus.party.reduce(
                  (top, member) =>
                    member.slug ? Math.max(top, bestStab(member.slug, mon.slug)) : top,
                  0
                )
                return (
                  <div key={`${mon.slug}-${index}`} className="spread" style={{ padding: '4px 0' }}>
                    <span className="row" style={{ gap: 8 }}>
                      <Sprite slug={mon.slug} size="sm" />
                      <span className="small">{dex(mon.slug).name}</span>
                    </span>
                    <span className={`mx ${multiplierClass(best)}`} style={{ padding: '4px 10px' }}>
                      {multiplierLabel(best)}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}
      </div>

      {current ? (
        <MemberSheet
          encounter={current}
          where={locationNames.get(current.locId) ?? ''}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  )
}

function MemberCard({
  encounter,
  where,
  cap,
  onOpen
}: {
  encounter: Encounter
  where: string
  cap: number | null
  onOpen: () => void
}) {
  const overCap = cap !== null && encounter.level !== undefined && encounter.level > cap
  const entry = encounter.slug ? dex(encounter.slug) : null
  return (
    <button className={`team-card${overCap ? ' over-cap' : ''}`} onClick={onOpen}>
      {encounter.slug ? (
        <Sprite
          slug={encounter.slug}
          className={encounter.status === 'dead' ? 'dead-sprite' : ''}
        />
      ) : (
        <span className="slot">✖</span>
      )}
      <span className="grow truncate">
        <span className="row" style={{ gap: 6 }}>
          <strong className="truncate">{encounter.nickname || entry?.name || 'Skipped'}</strong>
          {encounter.nickname && entry ? (
            <span className="tiny dim truncate">{entry.name}</span>
          ) : null}
        </span>
        <span className="row tiny muted" style={{ gap: 6 }}>
          {where}
          {encounter.slug ? <Types slug={encounter.slug} /> : null}
        </span>
      </span>
      <span style={{ textAlign: 'right' }}>
        {encounter.level ? (
          <span className={`level-pill${overCap ? ' warn' : ''}`} style={{ color: overCap ? 'var(--warn)' : undefined }}>
            Lv {encounter.level}
          </span>
        ) : null}
        <div className="tiny dim">{STATUS_META[encounter.status].label}</div>
      </span>
    </button>
  )
}

function MemberSheet({
  encounter,
  where,
  onClose
}: {
  encounter: Encounter
  where: string
  onClose: () => void
}) {
  const entry = encounter.slug ? dex(encounter.slug) : null
  const save = (patch: Partial<Encounter>) => actions.updateEncounter(encounter.locId, patch)

  return (
    <Sheet title={encounter.nickname || entry?.name || 'Encounter'} subtitle={where} onClose={onClose}>
      {entry && encounter.slug ? (
        <div className="row">
          <Sprite slug={encounter.slug} size="lg" />
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{entry.name}</div>
            <Types slug={encounter.slug} />
            <div className="tiny dim" style={{ marginTop: 4 }}>
              BST {bst(encounter.slug)} · Gen {entry.gen}
              {entry.patched ? ' · Radical Red changes' : ''}
            </div>
          </div>
        </div>
      ) : null}

      <div className="status-picker">
        {SECTIONS.map(({ status }) => (
          <button
            key={status}
            data-status={status}
            aria-pressed={encounter.status === status}
            onClick={() => save({ status })}
          >
            <span aria-hidden>{STATUS_META[status].glyph}</span>
            {STATUS_META[status].label}
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <input
          className="grow"
          placeholder="Nickname"
          value={encounter.nickname ?? ''}
          onChange={(event) => save({ nickname: event.target.value || undefined })}
        />
        <input
          style={{ width: 88 }}
          placeholder="Lv"
          inputMode="numeric"
          pattern="[0-9]*"
          value={encounter.level ? String(encounter.level) : ''}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 3)
            save({ level: digits ? Number(digits) : undefined })
          }}
        />
      </div>

      {encounter.slug ? (
        <EvolvePicker slug={encounter.slug} onChange={(next) => save({ slug: next })} />
      ) : null}

      {encounter.slug ? (
        <section className="stack">
          <h2 className="section-title">Takes damage from</h2>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {defensiveProfile(encounter.slug).map(({ type, value }) => (
              <span key={type} className={`mx ${multiplierClass(value)}`} style={{ padding: '4px 8px' }}>
                <TypeBadge type={type} /> {multiplierLabel(value)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <button
        className="btn danger block"
        onClick={() => {
          actions.clearEncounter(encounter.locId)
          onClose()
        }}
      >
        Remove from run
      </button>
    </Sheet>
  )
}
