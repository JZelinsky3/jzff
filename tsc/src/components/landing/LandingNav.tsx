'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { NavDropdown, type DropGroup, type DropEntry, type SubItem } from '@/components/NavDropdown'

// Landing-page nav, mega-menu shape (Nike / Gap style).
//   Desktop (>=720px): top-row text triggers in the masthead. Hovering
//   ANY trigger opens a single shared mega panel below the masthead with
//   every destination grouped into columns. The triggered group gets a
//   subtle focus highlight; the rest stay visible but slightly muted.
//   Trigger order matches column order so the eye reads left-to-right
//   between the two rows. Sub-pages of a section render as indented
//   children of a parent link.
//   Mobile (<720px): collapses to the shared NavDropdown hamburger.

type ColumnKey = 'library' | 'discover' | 'pricing' | 'guides' | 'demo' | 'account' | 'get-started'

type Trigger =
  | { kind: 'link'; label: string; href: string; column: ColumnKey; cta?: boolean }
  // Group triggers open the mega-panel on hover. If `href` is set they
  // also navigate on click — matching the way the Pricing trigger feels,
  // so users don't have to dig through the menu just to land on the
  // obvious destination.
  | { kind: 'group'; label: string; href?: string; column: ColumnKey }

type ColumnItem =
  | { label: string; href: string; indent?: boolean }
  | { signout: true; label: string }

type Column = {
  key: ColumnKey
  num: string
  label: string
  items: ColumnItem[]
}

const ROMAN = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.']

// Signed-in users get a single combined "Discover" column. Signed-out
// users see Pricing and Guides as their own separate columns + triggers
// (see PRICING_ITEMS / GUIDES_ITEMS below) so the marketing nav doesn't
// bury "Pricing" under a generic "Discover" header.
const DISCOVER_ITEMS: ColumnItem[] = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Compare plans', href: '/pricing/plans', indent: true },
  { label: 'About', href: '/about' },
  { label: 'Guides', href: '/guides' },
  { label: 'Commissioner mistakes',  href: '/guides/commissioner-mistakes',  indent: true },
  { label: 'Migrate fantasy league', href: '/guides/migrate-fantasy-league', indent: true },
  // Platform how-tos collapsed into a single setup hub to avoid one nav
  // line per host. The hub at /guides/set-up-your-league/ lists all four.
  { label: 'Set up your league',     href: '/guides/set-up-your-league',     indent: true },
]

// Pricing column (signed-out only). Small column — three rows. Reads as
// a buyer's pillar: tiers, plan compare, and the about page that explains
// what they're paying for.
const PRICING_ITEMS: ColumnItem[] = [
  { label: 'Pricing tiers', href: '/pricing' },
  { label: 'Compare plans', href: '/pricing/plans' },
  { label: 'About the project', href: '/about' },
]

// Guides column (signed-out only). Groups buyer's comparisons + a single
// "Set up your league" link that goes to the platform-setup hub (which in
// turn links to each platform). Avoids cluttering the nav with one line
// per host when most visitors only need one of them.
const GUIDES_ITEMS: ColumnItem[] = [
  { label: 'All guides', href: '/guides' },
  { label: 'Best almanac services',      href: '/guides/best-fantasy-football-almanac',               indent: true },
  { label: 'League management software', href: '/guides/fantasy-football-league-management-software', indent: true },
  { label: 'Best recap services',        href: '/guides/best-fantasy-football-recap',                 indent: true },
  { label: 'Trade analysis tools',       href: '/guides/fantasy-football-trade-analyzer',             indent: true },
  { label: 'Set up your league',         href: '/guides/set-up-your-league',                          indent: true },
]

// Demo league chapters — listed as indented sub-pages of the "Demo
// league" parent so the relationship is visually obvious. Pickems +
// Power merged into a single Live entry to match the leagues nav.
const DEMO_CHAPTERS: ColumnItem[] = [
  { label: 'Demo league', href: '/demo/' },
  { label: 'Standings',   href: '/demo/standings.html',  indent: true },
  { label: 'Seasons',     href: '/demo/seasons/',         indent: true },
  { label: 'Drafts',      href: '/demo/draft/',           indent: true },
  { label: 'Records',     href: '/demo/records.html',     indent: true },
  { label: 'Managers',    href: '/demo/managers/',        indent: true },
  { label: 'Rivalries',   href: '/demo/rivalries/',       indent: true },
  { label: 'Live',        href: '/demo/pickems/',         indent: true },
]

