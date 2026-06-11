'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// The site-wide mobile nav. Shown only on phones (CSS toggles it via
// `.msm-root` at the 720px breakpoint). Replaces every page's bespoke
// right-side cluster (LandingNav.ln-inline, NavDropdown, pricing-nav-right,
// AccountNavMenu) on mobile — those collapse to display:none via globals.css.
//
// Item lists are baked into this component, not passed in. The whole point
// is uniformity: every page shows the same four-row menu, signed-in or
// signed-out. If a page-specific shortcut is needed later, add it here.

export function MobileSiteMenu({
  signedIn,
  email = null,
  admin = false,
}: {
  signedIn: boolean
  email?: string | null
  admin?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Close on route change. Clicks on Links don't fire onClick handlers
  // reliably when the new page replaces the tree, so we watch pathname.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent | TouchEvent) {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc, { passive: true })
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // Lock background scroll while the menu is open — feels like a sheet,
  // and prevents the backdrop from sliding underneath the panel.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const initial = signedIn && email
    ? email.trim().charAt(0).toUpperCase() || '★'
    : null

  // The initial-circle avatar is reserved for the landing page — that's
  // where surfacing "you're signed in" doubles as a welcome cue. Every
  // other surface falls back to a hamburger so the trigger isn't styled
  // like an identity badge in contexts that aren't about your profile.
  const isLanding = pathname === '/' || pathname === ''
  const showInitial = !!initial && isLanding

  // Identity header (avatar + email at the top of the panel) only makes
  // sense on pages where seeing "you" is part of the page's job — landing,
  // account/billing surfaces. On league management or the public almanac
  // it just clutters the menu, so suppress it there.
  const isLeaguePage =
    pathname.startsWith('/league/') || pathname.startsWith('/leagues/')
  const showIdentityHeader = signedIn && !!email && !isLeaguePage

  // Items in the panel. Order is fixed across every page so the menu is
  // muscle-memory predictable: Account → Library → Clubhouse → page-
  // contextual links. Per-page rules then trim items that don't belong
  // (e.g. Pricing is noise inside a league context; Guides on the public
  // almanac doesn't help the visitor). The current-page filter still
  // strips whatever row matches the URL you're already on.
  type MenuItem = { href: string; label: string; hideOnPrefix?: string[] }
  const baseItems: MenuItem[] = signedIn
    ? [
        { href: '/account',   label: 'Account'   },
        { href: '/dashboard', label: 'Library'   },
        { href: '/hub',       label: 'Clubhouse' },
        // Pricing is hidden inside league surfaces (both the commissioner
        // side and the public almanac) — users in either context aren't
        // shopping plans from there.
        { href: '/pricing',   label: 'Pricing', hideOnPrefix: ['/league/', '/leagues/'] },
        // Guides stay available on the commissioner /league/[slug]/* pages
        // (setup help) but disappear on the public almanac /leagues/[slug]/*.
        { href: '/guides',    label: 'Guides',  hideOnPrefix: ['/leagues/'] },
        ...(admin ? [{ href: '/admin', label: 'Admin' } as MenuItem] : []),
      ]
    : [
        { href: '/pricing',   label: 'Pricing', hideOnPrefix: ['/league/', '/leagues/'] },
        { href: '/guides',    label: 'Guides',  hideOnPrefix: ['/leagues/'] },
        { href: '/hub',       label: 'Clubhouse' },
      ]

  // Hide the row whose href matches the page we're on. For /guides and
  // /pricing the prefix form also catches sub-pages (e.g. /pricing/plans,
  // /guides/sleeper-league-history) so the menu doesn't offer a redundant
  // jump to the parent of the page you're already inside.
  const onPage = (href: string) =>
    pathname === href ||
    (href !== '/' && pathname.startsWith(href + '/'))
  const items = baseItems.filter((i) => {
    if (onPage(i.href)) return false
    if (i.hideOnPrefix?.some((p) => pathname.startsWith(p))) return false
    return true
  })

  return (
    <div ref={rootRef} className={`msm-root${isLanding ? ' msm-root--landing' : ''}${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`msm-trigger msm-trigger--${showInitial ? 'avatar' : 'hamburger'}`}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {showInitial ? (
          <span className="msm-trigger-initial" aria-hidden>{initial}</span>
        ) : (
          <svg
            className="msm-trigger-icon"
            aria-hidden
            viewBox="0 0 20 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <line x1="1" y1="2" x2="19" y2="2" />
            <line x1="1" y1="7" x2="19" y2="7" />
            <line x1="1" y1="12" x2="19" y2="12" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div className="msm-backdrop" aria-hidden onClick={() => setOpen(false)} />
          <div className="msm-panel" role="menu">
            {showIdentityHeader && (
              <div className="msm-header">
                <span className="msm-header-avatar" aria-hidden>{initial}</span>
                <span className="msm-header-email">{email}</span>
              </div>
            )}

            {items.map((it) => (
              <Link key={it.href} href={it.href} className="msm-row" role="menuitem">
                {it.label}
              </Link>
            ))}

            {signedIn ? (
              <form action="/auth/signout" method="post" className="msm-row-form">
                <button
                  type="submit"
                  className="msm-row msm-row-signout"
                  role="menuitem"
                >
                  Sign out
                </button>
              </form>
            ) : (
              <Link href="/login" className="msm-row msm-row-signin" role="menuitem">
                Sign in
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}
