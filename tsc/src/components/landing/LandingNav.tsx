'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { NavDropdown, type DropGroup } from '@/components/NavDropdown'

// Landing-page nav, mega-menu shape (Nike / Gap style).
//   Desktop (>=720px): top-row text triggers in the masthead. Hovering
//   ANY trigger opens a single shared mega panel below the masthead with
//   every destination grouped into columns. The triggered group gets a
//   subtle focus highlight; the rest stay visible but slightly muted.
//   Mobile (<720px): collapses to the shared NavDropdown hamburger.

type ColumnKey = 'library' | 'pages' | 'demo' | 'account' | 'get-started'

type Trigger =
  | { kind: 'link'; label: string; href: string; column: ColumnKey }
  | { kind: 'group'; label: string; column: ColumnKey }

type ColumnItem =
  | { label: string; href: string }
  | { signout: true; label: string }

type Column = {
  key: ColumnKey
  num: string
  label: string
  items: ColumnItem[]
}

const ROMAN = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.']

const PAGES: ColumnItem[] = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
  { label: 'Guides', href: '/guides' },
]

// Every demo league page — gives visitors a one-click jump to any
// chapter of the sample chronicle without navigating into /demo/ first.
const DEMO_CHAPTERS: ColumnItem[] = [
  { label: 'Demo hub', href: '/demo/' },
  { label: 'Standings', href: '/demo/standings.html' },
  { label: 'Seasons', href: '/demo/seasons/' },
  { label: 'Drafts', href: '/demo/draft/' },
  { label: 'Records', href: '/demo/records.html' },
  { label: 'Managers', href: '/demo/managers/' },
  { label: 'Rivalries', href: '/demo/rivalries/' },
  { label: "Pick'ems", href: '/demo/pickems/' },
  { label: 'Power Rankings', href: '/demo/powerrank/' },
]

function buildSignedIn(admin: boolean): { triggers: Trigger[]; columns: Column[] } {
  const triggers: Trigger[] = [
    { kind: 'link', label: 'Pricing', href: '/pricing', column: 'pages' },
    { kind: 'group', label: 'Library', column: 'library' },
    { kind: 'group', label: 'Account', column: 'account' },
  ]
  const accountItems: ColumnItem[] = [
    { label: 'Profile & subscription', href: '/account' },
    ...(admin ? [{ label: 'Site admin console', href: '/admin' } as ColumnItem] : []),
    { signout: true, label: 'Sign out' },
  ]
  const columns: Column[] = [
    {
      key: 'library', num: ROMAN[0], label: 'Library',
      items: [
        { label: 'Your leagues', href: '/dashboard' },
        { label: 'New chronicle', href: '/dashboard/new' },
        { label: 'Demo league', href: '/demo/' },
      ],
    },
    { key: 'pages', num: ROMAN[1], label: 'Pages', items: PAGES },
    { key: 'demo', num: ROMAN[2], label: 'Demo chronicle', items: DEMO_CHAPTERS },
    { key: 'account', num: ROMAN[3], label: admin ? 'Account & Admin' : 'Account', items: accountItems },
  ]
  return { triggers, columns }
}

function buildSignedOut(): { triggers: Trigger[]; columns: Column[] } {
  const triggers: Trigger[] = [
    { kind: 'link', label: 'Pricing', href: '/pricing', column: 'pages' },
    { kind: 'group', label: 'Demo', column: 'demo' },
    { kind: 'link', label: 'Sign in', href: '/login', column: 'get-started' },
  ]
  const columns: Column[] = [
    { key: 'pages', num: ROMAN[0], label: 'Pages', items: PAGES },
    { key: 'demo', num: ROMAN[1], label: 'Demo chronicle', items: DEMO_CHAPTERS },
    {
      key: 'get-started', num: ROMAN[2], label: 'Get started',
      items: [
        { label: 'Sign in', href: '/login' },
        { label: 'New chronicle', href: '/login?mode=signup' },
      ],
    },
  ]
  return { triggers, columns }
}