function buildSignedIn(admin: boolean): { triggers: Trigger[]; columns: Column[] } {
  // Nav trigger order matches column order so the eye reads cleanly
  // left-to-right between the masthead row and the mega panel below.
  const triggers: Trigger[] = [
    { kind: 'group', label: 'Library',  href: '/dashboard', column: 'library'  },
    { kind: 'link',  label: 'Pricing',  href: '/pricing',   column: 'discover' },
    { kind: 'group', label: 'Demo',     href: '/demo/',     column: 'demo'     },
    { kind: 'group', label: 'Account',  href: '/account',   column: 'account'  },
  ]
  const accountItems: ColumnItem[] = [
    { label: 'Profile', href: '/account' },
    ...(admin ? [{ label: 'Site admin console', href: '/admin' } as ColumnItem] : []),
    { signout: true, label: 'Sign out' },
  ]
  const columns: Column[] = [
    {
      key: 'library', num: ROMAN[0], label: 'Library',
      items: [
        { label: 'Your leagues',  href: '/dashboard' },
        { label: 'New chronicle', href: '/dashboard/new' },
        { label: 'The Clubhouse', href: '/hub' },
        { label: 'Demo league',   href: '/demo/' },
      ],
    },
    { key: 'discover', num: ROMAN[1], label: 'Discover',       items: DISCOVER_ITEMS },
    { key: 'demo',     num: ROMAN[2], label: 'Demo chronicle', items: DEMO_CHAPTERS },
    { key: 'account',  num: ROMAN[3], label: 'Account',        items: accountItems },
  ]
  return { triggers, columns }
}

function buildSignedOut(): { triggers: Trigger[]; columns: Column[] } {
  // Signed-out triggers split Pricing and Guides into their own columns
  // (previously bundled under "Discover"). Reading order: Pricing →
  // Guides → Demo → Login CTA. Matches the mental model of a visitor
  // evaluating the product: cost, learn, try, sign up.
  const triggers: Trigger[] = [
    { kind: 'group', label: 'Pricing', href: '/pricing', column: 'pricing' },
    { kind: 'group', label: 'Guides',  href: '/guides',  column: 'guides' },
    { kind: 'group', label: 'Demo',    href: '/demo/',   column: 'demo' },
    { kind: 'link',  label: 'Login',   href: '/login',   column: 'get-started', cta: true },
  ]
  const columns: Column[] = [
    { key: 'pricing', num: ROMAN[0], label: 'Pricing',         items: PRICING_ITEMS },
    { key: 'guides',  num: ROMAN[1], label: 'Guides',          items: GUIDES_ITEMS },
    { key: 'demo',    num: ROMAN[2], label: 'Demo chronicle',  items: DEMO_CHAPTERS },
    {
      key: 'get-started', num: ROMAN[3], label: 'Get started',
      items: [
        { label: 'Sign in', href: '/login' },
        { label: 'New chronicle', href: '/login?mode=signup' },
      ],
    },
  ]
  return { triggers, columns }
}

// Build mobile dropdown groups from the desktop columns. Collapses each
// "parent + indented children" run into a single expandable SubGroup so
// the top-level menu only shows ~4-5 rows per column instead of dumping
// every guide / chapter into one long scroll.
function toDropGroups(columns: Column[]): { groups: DropGroup[]; includeSignOut: boolean } {
  const groups: DropGroup[] = []
  let includeSignOut = false
  for (const col of columns) {
    const entries: DropEntry[] = []
    let i = 0
    while (i < col.items.length) {
      const it = col.items[i]
      if ('signout' in it) {
        includeSignOut = true
        i++
        continue
      }
      // Collect any indented items that immediately follow as children.
      const children: SubItem[] = []
      let j = i + 1
      while (j < col.items.length) {
        const next = col.items[j]
        if ('signout' in next) break
        if (!next.indent) break
        children.push({ kind: 'link', href: next.href, label: next.label })
        j++
      }
      if (children.length > 0) {
        // Parent gets included as the first sub-link so users can still
        // reach it (it has its own page) without losing the children.
        entries.push({
          type: 'sub',
          label: it.label,
          items: [{ kind: 'link', href: it.href, label: it.label }, ...children],
        })
      } else {
        entries.push({ type: 'link', href: it.href, label: it.label })
      }
      i = j
    }
    groups.push({ label: col.label, entries })
  }
  return { groups, includeSignOut }
}

