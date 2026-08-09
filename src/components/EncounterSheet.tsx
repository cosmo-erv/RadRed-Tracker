import { useMemo, useState } from 'react'
import { DEX, dex, familiesCaught } from '../lib/game'
import { actions, PARTY_LIMIT, partyMembers, useRun } from '../lib/store'
import type { RouteStep, Slug, Status } from '../lib/types'
import { STATUS_META } from '../lib/display'
import { Sheet, Sprite, Types } from './ui'

const STATUS_ORDER: Status[] = ['party', 'box', 'dead', 'missed']

/**
 * Every edit here writes straight to the run — picking a species logs it, and
 * Done just dismisses. Nothing waits on a save button.
 */
export function EncounterSheet({ step, onClose }: { step: RouteStep; onClose: () => void }) {
  const run = useRun()
  const encounter = run.encounters[step.id]
  const slug = encounter?.slug ?? null

  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const families = useMemo(() => familiesCaught(run), [run])
  const partyFull = partyMembers(run).length >= PARTY_LIMIT && encounter?.status !== 'party'

  const options = useMemo(() => {
    const base = showAll ? Object.keys(DEX) : step.encounters
    const term = query.trim().toLowerCase()
    const list = term ? base.filter((option) => dex(option).name.toLowerCase().includes(term)) : base
    return showAll ? list.slice(0, 120) : list
  }, [showAll, query, step.encounters])

  const isDupe = (option: Slug) => {
    if (!run.rules.dupes) return false
    const owner = families.get(dex(option).family)
    return Boolean(owner) && owner !== slug
  }

  const pick = (option: Slug) =>
    actions.logEncounter(step.id, {
      slug: option,
      status: encounter?.status && encounter.status !== 'missed' ? encounter.status : 'party'
    })

  return (
    <Sheet
      title={step.name}
      subtitle={
        encounter
          ? `Saved · ${slug ? dex(slug).name : 'no encounter'}`
          : `${step.encounters.length} possible encounters`
      }
      onClose={onClose}
    >
      {encounter && slug ? (
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
            <span className="chip good">Saved</span>
          </div>

          <div className="status-picker">
            {STATUS_ORDER.map((option) => (
              <button
                key={option}
                data-status={option}
                aria-pressed={encounter.status === option}
                disabled={option === 'party' && partyFull}
                onClick={() => actions.setStatus(step.id, option)}
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
              value={encounter.nickname ?? ''}
              autoCapitalize="words"
              autoCorrect="off"
              onChange={(event) =>
                actions.updateEncounter(step.id, { nickname: event.target.value || undefined })
              }
            />
            <input
              style={{ width: 88 }}
              placeholder="Lv"
              inputMode="numeric"
              pattern="[0-9]*"
              value={encounter.level ? String(encounter.level) : ''}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '').slice(0, 3)
                actions.updateEncounter(step.id, { level: digits ? Number(digits) : undefined })
              }}
            />
          </div>

          <button className="btn danger block" onClick={() => actions.clearEncounter(step.id)}>
            Clear this encounter
          </button>
        </div>
      ) : (
        <>
          <p className="tiny dim" style={{ textAlign: 'center' }}>
            Tap the Pokémon you met here and it is logged straight away. Use “All” for fishing,
            gift and static encounters.
          </p>
          <button
            className="btn block"
            onClick={() => {
              actions.logEncounter(step.id, { status: 'missed' })
              onClose()
            }}
          >
            Skip / no encounter here
          </button>
        </>
      )}

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
              onClick={() => pick(option)}
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

    </Sheet>
  )
}
