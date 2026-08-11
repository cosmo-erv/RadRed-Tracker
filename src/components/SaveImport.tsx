import { useRef, useState } from 'react'
import { dex } from '../lib/game'
import { actions } from '../lib/store'
import { readSave, type SaveMon, type SaveRead } from '../lib/savefile'
import { Sprite } from './ui'

/**
 * Reads a .sav straight off the emulator and folds it into the run.
 *
 * The file is shown before anything is written: a save is the record of what
 * you are carrying, and it can only be matched to encounters you have already
 * logged, so it is worth seeing what it found before it changes your run.
 */
export function SaveImport({ toast }: { toast: (message: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [read, setRead] = useState<SaveRead | null>(null)
  const [error, setError] = useState('')
  const [leftOver, setLeftOver] = useState<SaveMon[] | null>(null)

  const load = async (file: File) => {
    setError('')
    setLeftOver(null)
    const result = readSave(await file.arrayBuffer())
    if (!result.ok) {
      setRead(null)
      setError(result.error)
      return
    }
    setRead(result.save)
  }

  const apply = () => {
    if (!read) return
    const { updated, unmatched } = actions.applySave([...read.party, ...read.boxed])
    setLeftOver(unmatched)
    setRead(null)
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
              ? ` · ${read.unresolved.length} species this app does not know`
              : ''}
          </span>

          <MonList title="Party" mons={read.party} />
          <MonList title="Boxes" mons={read.boxed} />

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
            <button className="btn" onClick={() => setRead(null)}>
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

function MonList({ title, mons }: { title: string; mons: SaveMon[] }) {
  if (mons.length === 0) return null
  return (
    <div className="stack" style={{ gap: 4 }}>
      <h3 className="section-title" style={{ padding: 0 }}>
        {title} · {mons.length}
      </h3>
      {mons.map((mon, index) => (
        <div key={`${mon.slug}-${index}`} className="row" style={{ gap: 8 }}>
          <Sprite slug={mon.slug} size="sm" />
          <span className="grow truncate small">
            {mon.nickname ? `${mon.nickname} (${dex(mon.slug).name})` : dex(mon.slug).name}
          </span>
          <span className="tiny dim">Lv {mon.level}</span>
        </div>
      ))}
    </div>
  )
}