export function LandingNav({ signedIn, admin = false }: { signedIn: boolean; admin?: boolean }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<ColumnKey | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const megaRef = useRef<HTMLDivElement>(null)
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
              if (t.cta) {
                // Pill-shaped CTA — same shape used by the guides + pricing
                // nav so the "log in" affordance reads identically across
                // the marketing pages.
                return (
                  <Link
                    key={i}
                    href={t.href}
                    className="pricing-nav-cta"
                    onMouseEnter={() => enter(t.column)}
                    onClick={closeAll}
                  >
                    {t.label} <span className="pricing-nav-cta-arrow" aria-hidden>→</span>
                  </Link>
                )
              }
              return (
                <Link
                  key={i}
                  href={t.href}
                  className={`ln-link${isActive ? ' is-active' : ''}`}
                  onMouseEnter={() => enter(t.column)}
                  onClick={closeAll}
                >
                  {t.label}
                </Link>
              )
            }
            // Group trigger with a destination: clicking navigates to the
            // group's "home" page (e.g. Demo → /demo/); hovering opens the
            // mega panel for users who want a sub-item.
            if (t.href) {
              return (
                <Link
                  key={i}
                  href={t.href}
                  className={`ln-link ln-trigger${isActive ? ' is-active' : ''}`}
                  aria-expanded={isActive}
                  onMouseEnter={() => enter(t.column)}
                  onClick={closeAll}
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

        <div className="ln-mobile-wrap">
          <NavDropdown groups={mobileGroups} position="right" includeSignOut={includeSignOut} />
        </div>
      </div>

      <div
        ref={megaRef}
        className={`ln-mega${open ? ' is-open' : ''}`}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        aria-hidden={!open}
      >
        <div className={`ln-mega-grid ln-mega-grid--cols-${columns.length}`}>
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
                      <Link
                        href={item.href}
                        onClick={closeAll}
                        className={item.indent ? 'is-indent' : undefined}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))}

          {/* Almanac notes — fills the right edge with a two-section
              changelog: what shipped recently and what's queued up.
              Static content; update the two lists in this component
              when a feature lands or moves between New and Soon. */}
          <aside className="ln-mega-aside" aria-hidden="true">
            <div className="ln-mega-aside-kicker">★ Almanac notes ★</div>
            <div className="ln-mega-aside-rule" />

            <div className="ln-mega-aside-section">
              <div className="ln-mega-aside-section-label">New</div>
              <ul>
                <li>
                  <span className="ln-mega-aside-item-name">Live Season Hub</span>
                  <span className="ln-mega-aside-item-detail">Matchup Preview + Best Coach.</span>
                </li>
                <li>
                  <span className="ln-mega-aside-item-name">Trade Grader</span>
                  <span className="ln-mega-aside-item-detail">Plus Milestones + Records Watch.</span>
                </li>
                <li>
                  <span className="ln-mega-aside-item-name">Manager DNA</span>
                  <span className="ln-mega-aside-item-detail">Live-season tendencies + tells.</span>
                </li>
                <li>
                  <span className="ln-mega-aside-item-name">Free tier</span>
                  <span className="ln-mega-aside-item-detail">UDFA · one league, forever.</span>
                </li>
              </ul>
            </div>

            <div className="ln-mega-aside-section">
              <div className="ln-mega-aside-section-label">Coming soon</div>
              <ul>
                <li>
                  <span className="ln-mega-aside-item-name">Weekly Recap</span>
                  <span className="ln-mega-aside-item-detail">Auto-written every Tuesday.</span>
                </li>
                <li>
                  <span className="ln-mega-aside-item-name">Underdog Fantasy</span>
                  <span className="ln-mega-aside-item-detail">Fifth platform on the way.</span>
                </li>
              </ul>
            </div>

            <Link href="/about" className="ln-mega-aside-cta" onClick={closeAll}>
              About the chronicle →
            </Link>
          </aside>
        </div>
      </div>
    </>
  )
}
