import { useMemo, useState } from 'react'
import { GAME, dex, label, levelCap, variantOf } from '../lib/game'
import { actions, useRun } from '../lib/store'
import { bestOf, estimate, hitClass, knockout, percent, type Hit } from '../lib/damage'
import type { BossMon, BossStep, Encounter } from '../lib/types'
import { Sprite, TypeBadge } from './ui'

/**
 * What this fight does to your team, and what your team does back.
 *
 * The incoming half is exact: the dumps carry the trainer's real moves and
 * levels. The outgoing half needs your movesets, so it estimates until you
 * fill them in and says which it is doing.
 */
export function Calculator({ step }: { step: BossStep }) {
  const run = useRun()
  const [editing, setEditing] = useState<Encounter | null>(null)
  const { team, levelCap: fightCap } = variantOf(step, run.starter)
  const cap = levelCap(run)

  const party = useMemo(
    () =>
      Object.values(run.encounters)
        .filter((encounter) => encounter.status === 'party' && encounter.slug)
        .sort((a, b) => a.at - b.at),
    [run.encounters]
  )

  const bench = useMemo(
    () =>
      Object.values(run.encounters)
        .filter((encounter) => encounter.status === 'box' && encounter.slug)
        .sort((a, b) => a.at - b.at),
    [run.encounters]
  )

  if (party.length === 0) {
    return (
      <div className="stack">
        <p className="empty" style={{ paddingBottom: 8 }}>
          Put something in your party and the matchups show up here.
        </p>
        {bench.length > 0 ? <Bench bench={bench} /> : null}
      </div>
    )
  }

  const missingLevels = party.filter((member) => !member.level)

  return (
    <div className="stack">
      {missingLevels.length > 0 ? (
        <p className="tiny" style={{ margin: 0, color: 'var(--warn)' }}>
          {missingLevels.length === 1
            ? `${nameOf(missingLevels[0])} has no level set, so it is assumed to be at your cap.`
            : `${missingLevels.length} of your party have no level set; they are assumed to be at your cap.`}
        </p>
      ) : null}

      {party.map((member) => (
        <MemberBlock
          key={member.locId}
          member={member}
          level={member.level || cap || fightCap || 1}
          team={team}
          onEdit={() => setEditing(member)}
        />
      ))}

      <p className="tiny dim" style={{ margin: 0 }}>
        Damage at 31 IVs, no EVs, neutral nature, worst roll, assuming the move hits. Abilities,
        held items, stat boosts, weather and screens are not counted — a real hit usually lands at
        or above these numbers, but Levitate or a Choice Band will move them.
      </p>
      <p className="tiny dim" style={{ margin: 0 }}>
        Move numbers are the mainline ones plus the Radical Red changes this build could source.
        Radical Red rebalances more moves than that, so treat a surprising number as worth checking
        in-game.
      </p>

      <Bench bench={bench} />

      {editing ? (
        <MoveEditor
          key={editing.locId}
          member={run.encounters[editing.locId] ?? editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

const nameOf = (member: Encounter) => member.nickname || dex(member.slug!).name

/** One of yours against the whole enemy team, both directions. */
function MemberBlock({
  member,
  level,
  team,
  onEdit
}: {
  member: Encounter
  level: number
  team: BossMon[]
  onEdit: () => void
}) {
  const you = { slug: member.slug!, level }
  const moves = member.moves?.filter(Boolean) ?? []

  const rows = team.map((mon) => {
    const them = { slug: mon.slug, level: mon.level || level }
    const out = moves.length ? bestOf(you, them, moves) : estimate(you, them)
    // Their side is exact: the dump carries the moves they actually run.
    const back = bestOf(them, you, mon.moves)
    return { mon, them, out, back }
  })

  const worst = rows.reduce<Hit | null>(
    (top, row) => (row.back && (!top || row.back.min > top.min) ? row.back : top),
    null
  )

  return (
    <section className="card stack" style={{ padding: 10, gap: 8 }}>
      <div className="spread">
        <span className="row" style={{ gap: 8, minWidth: 0 }}>
          <Sprite slug={member.slug!} size="sm" />
          <span className="truncate">
            <strong>{nameOf(member)}</strong>
            <span className="tiny dim" style={{ display: 'block' }}>
              Lv {level}
              {moves.length ? ` · ${moves.length} move${moves.length === 1 ? '' : 's'} set` : ' · moveset unknown'}
            </span>
          </span>
        </span>
        <button className="btn small" onClick={onEdit}>
          {moves.length ? 'Moves' : 'Set moves'}
        </button>
      </div>

      {worst && worst.hits <= 2 ? (
        <p className="tiny" style={{ margin: 0, color: 'var(--bad)' }}>
          Dies in {worst.hits === 1 ? 'one hit' : 'two'} to {label(worst.move)}
          {typeof worst.info.accuracy === 'number' && worst.info.accuracy < 100
            ? ` (${worst.info.accuracy}% accurate)`
            : ''}
          .
        </p>
      ) : null}

      <div className="calc-grid">
        {rows.map(({ mon, out, back }, index) => (
          <div key={`${mon.slug}-${index}`} className="calc-cell">
            <Sprite slug={mon.slug} size="sm" />
            <span className="tiny dim truncate">{dex(mon.slug).name}</span>
            <span className={`mx ${hitClass(out)}`} title={out ? label(out.move) : 'No damage'}>
              <span className="arrow">→</span> {out ? percent(out.min) : '—'}
              <br />
              <span className="ko">{knockout(out)}</span>
            </span>
            <span
              className={`mx ${hitClass(back, 'taken')}`}
              title={back ? label(back.move) : 'No damage'}
            >
              <span className="arrow">←</span> {back ? percent(back.min) : '—'}
              <br />
              <span className="ko">{knockout(back)}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="tiny dim" style={{ margin: 0 }}>
        → what you do to them {moves.length ? '' : '(estimated)'} · ← what they do to you
      </p>
    </section>
  )
}

/** Swap something in from the box without leaving the fight. */
function Bench({ bench }: { bench: Encounter[] }) {
  if (bench.length === 0) return null
  return (
    <section className="stack" style={{ gap: 6 }}>
      <h2 className="section-title">In the box · tap to bring into the party</h2>
      <div className="scroller">
        {bench.map((member) => (
          <button
            key={member.locId}
            className="bench-pick"
            onClick={() => actions.setStatus(member.locId, 'party')}
          >
            <Sprite slug={member.slug!} size="sm" />
            <span className="tiny truncate">{nameOf(member)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** Four move slots, searched against the whole move table. */
function MoveEditor({ member, onClose }: { member: Encounter; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const chosen = member.moves ?? []

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, '-')
    if (!needle) return []
    return Object.keys(GAME.moves)
      .filter((slug) => slug.includes(needle) && GAME.moves[slug].category !== 'status')
      .sort((a, b) => GAME.moves[b].power - GAME.moves[a].power)
      .slice(0, 24)
  }, [query])

  const toggle = (slug: string) => {
    const next = chosen.includes(slug)
      ? chosen.filter((entry) => entry !== slug)
      : [...chosen, slug].slice(0, 4)
    actions.updateEncounter(member.locId, { moves: next.length ? next : undefined })
  }

  return (
    <div className="card stack" style={{ padding: 10, gap: 8 }}>
      <div className="spread">
        <strong className="truncate">{nameOf(member)}'s moves</strong>
        <button className="btn small" onClick={onClose}>
          Done
        </button>
      </div>

      {chosen.length > 0 ? (
        <div className="moves">
          {chosen.map((slug) => (
            <button key={slug} className="move" onClick={() => toggle(slug)}>
              {label(slug)} ✕
            </button>
          ))}
        </div>
      ) : (
        <p className="tiny dim" style={{ margin: 0 }}>
          With no moves set, damage is estimated from typing alone. Add up to four and it uses the
          real numbers.
        </p>
      )}

      <input
        type="search"
        placeholder="Search moves…"
        value={query}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.target.value)}
      />

      {results.map((slug) => (
        <button
          key={slug}
          className="move-row"
          aria-pressed={chosen.includes(slug)}
          onClick={() => toggle(slug)}
        >
          <span className="grow truncate">{label(slug)}</span>
          <TypeBadge type={GAME.moves[slug].type} />
          <span className="tiny dim">{GAME.moves[slug].power}</span>
        </button>
      ))}
    </div>
  )
}
