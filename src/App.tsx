import { useCallback, useEffect, useRef, useState } from 'react'
import { RunScreen } from './components/RunScreen'
import { TeamScreen } from './components/TeamScreen'
import { BossScreen } from './components/BossScreen'
import { RulesScreen } from './components/RulesScreen'
import { storageAvailable } from './lib/store'

type Tab = 'run' | 'team' | 'bosses' | 'rules'

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'run', label: 'Run', glyph: '🗺️' },
  { id: 'team', label: 'Team', glyph: '🎒' },
  { id: 'bosses', label: 'Bosses', glyph: '🏅' },
  { id: 'rules', label: 'Rules', glyph: '⚙️' }
]

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const hash = window.location.hash.replace('#', '') as Tab
    return TABS.some((entry) => entry.id === hash) ? hash : 'run'
  })
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number>(0)

  const toast = useCallback((text: string) => {
    setMessage(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 2200)
  }, [])

  // Keep the hash in sync so iOS restores the right tab when the PWA resumes.
  useEffect(() => {
    if (window.location.hash !== `#${tab}`) window.history.replaceState(null, '', `#${tab}`)
  }, [tab])

  const go = (next: Tab) => {
    setTab(next)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app">
      {storageAvailable ? null : (
        <p className="banner" role="alert">
          This browser is not letting the tracker save. Your run works now but will be lost on
          reload — export it from Rules, or open the tracker in a normal Safari tab.
        </p>
      )}

      {tab === 'run' ? <RunScreen /> : null}
      {tab === 'team' ? <TeamScreen /> : null}
      {tab === 'bosses' ? <BossScreen /> : null}
      {tab === 'rules' ? <RulesScreen toast={toast} /> : null}

      {message ? (
        <div className="toast" role="status">
          {message}
        </div>
      ) : null}

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            aria-current={tab === entry.id ? 'page' : undefined}
            onClick={() => go(entry.id)}
          >
            <span className="glyph" aria-hidden>
              {entry.glyph}
            </span>
            {entry.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
