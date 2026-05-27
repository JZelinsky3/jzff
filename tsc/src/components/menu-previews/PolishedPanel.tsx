'use client'

import { useEffect, useRef, useState } from 'react'
import { Hamburger } from './Hamburger'

// Option A — Polished panel. Keeps the hamburger trigger but the
// dropdown is a deliberate designed panel: wider, gold rules, section
// labels as small-caps headings, sub-items always visible (no
// accordion), smooth slide-down/fade animation.
export function PolishedPanel() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={ref} className={`mp-panel${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="mp-panel-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Open menu"
      >
        <Hamburger />
      </button>
      <div className="mp-panel-menu" role="menu">
        <div className="mp-panel-section">
          <div className="mp-panel-label">★ Library</div>
          <a href="#" className="mp-panel-link" role="menuitem">Your leagues</a>
          <a href="#" className="mp-panel-link" role="menuitem">New archive</a>
        </div>
        <div className="mp-panel-section">
          <div className="mp-panel-label">★ Account</div>
          <a href="#" className="mp-panel-link" role="menuitem">Profile &amp; subscription</a>
        </div>
        <div className="mp-panel-sep" />
        <button type="button" className="mp-panel-signout" role="menuitem">Sign out →</button>
      </div>
    </div>
  )
}
