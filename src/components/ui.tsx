import { useEffect, type ReactNode } from 'react'
import { dex, spriteUrl } from '../lib/game'
import { TYPE_COLORS } from '../lib/types-chart'
import type { Slug } from '../lib/types'

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="type" style={{ background: TYPE_COLORS[type] ?? '#666' }}>
      {type}
    </span>
  )
}

export function Types({ slug }: { slug: Slug }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      {dex(slug).types.map((type) => (
        <TypeBadge key={type} type={type} />
      ))}
    </span>
  )
}

export function Sprite({
  slug,
  size = 'md',
  className = ''
}: {
  slug: Slug
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <img
      className={`sprite ${size === 'md' ? '' : size} ${className}`.trim()}
      src={spriteUrl(slug)}
      alt={dex(slug).name}
      loading="lazy"
      decoding="async"
      width={44}
      height={44}
    />
  )
}

export function Toggle({
  on,
  onChange,
  label
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      className="toggle"
      role="switch"
      aria-checked={on}
      aria-pressed={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    />
  )
}

/**
 * iOS-style bottom sheet. Locks the page behind it so the background does not
 * scroll under your thumb, and never grows past the safe area.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  action
}: {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  action?: ReactNode
}) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        <header className="sheet-head spread">
          <div className="grow">
            <div style={{ fontWeight: 700, fontSize: 17 }}>{title}</div>
            {subtitle ? <div className="tiny muted">{subtitle}</div> : null}
          </div>
          {action}
          <button className="btn small" onClick={onClose}>
            Done
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}
