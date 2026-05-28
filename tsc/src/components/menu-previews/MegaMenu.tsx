'use client'

import { useEffect, useState } from 'react'

// Option F — Mega menu overlay. The masthead carries a small "Menu"
// trigger; clicking it opens a centered overlay with a serif title and
// three columns of destinations grouped by section. Feels like opening
// the chronicle's index page — heaviest visual moment per open, but
// the most deliberate and magazine-like of the three.

export function MegaMenu() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        className="mp-mega-trigger"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        Menu <span className="mp-mega-trigger-mark" aria-hidden="true">✦</span>
      </button>

      <div
        className={`mp-mega-backdrop${open ? ' is-open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div className={`mp-mega${open ? ' is-open' : ''}`} role="dialog" aria-hidden={!open}>
        <button
          type="button"
          className="mp-mega-close"
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          ✕
        </button>

        <header className="mp-mega-head">
          <div className="mp-mega-kicker">★ Vol. II · MMXXVI ★</div>
          <h2 className="mp-mega-title">
            The <em>Index.</em>
          </h2>
          <div className="mp-mega-rule" aria-hidden="true">
            <span /><i>✦</i><span />
          </div>
        </header>

        <div className="mp-mega-grid">
          <section className="mp-mega-col">
            <div className="mp-mega-col-num">I.</div>
            <div className="mp-mega-col-label">Library</div>
            <ul>
              <li><a href="#">Your leagues</a></li>
              <li><a href="#">New archive</a></li>
            </ul>
          </section>

          <section className="mp-mega-col">
            <div className="mp-mega-col-num">II.</div>
            <div className="mp-mega-col-label">Chapters</div>
            <ul>
              <li><a href="#">Standings</a></li>
              <li><a href="#">Season Archives</a></li>
              <li><a href="#">Record Book</a></li>
              <li><a href="#">Draft History</a></li>
              <li><a href="#">Managers</a></li>
              <li><a href="#">Rivalries</a></li>
              <li><a href="#">Pick&apos;ems</a></li>
              <li><a href="#">Power Rankings</a></li>
            </ul>
          </section>

          <section className="mp-mega-col">
            <div className="mp-mega-col-num">III.</div>
            <div className="mp-mega-col-label">Account</div>
            <ul>
              <li><a href="#">Profile &amp; subscription</a></li>
              <li><a href="#">Pricing</a></li>
              <li><a href="#" className="mp-mega-signout">Sign out →</a></li>
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
