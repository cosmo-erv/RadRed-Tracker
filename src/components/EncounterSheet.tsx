import { useMemo, useState } from 'react'
import { DEX, dex, familiesCaught } from '../lib/game'
import { actions, PARTY_LIMIT, partyMembers, useRun } from '../lib/store'
import type { RouteStep, Slug, Status } from '../lib/types'
import { STATUS_META } from '../lib/display'
import { Sheet, Sprite, Types } from './ui'

const STATUS_ORDER: Status[] = ['party', 'box', 'dead', 'missed']

export function EncounterSheet({ step, onClose }: { step: RouteStep; onClose: () => void }) {
  const run = useRun()
  const existing = run.encounters[step.id]

  const [slug, setSlug] = useState<Slug | null>(existing?.slug ?? null)
  const [status, setStatus] = useState<Status>(existing?.status ?? 'party')
  const [nickname, setNickname] = useState(existing?.nickname ?? '')
  const [level, setLevel] = useState(existing?.level ? String(existing.level) : '')
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const families = useMemo(() => familiesCaught(run), [run])
  const partyFull = partyMembers(run).length >= PARTY_LIMIT && existing?.status !== 'party'

  const options = useMemo(() => {
    const base = showAll ? Object.keys(DEX) : step.encounters
    const term = query.trim().toLowerCase()
    const list = term
      ? base.filter((option) => dex(option).name.toLowerCase().includes(term))
      : base
    return showAll ? list.slice(0, 120) : list
  }, [showAll, query, step.encounters])

  const isDupe = (option: Slug) => {
    if (!run.rules.dupes) return false
    const owner = families.get(dex(option).family)
    return Boolean(owner) && owner !== existing?.slug
  }

  const save = () => {
    if (!slug) return
    actions.logEncounter(step.id, {
      slug,
      status,
      nickname: nickname.trim() || undefined,
      level: level ? Number(level) : undefined
    })
    onClose()
  }

  return (
    <Sheet
      title={step.name}
      subtitle={`${step.encounters.length} possible encounters`}
      onClose={onClose}
    >
      <div className="row" style={{ gap: 8 }}>
        <input
          className="grow"
          type="search"
          inputMode="search"
          placeholder={showAll ? 'Search all species…' : 'Search this route…'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="btn small"
          aria-pressed={showAll}
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? 'Route' : 'All'}
        </button>
      </div>

      <div className="mon-grid">
        {options.map((option) => {
          const dupe = isDupe(option)
          return (
            <button
              key={option}
              className={`mon-tile${dupe ? ' dupe' : ''}`}
              aria-pressed={slug === option}
              onClick={() => setSlug(option)}
            >
              <Sprite slug={option} />
              <span className="name">{dex(option).name}</span>
              {dupe ? <span className="dupe-flag">DUPE</span> : null}
            </button>
          )
        })}
        {options.length === 0 ? (
          <p className="empty" style={{ gridColumn: '1 / -1' }}>
            Nothing matches “{query}”.
          </p>
        ) : null}
      </div>

      {slug ? (
        <div className="card stack" style={{ padding: 12, gap: 12 }}>
          <div className="row">
            <Sprite slug={slug} size="lg" />
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{dex(slug).name}</div>
              <Types slug={slug} />
              {isDupe(slug) ? (
                <div className="tiny" style={{ color: 'var(--warn)', marginTop: 4 }}>
                  Dupes clause: you already have {dex(families.get(dex(slug).family)!).name}
                </div>
              ) : null}
            </div>
          </div>

          <div className="status-picker">
            {STATUS_ORDER.map((option) => (
              <button
                key={option}
                data-status={option}
                aria-pressed={status === option}
                disabled={option === 'party' && partyFull}
                onClick={() => setStatus(option)}
              >
                <span aria-hidden>{STATUS_META[option].glyph}</span>
                {STATUS_META[option].label}
              </button>
            ))}
          </div>
          {partyFull ? <p className="tiny dim">Party is full — box this one instead.</p> : null}

          <div className="row" style={{ gap: 8 }}>
            <input
              className="grow"
              placeholder="Nickname"
              value={nickname}
              autoCapitalize="words"
              autoCorrect="off"
              onChange={(event) => setNickname(event.target.value)}
            />
            <input
              style={{ width: 88 }}
              placeholder="Lv"
              inputMode="numeric"
              pattern="[0-9]*"
              value={level}
              onChange={(event) => setLevel(event.target.value.replace(/\D/g, '').slice(0, 3))}
            />
          </div>

          <button className="btn primary block" onClick={save}>
            {existing ? 'Update encounter' : 'Log encounter'}
          </button>
        </div>
      ) : (
        <p className="tiny dim" style={{ textAlign: 'center' }}>
          Pick the Pokémon you met here. Tap “All” if it was a fish, headbutt or gift encounter.
        </p>
      )}

      {existing ? (
        <button
          className="btn danger block"
          onClick={() => {
            actions.clearEncounter(step.id)
            onClose()
          }}
        >
          Clear this encounter
        </button>
      ) : (
        <button
          className="btn block"
          onClick={() => {
            actions.logEncounter(step.id, { status: 'missed' })
            onClose()
          }}
        >
          Skip / no encounter here
        </button>
      )}
    </Sheet>
  )
}
