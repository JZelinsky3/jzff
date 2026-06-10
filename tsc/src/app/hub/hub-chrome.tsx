'use client'

// Client chrome for the Clubhouse shell: section tabs with active state
// and the day/night theme toggle. The theme is a data-attribute on
// <html> (set pre-paint by the root layout's restore script, so there's
// no flash and it survives client-side navigation) — this button just
// flips it and persists the choice.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export const HUB_THEME_KEY = 'tsc-hub-theme'

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
// instead of dumping to the landing page.
export function HubLoginButton() {
  const pathname = usePathname()
  return (
    <Link href={`/login?from=${encodeURIComponent(pathname || '/hub')}`} className="hub-masthead-login">
      Login
    </Link>
  )
}

export function HubThemeToggle() {
  function toggle() {
    // Theme lives on <html> (set pre-paint by the root layout's restore
    // script) so it survives client-side navigation between pages.
    const root = document.documentElement
    const next = root.getAttribute('data-hub-theme') === 'night' ? 'day' : 'night'
    if (next === 'night') root.setAttribute('data-hub-theme', 'night')
    else root.removeAttribute('data-hub-theme')
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
