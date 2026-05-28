'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

// Landing-page nav — inline horizontal text triggers on desktop with
// hover/click flyouts for grouped items; collapses to a hamburger panel
// under 720px so phones don't try to cram four triggers into a masthead.
// Items can be direct links ('link'), grouped dropdowns ('group'), or a
// trailing sign-out form ('signout').

export type LandingNavItem =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'group'; label: string; items: { label: string; href: string }[] }
  | { kind: 'signout' }

export function LandingNav({ items }: { items: LandingNavItem[] }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close any open flyout (desktop) or panel (mobile) on outside click / ESC.
  useEffect(() => {
    if (!openGroup && !mobileOpen) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenGroup(null)
        setMobileOpen(false)
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenGroup(null)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [openGroup, mobileOpen])

  return (
    <div ref={ref} className="ln-root">
      {/* Desktop · inline horizontal */}
      <div className="ln-inline">
        {items.map((item, i) => {
          if (item.kind === 'link') {
            return (
              <Link key={`l-${i}`} href={item.href} className="ln-link">
                {item.label}
              </Link>
            )
          }
          if (item.kind === 'signout') {
            return (
              <form key={`so-${i}`} action="/auth/signout" method="post" className="ln-signout-form">
                <button type="submit" className="ln-link ln-signout">Sign out</button>
              </form>
            )
          }
          const open = openGroup === item.label
          return (
            <div
              key={`g-${i}`}
              className={`ln-group${open ? ' is-open' : ''}`}
              onMouseEnter={() => setOpenGroup(item.label)}
              onMouseLeave={() => setOpenGroup(null)}
            >
              <button
                type="button"
                className="ln-link ln-trigger"
                aria-expanded={open}
                onClick={() => setOpenGroup((g) => (g === item.label ? null : item.label))}
              >
                {item.label}<span className="ln-arr" aria-hidden="true">▾</span>
              </button>
              <div className="ln-flyout">
                {item.items.map((sub) => (
                  <Link key={sub.href} href={sub.href} onClick={() => setOpenGroup(null)}>
                    {sub.label}
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile · hamburger */}
      <button
        type="button"
        className="ln-burger"
        aria-label="Open menu"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((o) => !o)}
      >
        <svg viewBox="0 0 20 14" width="22" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <line x1="0" y1="1" x2="20" y2="1" />
          <line x1="0" y1="7" x2="20" y2="7" />
          <line x1="0" y1="13" x2="20" y2="13" />
        </svg>
      </button>
      <div className={`ln-mobile${mobileOpen ? ' is-open' : ''}`}>
        {items.map((item, i) => {
          if (item.kind === 'link') {
            return (
              <Link key={`ml-${i}`} href={item.href} onClick={() => setMobileOpen(false)} className="ln-mobile-link">
                {item.label}
              </Link>
            )
          }
          if (item.kind === 'signout') {
            return (
              <form key={`mso-${i}`} action="/auth/signout" method="post">
                <button type="submit" onClick={() => setMobileOpen(false)} className="ln-mobile-signout">
                  Sign out →
                </button>
              </form>
            )
          }
          return (
            <div key={`mg-${i}`} className="ln-mobile-section">
              <div className="ln-mobile-label">★ {item.label}</div>
              {item.items.map((sub) => (
                <Link key={sub.href} href={sub.href} onClick={() => setMobileOpen(false)} className="ln-mobile-link">
                  {sub.label}
                </Link>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
