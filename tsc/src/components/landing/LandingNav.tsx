'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { NavDropdown, type DropGroup } from '@/components/NavDropdown'

// Landing-page nav.
//   Desktop (>=720px): inline horizontal text triggers with hover/click
//   flyouts. Auto-close fires only when the cursor leaves the entire nav
//   region (.ln-root) — not the individual trigger — so the menu doesn't
//   evaporate from any tiny pointer twitch while the user is reading.
//   Mobile (<720px): falls back to the shared NavDropdown.

export type GroupItem =
  | { signout?: false; label: string; href: string }
  | { signout: true; label: string }

export type LandingNavItem =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'group'; label: string; items: GroupItem[] }

function toDropGroups(items: LandingNavItem[]): { groups: DropGroup[]; includeSignOut: boolean } {
  const groups: DropGroup[] = []
  let includeSignOut = false
  for (const item of items) {
    if (item.kind === 'link') {
      groups.push({ label: item.label, entries: [{ type: 'link', href: item.href, label: item.label }] })
    } else if (item.kind === 'group') {
      // NavDropdown doesn't model inline sign-out as a regular entry, so we
      // strip it here and set the top-level includeSignOut flag — it gets
      // appended to the dropdown's bottom by NavDropdown itself.
      const linkEntries = item.items
        .filter((s): s is { signout?: false; label: string; href: string } => !s.signout)
        .map((s) => ({ type: 'link' as const, href: s.href, label: s.label }))
      groups.push({ label: item.label, entries: linkEntries })
      if (item.items.some((s) => s.signout)) includeSignOut = true
    }
  }
  return { groups, includeSignOut }
}

export function LandingNav({ items }: { items: LandingNavItem[] }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  // Single close-timer attached to the entire nav root. Set when the
  // cursor leaves the nav area; cancelled if it returns or enters any
  // descendant before the timeout fires.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpenGroup(null), 200)
  }

  // Outside click + ESC close.
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
    }
  }, [openGroup])

  const { groups: mobileGroups, includeSignOut } = toDropGroups(items)

  return (
    <div
      ref={ref}
      className="ln-root"
      // Mouseleave fires only when the cursor truly leaves the entire
      // nav (the flyouts are DOM descendants of .ln-root, so moving
      // between trigger and flyout doesn't count as leaving).
      onMouseLeave={scheduleClose}
      onMouseEnter={cancelClose}
    >
      {/* Desktop · inline horizontal */}
      <div className="ln-inline">
        {items.map((item, i) => {
          if (item.kind === 'link') {
            // Wrap plain links in the same .ln-group/.ln-link shape as
            // grouped triggers so every flex item in .ln-inline has an
            // identical box — guarantees they sit on the same baseline.
            // Hovering a plain link also closes any open dropdown so the
            // nav doesn't show two highlighted regions at once.
            return (
              <div
                key={`l-${i}`}
                className="ln-group"
                onMouseEnter={() => setOpenGroup(null)}
              >
                <Link href={item.href} className="ln-link">{item.label}</Link>
              </div>
            )
          }
          const open = openGroup === item.label
          return (
            <div
              key={`g-${i}`}
              className={`ln-group${open ? ' is-open' : ''}`}
              onMouseEnter={() => setOpenGroup(item.label)}
            >
              <button
                type="button"
                className="ln-link ln-trigger"
                aria-expanded={open}
                onClick={() => setOpenGroup((g) => (g === item.label ? null : item.label))}
              >
                {item.label}
              </button>
              <div className="ln-flyout">
                {item.items.map((sub, si) =>
                  sub.signout ? (
                    <form
                      key={`so-${si}`}
                      action="/auth/signout"
                      method="post"
                      className="ln-flyout-signout-form"
                    >
                      <button
                        type="submit"
                        className="ln-flyout-signout"
                        onClick={() => setOpenGroup(null)}
                      >
                        {sub.label} →
                      </button>
                    </form>
                  ) : (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={() => setOpenGroup(null)}
                    >
                      {sub.label}
                    </Link>
                  ),
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile · shared NavDropdown */}
      <div className="ln-mobile-wrap">
        <NavDropdown groups={mobileGroups} position="right" includeSignOut={includeSignOut} />
      </div>
    </div>
  )
}
