'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { NavDropdown, type DropGroup } from '@/components/NavDropdown'

// Landing-page nav.
//   Desktop (>=720px): inline horizontal text triggers with hover/click
//   flyouts. A short close-timer keeps the menu open while the cursor
//   travels from the trigger down into the flyout.
//   Mobile (<720px): falls back to the shared NavDropdown — the same
//   hamburger pattern every other page on the site uses, so the chrome
//   stays consistent on small screens.

export type LandingNavItem =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'group'; label: string; items: { label: string; href: string }[] }
  | { kind: 'signout' }

// Adapt landing-nav items into the shape NavDropdown expects on mobile.
// kind:'link'   → standalone link with the link's label as group label
// kind:'group'  → preserved as DropGroup
// kind:'signout'→ handled by NavDropdown's includeSignOut flag below
function toDropGroups(items: LandingNavItem[]): { groups: DropGroup[]; includeSignOut: boolean } {
  const groups: DropGroup[] = []
  let includeSignOut = false
  for (const item of items) {
    if (item.kind === 'link') {
      groups.push({ label: item.label, entries: [{ type: 'link', href: item.href, label: item.label }] })
    } else if (item.kind === 'group') {
      groups.push({
        label: item.label,
        entries: item.items.map((s) => ({ type: 'link' as const, href: s.href, label: s.label })),
      })
    } else if (item.kind === 'signout') {
      includeSignOut = true
    }
  }
  return { groups, includeSignOut }
}

export function LandingNav({ items }: { items: LandingNavItem[] }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  // Brief close delay so cursor can move from trigger → flyout without
  // the gap between them triggering mouseleave → close.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpenGroup(null), 140)
  }
  const enter = (label: string) => {
    cancelClose()
    setOpenGroup(label)
  }

  // Close on outside click / ESC.
  useEffect(() => {
    if (!openGroup) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenGroup(null)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenGroup(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
      cancelClose()
    }
  }, [openGroup])

  const { groups: mobileGroups, includeSignOut } = toDropGroups(items)

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
              onMouseEnter={() => enter(item.label)}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                className="ln-link ln-trigger"
                aria-expanded={open}
                onClick={() => setOpenGroup((g) => (g === item.label ? null : item.label))}
                onFocus={() => enter(item.label)}
              >
                {item.label}<span className="ln-arr" aria-hidden="true">▾</span>
              </button>
              <div
                className="ln-flyout"
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
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

      {/* Mobile · shared NavDropdown (same 3-line hamburger every other page uses) */}
      <div className="ln-mobile-wrap">
        <NavDropdown groups={mobileGroups} position="right" includeSignOut={includeSignOut} />
      </div>
    </div>
  )
}
