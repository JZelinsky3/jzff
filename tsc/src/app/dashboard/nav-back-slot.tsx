'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Left slot of the dashboard nav. On /dashboard itself there's no "back" to
// go to — that's the root of the signed-in app — so we put a profile icon
// here that jumps to /account. On any sub-page like /dashboard/new, render
// a back arrow pointing to /dashboard instead.
export function DashboardNavBackSlot() {
  const pathname = usePathname() ?? ''
  const isRoot = pathname === '/dashboard' || pathname === '/dashboard/'

  if (isRoot) {
    return (
      <Link href="/account" className="dc-nav-icon" aria-label="Account">
        <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="8" cy="5.5" r="2.7" />
          <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        </svg>
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