function toDropGroups(columns: Column[]): { groups: DropGroup[]; includeSignOut: boolean } {
  const groups: DropGroup[] = []
  let includeSignOut = false
  for (const col of columns) {
    const linkEntries = col.items
      .filter((it): it is { label: string; href: string } => !('signout' in it))
      .map((it) => ({ type: 'link' as const, href: it.href, label: it.label }))
    groups.push({ label: col.label, entries: linkEntries })
    if (col.items.some((it) => 'signout' in it)) includeSignOut = true
  }
  return { groups, includeSignOut }
}

export function LandingNav({ signedIn, admin = false }: { signedIn: boolean; admin?: boolean }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<ColumnKey | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const megaRef = useRef<HTMLDivElement>(null)
  // Single close-timer shared by root and mega — leaving either schedules
  // close, entering either cancels.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { triggers, columns } = signedIn ? buildSignedIn(admin) : buildSignedOut()
  const { groups: mobileGroups, includeSignOut } = toDropGroups(columns)

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setHovered(null)
    }, 220)
  }
  const enter = (col?: ColumnKey) => {
    cancelClose()
    setOpen(true)
    if (col) setHovered(col)
  }
  const closeAll = () => {
    cancelClose()
    setOpen(false)
    setHovered(null)
  }

  // Anchor the mega to the masthead's bottom edge. Updates on open AND on
  // scroll, so the panel slides with the sticky masthead instead of
  // detaching at the page top vs scrolled state.
  useEffect(() => {
    if (!open) return
    const update = () => {
      const masthead = document.querySelector('nav.nav') as HTMLElement | null
      if (masthead && megaRef.current) {
        const rect = masthead.getBoundingClientRect()
        megaRef.current.style.top = `${Math.max(0, rect.bottom)}px`
      }
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [open])

  // Outside click + ESC close (allow clicks inside root OR mega).
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (megaRef.current?.contains(t)) return
      closeAll()
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAll()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <>
      <div
        ref={rootRef}
        className={`ln-root${open ? ' is-open' : ''}`}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <div className="ln-inline">
          {triggers.map((t, i) => {
            const isActive = hovered === t.column
            if (t.kind === 'link') {
              return (
                <Link
                  key={i}
                  href={t.href}
                  className={`ln-link${isActive ? ' is-active' : ''}`}
                  onMouseEnter={() => enter(t.column)}
                >
                  {t.label}
                </Link>
              )
            }
            return (
              <button
                key={i}
                type="button"
                className={`ln-link ln-trigger${isActive ? ' is-active' : ''}`}
                aria-expanded={isActive}
                onMouseEnter={() => enter(t.column)}
                onClick={() => enter(t.column)}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Mobile fallback */}
        <div className="ln-mobile-wrap">
          <NavDropdown groups={mobileGroups} position="right" includeSignOut={includeSignOut} />
        </div>
      </div>

      {/* Mega panel — sibling of ln-root in DOM so it shares the closeAll
          listener path, but position:fixed so it spans the full nav width.
          Top is dynamically set to the masthead's bottom edge. */}
      <div
        ref={megaRef}
        className={`ln-mega${open ? ' is-open' : ''}`}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        aria-hidden={!open}
      >
        <div className="ln-mega-grid">
          {columns.map((col) => (
            <section
              key={col.key}
              className={`ln-mega-col${hovered === col.key ? ' is-focus' : ''}`}
            >
              <div className="ln-mega-num">{col.num}</div>
              <div className="ln-mega-label">{col.label}</div>
              <ul>
                {col.items.map((item, ii) =>
                  'signout' in item ? (
                    <li key={ii}>
                      <form action="/auth/signout" method="post">
                        <button
                          type="submit"
                          className="ln-mega-signout"
                          onClick={closeAll}
                        >
                          {item.label} →
                        </button>
                      </form>
                    </li>
                  ) : (
                    <li key={ii}>
                      <Link href={item.href} onClick={closeAll}>
                        {item.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
