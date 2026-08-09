import { useRef, useState } from 'react'
import { GAME } from '../lib/game'
import { actions, useRun } from '../lib/store'
import type { Mode } from '../lib/types'
import { Toggle } from './ui'

export function RulesScreen({ toast }: { toast: (message: string) => void }) {
  const run = useRun()
  const fileInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(run.name)

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
    toast(result.ok ? 'Run imported' : result.error)
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
              <span className="tiny dim">Run name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => actions.rename(name.trim() || 'My Nuzlocke')}
              />
            </label>

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
              Your run lives in this browser. Export a copy before clearing Safari data or moving
              to another phone.
            </p>
            <button className="btn block" onClick={download}>
              Export run (.json)
            </button>
            <button className="btn block" onClick={() => fileInput.current?.click()}>
              Import run
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
                if (confirm('Start over? This wipes every encounter and boss tick.')) {
                  actions.reset()
                  toast('New run started')
                }
              }}
            >
              Start a new run
            </button>
          </div>
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
