import { useMemo, useState } from 'react'
import { DEX, dex } from '../lib/game'
import type { Slug } from '../lib/types'
import { Sprite } from './ui'

/**
 * Evolving keeps the same encounter — nickname, level, status and the route it
 * came from all stay put, only the species changes. The family list is there
 * for branching lines and for undoing a wrong tap.
 */
export function EvolvePicker({ slug, onChange }: { slug: Slug; onChange: (next: Slug) => void }) {
  const [showFamily, setShowFamily] = useState(false)
  const entry = dex(slug)
  const evolutions = entry.evo ?? []

  const family = useMemo(
    () =>
      Object.keys(DEX)
        .filter((other) => other !== slug && DEX[other].family === entry.family)
        .sort((a, b) => DEX[a].dex - DEX[b].dex),
    [slug, entry.family]
  )

  if (evolutions.length === 0 && family.length === 0) return null
  const options = showFamily ? family : evolutions

  return (
    <section className="stack">
      <div className="spread">
        <h2 className="section-title">{showFamily ? 'Whole family' : 'Evolve'}</h2>
        {family.length > 0 ? (
          <button className="btn small" onClick={() => setShowFamily((value) => !value)}>
            {showFamily ? 'Evolutions' : 'Family'}
          </button>
        ) : null}
      </div>

      {options.length > 0 ? (
        <div className="mon-grid">
          {options.map((option) => (
            <button key={option} className="mon-tile" onClick={() => onChange(option)}>
              <Sprite slug={option} />
              <span className="name">{dex(option).name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="tiny dim" style={{ margin: 0 }}>
          {dex(slug).name} is a final form — tap Family to pick another stage.
        </p>
      )}
    </section>
  )
}
