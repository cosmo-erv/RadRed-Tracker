import { useMemo, useRef, useState } from 'react'
import { DEX, dex } from '../lib/game'
import { actions, useSave } from '../lib/store'
import { readSave, type SaveMon, type SaveRead } from '../lib/savefile'
import type { Slug } from '../lib/types'
import { Sprite } from './ui'

/**
 * Reads a .sav straight off the emulator and folds it into the run.
 *
 * The file is shown before anything is written. That is not only politeness:
 * Radical Red numbers the species it adds differently from the engine table
 * this build reads, so a name can come out wrong, and the preview is where you
 * put it right. A correction is remembered against that species number and
 * applied to every import after.
 */
export function SaveImport({ toast }: { toast: (message: string) => void }) {
  const save = useSave()
  const fileInput = useRef<HTMLInputElement>(null)
  const [raw, setRaw] = useState<SaveRead | null>(null)
  const [error, setError] = useState('')
  const [fixing, setFixing] = useState<number | null>(null)
  const [leftOver, setLeftOver] = useState<SaveMon[] | null>(null)

  const fixes = save.speciesFix ?? {}
  const correct = (mon: SaveMon): SaveMon => {
    const fix = fixes[String(mon.speciesId)]
    return fix ? { ...mon, slug: fix } : mon
  }
  const read = raw
    ? { ...raw, party: raw.party.map(correct), boxed: raw.boxed.map(correct) }
    : null

  const load = async (file: File) => {
    setError('')
    setLeftOver(null)
    setFixing(null)
    const result = readSave(await file.arrayBuffer(), fixes)
    if (!result.ok) {
      setRaw(null)
      setError(result.error)
      return
    }
    // Anything the stats identified is worth keeping: it names the same
    // species in the boxes, which store no stats of their own.
    for (const [id, slug] of Object.entries(result.save.learned)) {
      actions.fixSpecies(Number(id), slug)
    }
    setRaw(result.save)
  }

  const apply = () => {
    if (!read) return
    const { updated, unmatched } = actions.applySave([...read.party, ...read.boxed])
    setLeftOver(unmatched as SaveMon[])
    setRaw(null)
    toast(updated > 0 ? `Updated ${updated} Pokémon` : 'Nothing matched your logged encounters')
  }

  return (
    <div className="card stack" style={{ padding: 12, gap: 10 }}>
      <p className="tiny dim" style={{ margin: 0 }}>
        Load the .sav your emulator writes next to the ROM and your party and boxes are read out of
        it — species, nickname and level, including anything that has evolved since you logged it.
      </p>

      <button className="btn block" onClick={() => fileInput.current?.click()}>
        Read a .sav file
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".sav,.sa1,.srm,application/octet-stream"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void load(file)
          event.target.value = ''
        }}
      />

      {error ? (
        <p className="tiny" style={{ margin: 0, color: 'var(--warn)' }}>
          {error}
        </p>
      ) : null}

      {read ? (
        <div className="stack" style={{ gap: 8 }}>
          <span className="tiny dim">
            {read.trainer ? `${read.trainer}'s save · ` : ''}
            {read.party.length} in the party, {read.boxed.length} boxed
            {read.unresolved.length
              ? ` · ${read.unresolved.length} species this app has no name for`
              : ''}
          </span>

          <p className="tiny dim" style={{ margin: 0 }}>
            Radical Red numbers the Pokémon it added differently from any published engine data, so
            party members are identified from the stats the save stores for them rather than taken
            on trust. Anything still wrong can be tapped and corrected for good.
          </p>

          <MonList
            title="Party"
            mons={read.party}
            fixing={fixing}
            onFix={setFixing}
            fixed={fixes}
          />
          <MonList title="Boxes" mons={read.boxed} fixing={fixing} onFix={setFixing} fixed={fixes} />

          <p className="tiny dim" style={{ margin: 0 }}>
            These are matched to encounters you have already logged, by evolution family, and update
            their level, nickname, species and whether they are in the party or the box. A save does
            not record where you caught anything, so nothing new is added to your route list and
            Pokémon you marked dead stay dead.
          </p>

          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary grow" onClick={apply}>
              Update my run
            </button>
            <button className="btn" onClick={() => setRaw(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {leftOver && leftOver.length > 0 ? (
        <div className="stack" style={{ gap: 6 }}>
          <span className="tiny" style={{ color: 'var(--warn)' }}>
            {leftOver.length} had no logged encounter to match, so they were left alone — log the
            route you caught them on and read the save again:
          </span>
          <div className="scroller">
            {leftOver.map((mon, index) => (
              <span key={`${mon.slug}-${index}`} className="bench-pick">
                <Sprite slug={mon.slug} size="sm" />
                <span className="tiny truncate">{mon.nickname || dex(mon.slug).name}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MonList({
  title,
  mons,
  fixing,
  onFix,
  fixed
}: {
  title: string
  mons: SaveMon[]
  fixing: number | null
  onFix: (id: number | null) => void
  fixed: Record<string, Slug>
}) {
  if (mons.length === 0) return null
  return (
    <div className="stack" style={{ gap: 4 }}>
      <h3 className="section-title" style={{ padding: 0 }}>
        {title} · {mons.length}
      </h3>
      {mons.map((mon, index) => (
        <div key={`${mon.speciesId}-${index}`} className="stack" style={{ gap: 4 }}>
          <button
            className="row"
            style={{ gap: 8, width: '100%', minHeight: 40, textAlign: 'left' }}
            onClick={() => onFix(fixing === mon.speciesId ? null : mon.speciesId)}
          >
            <Sprite slug={mon.slug} size="sm" />
            <span className="grow truncate small">
              {mon.nickname ? `${mon.nickname} (${dex(mon.slug).name})` : dex(mon.slug).name}
              {mon.identified ? (
                <span className="tiny dim"> · from its stats</span>
              ) : fixed[String(mon.speciesId)] ? (
                <span className="tiny dim"> · corrected</span>
              ) : null}
            </span>
            <span className="tiny dim">Lv {mon.level}</span>
            <span className="dim" aria-hidden>
              ›
            </span>
          </button>
          {fixing === mon.speciesId ? (
            <SpeciesFix
              speciesId={mon.speciesId}
              current={mon.slug}
              onDone={() => onFix(null)}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** Search the dex and pin the right species to this save's number. */
function SpeciesFix({
  speciesId,
  current,
  onDone
}: {
  speciesId: number
  current: Slug
  onDone: () => void
}) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length < 2) return []
    return Object.keys(DEX)
      .filter((slug) => DEX[slug].name.toLowerCase().includes(needle))
      .slice(0, 12)
  }, [query])

  return (
    <div className="card stack" style={{ padding: 8, gap: 6 }}>
      <span className="tiny dim">
        Save number {speciesId} currently reads as {dex(current).name}. What is it really?
      </span>
      <input
        type="search"
        placeholder="Search the dex…"
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
          onClick={() => {
            actions.fixSpecies(speciesId, slug)
            onDone()
          }}
        >
          <Sprite slug={slug} size="sm" />
          <span className="grow truncate">{DEX[slug].name}</span>
        </button>
      ))}
      <button className="btn small" onClick={onDone}>
        Leave it
      </button>
    </div>
  )
}
