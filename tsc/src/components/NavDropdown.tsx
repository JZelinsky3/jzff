'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export type SubItem =
  | { kind?: 'link'; href: string; label: string }
  | { kind: 'signout'; label: string }

export type DropEntry =
  | { type: 'link'; href: string; label: string }
  | { type: 'sub'; label: string; items: SubItem[]; highlight?: boolean }

export type DropGroup = { label: string; entries: DropEntry[] }

function SubGroup({
  label,
  items,
  highlight,
  onPick,
}: {
  label: string
  items: SubItem[]
  highlight?: boolean
  onPick: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`nav-drop-group${open ? ' open' : ''}${highlight ? ' nav-drop-group-hl' : ''}`}>
      <div
        className="nav-drop-group-lbl"
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
      >
        <span>{label}</span>
        <span className="nav-group-arr">›</span>
      </div>
      <div className="nav-drop-sub">
        {items.map((it, idx) =>
          it.kind === 'signout' ? (
            <form key={`signout-${idx}`} action="/auth/signout" method="post">
              <button type="submit" onClick={onPick}>{it.label}</button>
            </form>
          ) : (
            <Link key={it.href} href={it.href} onClick={onPick}>{it.label}</Link>
          )
        )}
      </div>
    </div>
  )
}

export function NavDropdown({
  groups,
  position = 'left',
  includeSignOut = false,
}: {
  groups: DropGroup[]
  position?: 'left' | 'right'
  includeSignOut?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div
      ref={ref}
      className={`nav-drop${open ? ' open' : ''}${position === 'right' ? ' nav-drop-right' : ''}`}
    >
      <button
        className="nav-drop-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open menu"
        aria-expanded={open}
      >
        <svg
          className="nav-icon"
          viewBox="0 0 20 14"
          width="22"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        >
          <line x1="0" y1="1" x2="20" y2="1" />
          <line x1="0" y1="7" x2="20" y2="7" />
          <line x1="0" y1="13" x2="20" y2="13" />
        </svg>
      </button>
      <div className="nav-drop-menu">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.label && <span className="nav-drop-label">{g.label}</span>}
            {g.entries.map((e, ei) =>
              e.type === 'sub' ? (
                <SubGroup key={ei} label={e.label} items={e.items} highlight={e.highlight} onPick={close} />
              ) : (
                <Link key={ei} href={e.href} onClick={close}>{e.label}</Link>
              )
            )}
          </div>
        ))}
        {includeSignOut && (
          <form action="/auth/signout" method="post">
            <button type="submit">Sign out</button>
          </form>
        )}
      </div>
    </div>
  )
}
