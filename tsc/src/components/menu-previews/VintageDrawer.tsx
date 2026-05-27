'use client'

import { useEffect, useState } from 'react'
import { Hamburger } from './Hamburger'

// Option B — Vintage drawer. The hamburger opens a right-side slide
// drawer with a serif kicker, Roman-numeral section headings, ornament
// rules, and a sign-out at the foot. Reads as a deliberate UI moment.
export function VintageDrawer() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onEsc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        className="mp-drawer-trigger"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Hamburger />
      </button>
      <div
        className={`mp-drawer-backdrop${open ? ' is-open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside className={`mp-drawer${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <header className="mp-drawer-head">
          <button
            type="button"
            className="mp-drawer-close"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
          <div className="mp-drawer-kicker">Vol. II · MMXXVI</div>
          <div className="mp-drawer-title">
            The <em>Menu.</em>
          </div>
        </header>

        <div className="mp-drawer-rule" aria-hidden="true">
          <span className="mp-drawer-rule-line" />
          <span className="mp-drawer-rule-mark">✦</span>
          <span className="mp-drawer-rule-line" />
        </div>

        <nav className="mp-drawer-nav">
          <div className="mp-drawer-section">
            <div className="mp-drawer-num">I. Library</div>
            <a href="#">Your leagues</a>
            <a href="#">New archive</a>
          </div>
          <div className="mp-drawer-section">
            <div className="mp-drawer-num">II. Account</div>
            <a href="#">Profile &amp; subscription</a>
          </div>
        </nav>

        <footer className="mp-drawer-foot">
          <button type="button" className="mp-drawer-signout">Sign out →</button>
          <div className="mp-drawer-mark">★ TSC</div>
        </footer>
      </aside>
    </>
  )
}
