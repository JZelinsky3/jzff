'use client'

// Client chrome for the Clubhouse shell: section tabs with active state
// and the day/night theme toggle. The theme is a data-attribute on
// <html> (set pre-paint by the root layout's restore script, so there's
// no flash and it survives client-side navigation) — this button just
// flips it and persists the choice.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export const HUB_THEME_KEY = 'tsc-hub-theme'

// Safari tints its toolbar from <meta name="theme-color">. The toolbar stays
// dark in both skins so it reads as one piece with the always-dark mobile
// dock (a cream toolbar butted against the black dock looked broken). Kept in
// sync on toggle and when the hub mounts via a client-side navigation (the
// root layout's pre-paint script only runs on full loads).
function syncThemeColorMeta() {
  const night = document.documentElement.getAttribute('data-hub-theme') === 'night'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', night ? '#0d0d0d' : '#100e0a')
}

const TABS = [
  { href: '/hub', label: 'Front Desk', num: 'I' },
  { href: '/hub/whats-new', label: 'The Dispatch', num: 'II' },
  { href: '/hub/numbers', label: 'The Census', num: 'III' },
  { href: '/hub/records', label: 'The Hall', num: 'IV' },
  { href: '/hub/analyzer', label: 'Trade Room', num: 'V' },
  { href: '/hub/explore', label: 'The Newsstand', num: 'VI' },
]

export function HubTabs() {
  const pathname = usePathname()
  return (
    <nav className="hub-tabs" aria-label="Clubhouse sections">
      {TABS.map((t) => {
        const active = t.href === '/hub' ? pathname === '/hub' : pathname.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href} className={`hub-tab${active ? ' active' : ''}`}>
            <span className="hub-tab-num">{t.num}</span>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

// Masthead Login button (guests). Client component so it can carry the
// CURRENT hub page in the `from` param — the login page uses it for both
// its back arrow and the post-auth destination, so "back" returns here
// instead of dumping to the landing page. `icon` renders the compact
// square used by the Pocket Clubhouse bar instead of the text pill.
export function HubLoginButton({ icon = false }: { icon?: boolean }) {
  const pathname = usePathname()
  const href = `/login?from=${encodeURIComponent(pathname || '/hub')}`
  if (icon) {
    return (
      <Link href={href} className="mhb-bar-ico" aria-label="Sign in">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="8.2" r="3.6" />
          <path d="M5 20c.6-3.6 3.4-5.4 7-5.4s6.4 1.8 7 5.4" />
        </svg>
      </Link>
    )
  }
  return (
    <Link href={href} className="hub-masthead-login">
      Login
    </Link>
  )
}

// ── Pocket Clubhouse dock ──────────────────────────────────────
// Fixed bottom tab bar for the mobile tree: the six wings, one thumb.
// Same routes as HubTabs; short labels because 6 tabs share ~390px.
const DOCK: { href: string; label: string; icon: React.ReactNode }[] = [
  {
    href: '/hub',
    label: 'Desk',
    // service bell
    icon: <path d="M5.5 16.5a6.5 6.5 0 0 1 13 0 M3.5 19.5h17 M12 6.5v3.5 M10 6.5h4" />,
  },
  {
    href: '/hub/whats-new',
    label: 'News',
    // folded paper
    icon: <path d="M4 5h13v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5z M17 8h3v9a2 2 0 0 1-2 2 M7 9h7 M7 12.5h7" />,
  },
  {
    href: '/hub/numbers',
    label: 'Census',
    // tallies
    icon: <path d="M5.5 20v-7 M12 20V5 M18.5 20v-10 M3 20h18" />,
  },
  {
    href: '/hub/records',
    label: 'Hall',
    // trophy
    icon: <path d="M8 4h8v5a4 4 0 0 1-8 0V4z M8 5H5a3 3 0 0 0 3 3.6 M16 5h3a3 3 0 0 1-3 3.6 M12 13v4 M8.5 20h7" />,
  },
  {
    href: '/hub/analyzer',
    label: 'Trade',
    // swap arrows
    icon: <path d="M4 8.5h13 M14 5.5l3 3-3 3 M20 15.5H7 M10 12.5l-3 3 3 3" />,
  },
  {
    href: '/hub/explore',
    label: 'Rack',
    // newsstand awning
    icon: <path d="M5 9.5 6 5h12l1 4.5 M5 9.5V20h14V9.5 M5 9.5a2.35 2.35 0 0 0 4.7 0 2.35 2.35 0 0 0 4.6 0 2.35 2.35 0 0 0 4.7 0 M10 20v-5.5h4V20" />,
  },
]

export function HubMobileDock() {
  const pathname = usePathname()
  return (
    <nav className="mhb-dock" aria-label="Clubhouse wings">
      {DOCK.map((d) => {
        const active = d.href === '/hub' ? pathname === '/hub' : pathname.startsWith(d.href)
        return (
          <Link key={d.href} href={d.href} className={`mhb-dock-item${active ? ' active' : ''}`}>
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {d.icon}
            </svg>
            {d.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function HubThemeToggle() {
  useEffect(() => {
    syncThemeColorMeta()
  }, [])

  function toggle() {
    // Theme lives on <html> (set pre-paint by the root layout's restore
    // script) so it survives client-side navigation between pages.
    const root = document.documentElement
    const next = root.getAttribute('data-hub-theme') === 'night' ? 'day' : 'night'
    if (next === 'night') root.setAttribute('data-hub-theme', 'night')
    else root.removeAttribute('data-hub-theme')
    syncThemeColorMeta()
    try {
      localStorage.setItem(HUB_THEME_KEY, next)
    } catch {
      /* private mode — theme just won't persist */
    }
  }
  return (
    <button className="hub-theme-btn" onClick={toggle} aria-label="Toggle day / night theme">
      <svg className="hub-theme-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <g className="sun">
          <circle cx="12" cy="12" r="4.2" />
          <line x1="12" y1="2.5" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="21.5" />
          <line x1="2.5" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="21.5" y2="12" />
          <line x1="5.2" y1="5.2" x2="6.9" y2="6.9" />
          <line x1="17.1" y1="17.1" x2="18.8" y2="18.8" />
          <line x1="5.2" y1="18.8" x2="6.9" y2="17.1" />
          <line x1="17.1" y1="6.9" x2="18.8" y2="5.2" />
        </g>
        <path className="moon" d="M20 13.2A8 8 0 1 1 10.8 4 6.4 6.4 0 0 0 20 13.2z" fill="currentColor" stroke="none" />
      </svg>
      <span className="hub-theme-lbl">Lights</span>
    </button>
  )
}
