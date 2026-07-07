'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Left slot of the dashboard nav. On /dashboard itself there's no "back" to
// go to — that's the root of the signed-in app — so the slot carries a
// miniature membership card that links to /account: seal ring, member
// kicker, dotted signature line, and it lifts off the nav like a card
// being picked up. On any sub-page like /dashboard/new, render a back
// arrow pointing to /dashboard instead.
export function DashboardNavBackSlot() {
  const pathname = usePathname() ?? ''
  const isRoot = pathname === '/dashboard' || pathname === '/dashboard/'

  if (isRoot) {
    return (
      <Link href="/account" className="lib-mini-card" aria-label="Your account">
        <span className="lib-mini-card-seal" aria-hidden>★</span>
        <span className="lib-mini-card-text">
          <span className="lib-mini-card-kicker">TSC · Member</span>
          <span className="lib-mini-card-sig" aria-hidden />
        </span>
      </Link>
    )
  }

  return (
    <Link href="/dashboard" className="dc-nav-icon" aria-label="Back to your library">
      <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="7 1 1 7 7 13" />
      </svg>
    </Link>
  )
}
