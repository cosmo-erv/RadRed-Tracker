import { useRef, useState } from 'react'
import { parsePlacements } from '../lib/placements'
import { GAME } from '../lib/game'
import { actions, useRun, useSave } from '../lib/store'
import type { Mode, Starter } from '../lib/types'
import { Sprite, Toggle } from './ui'
import { SaveImport } from './SaveImport'

export function RulesScreen({ toast }: { toast: (message: string) => void }) {
  const run = useRun()
  const save = useSave()
  const fileInput = useRef<HTMLInputElement>(null)

  const download = () => {
    const blob = new Blob([actions.export()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${run.name.replace(/\W+/g, '-').toLowerCase() || 'nuzlocke'}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast('Run exported')
  }

  const upload = async (file: File) => {
    const result = actions.import(await file.text())
    if (!result.ok) {
      toast(result.error)
      return
    }
    toast(`Imported ${result.added} attempt${result.added === 1 ? '' : 's'}`)
  }

  return (
    <>
      <header className="topbar">
        <h1>Rules & save</h1>
        <div className="sub">{GAME.title} data · updated {GAME.generatedAt}</div>
      </header>

      <div className="screen">
        <section className="stack">
          <h2 className="section-title">Run</h2>
          <div className="card stack" style={{ padding: 12, gap: 12 }}>
            <label className="stack" style={{ gap: 6 }}>
              <span className="tiny dim">Attempt</span>
              <select value={run.id} onChange={(event) => actions.switchRun(event.target.value)}>
                {save.runs.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.id === run.id ? ' (playing)' : ''}
                  </option>
                ))}
              </select>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn grow" onClick={() => { actions.newRun(); toast('New attempt started') }}>
                  + New attempt
                </button>
                <button
                  className="btn danger"
                  disabled={save.runs.length <= 1}
                  onClick={() => {
                    if (confirm(`Delete “${run.name}”? This cannot be undone.`)) {
                      actions.deleteRun(run.id)
                      toast('Attempt deleted')
                    }
                  }}
                >
                  Delete
                </button>
              </div>
              <p className="tiny dim" style={{ margin: 0 }}>
                Each attempt keeps its own encounters, ticks and starter. A wipe does not cost you
                the record of the run that died.
              </p>
            </label>

            <label className="stack" style={{ gap: 6 }}>
              <span className="tiny dim">Name this attempt</span>
              {/* Keyed on the run so switching attempts refills the field. */}
              <input
                key={run.id}
                defaultValue={run.name}
                onBlur={(event) => actions.rename(event.target.value.trim() || 'Attempt')}
              />
            </label>

            <div className="stack" style={{ gap: 6 }}>
              <span className="tiny dim">Your starter</span>
              <div className="row" style={{ gap: 8 }}>
                {(
                  [
                    ['grass', 'bulbasaur'],
                    ['fire', 'charmander'],
                    ['water', 'squirtle']
                  ] as [Starter, string][]
                ).map(([value, slug]) => (
                  <button
                    key={value}
                    className={`btn grow${run.starter === value ? ' primary' : ''}`}
                    style={{ flexDirection: 'column', minHeight: 72, gap: 0 }}
                    onClick={() => actions.setStarter(run.starter === value ? null : value)}
                  >
                    <Sprite slug={slug} />
                    <span className="tiny" style={{ textTransform: 'capitalize' }}>
                      {value}
                    </span>
                  </button>
                ))}
              </div>
              <p className="tiny dim">
                The rival takes the starter that beats yours, so his fights follow this. Logging
                your starter on the Run tab sets it for you — Mudkip counts as water just like
                Squirtle — and this is here for changing it by hand.
              </p>
            </div>

            <div className="stack" style={{ gap: 6 }}>
              <span className="tiny dim">Difficulty</span>
              <div className="row" style={{ gap: 8 }}>
                {(
                  [
                    ['normal', 'Normal'],
                    ['hardcore', 'Hardcore']
                  ] as [Mode, string][]
                ).map(([value, text]) => (
                  <button
                    key={value}
                    className={`btn grow${run.mode === value ? ' primary' : ''}`}
                    onClick={() => actions.setMode(value)}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <p className="tiny dim">
                Hardcore loads Radical Red's harder boss rosters and its route order. Your logged
                encounters stay put — locations are matched by name.
              </p>
            </div>
          </div>
        </section>

        <section className="stack">
          <h2 className="section-title">Clauses</h2>
          <div className="card">
            <RuleRow
              title="Dupes clause"
              detail="Flag encounters whose evolution family you already own."
              on={run.rules.dupes}
              onChange={(value) => actions.setRule('dupes', value)}
            />
            <RuleRow
              title="Level cap warnings"
              detail="Highlight party members above the next boss's ace."
              on={run.rules.levelCap}
              onChange={(value) => actions.setRule('levelCap', value)}
            />
            <RuleRow
              title="Hardcore rules reminder"
              detail="No items in battle, set mode, only the first encounter."
              on={run.rules.hardcore}
              onChange={(value) => actions.setRule('hardcore', value)}
              last
            />
          </div>
        </section>

        <section className="stack">
          <h2 className="section-title">Save data</h2>
          <div className="card stack" style={{ padding: 12, gap: 10 }}>
            <p className="tiny dim" style={{ margin: 0 }}>
              Your attempts live in this browser. Export a copy before clearing Safari data or
              moving to another phone — the file carries every attempt, and importing adds them
              alongside what is already here rather than replacing it.
            </p>
            <button className="btn block" onClick={download}>
              Export everything (.json)
            </button>
            <button className="btn block" onClick={() => fileInput.current?.click()}>
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
                event.target.value = ''
              }}
            />
            <button
              className="btn danger block"
              onClick={() => {
                if (confirm(`Empty “${run.name}”? This wipes its encounters and boss ticks.`)) {
                  actions.reset()
                  toast('Attempt cleared')
                }
              }}
            >
              Clear this attempt
            </button>
          </div>
        </section>

        <section className="stack">
          <h2 className="section-title">Read your save file</h2>
          <SaveImport toast={toast} />
        </section>

        <section className="stack">
          <h2 className="section-title">Place mini-bosses</h2>
          <PlacementImport toast={toast} />
        </section>

        <section className="stack">
          <h2 className="section-title">Add to home screen</h2>
          <div className="card" style={{ padding: 12 }}>
            <p className="small muted" style={{ margin: 0 }}>
              In Safari, tap the share button and choose <strong>Add to Home Screen</strong>. The
              tracker then opens full screen and works offline — handy on the bus, mid-run.
            </p>
          </div>
        </section>

        <section className="stack">
          <h2 className="section-title">Credits</h2>
          <div className="card" style={{ padding: 12 }}>
            <p className="small muted" style={{ margin: 0 }}>
              Encounter tables and boss rosters come from the open-source{' '}
              <a href="https://github.com/domtronn/nuzlocke.app" target="_blank" rel="noreferrer">
                nuzlocke.app
              </a>{' '}
              dataset (BSD-3-Clause). Sprites and species data from{' '}
              <a href="https://github.com/PokeAPI" target="_blank" rel="noreferrer">
                PokeAPI
              </a>
              . Pokémon is © Nintendo / Game Freak; Radical Red is a fan-made ROM hack. This tracker
              is unofficial.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}

/**
 * Mini-boss locations are in no data source this app can reach, so a pasted
 * list from a guide is the fastest way to get all of them pinned at once.
 */
function PlacementImport({ toast }: { toast: (message: string) => void }) {
  const run = useRun()
  const [text, setText] = useState('')
  const [result, setResult] = useState<ReturnType<typeof parsePlacements> | null>(null)

  const apply = () => {
    const parsed = parsePlacements(text, run.mode)
    setResult(parsed)
    if (parsed.placed > 0) {
      actions.placeMany(parsed.placements)
      toast(`Placed ${parsed.placed} mini-boss${parsed.placed === 1 ? '' : 'es'}`)
      setText('')
    } else {
      toast('Nothing matched — check the names')
    }
  }

  return (
    <div className="card stack" style={{ padding: 12, gap: 10 }}>
      <p className="tiny dim" style={{ margin: 0 }}>
        Paste where you meet them and they get pinned into your run. Copying rows straight out of a
        guide's spreadsheet works — extra columns are ignored — as does a plain list:
      </p>
      <pre className="tiny dim" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
        {'Mt. Moon: Super Nerd Miguel, Lass Ali\nRoute 4\nCamper Ethan'}
      </pre>
      <textarea
        rows={5}
        value={text}
        placeholder="Mt. Moon: Super Nerd Miguel"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
      />
      <button className="btn primary block" onClick={apply} disabled={!text.trim()}>
        Place them
      </button>

      {result ? (
        <div className="tiny dim stack" style={{ gap: 4 }}>
          <span>
            {result.placed} pinned
            {result.alreadyPlaced > 0
              ? `, ${result.alreadyPlaced} already in the run from the documented order`
              : ''}
            .
          </span>
          {result.skipped.length > 0 ? (
            <span style={{ color: 'var(--warn)' }}>
              Nothing recognised in: {result.skipped.join(' · ')}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function RuleRow({
  title,
  detail,
  on,
  onChange,
  last
}: {
  title: string
  detail: string
  on: boolean
  onChange: (value: boolean) => void
  last?: boolean
}) {
  return (
    <div
      className="spread"
      style={{ padding: 12, borderBottom: last ? undefined : '1px solid var(--line)' }}
    >
      <span className="grow">
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span className="tiny dim" style={{ display: 'block' }}>
          {detail}
        </span>
      </span>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  )
}
