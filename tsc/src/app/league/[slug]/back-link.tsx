'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Walks up exactly one level rather than jumping straight to the league
// hub from any depth. Opening /rivalries/new and hitting back used to
// land on the hub, skipping the rivalries list you came from.
//
//   /league/x/rivalries/new  →  /league/x/rivalries
//   /league/x/rivalries      →  /league/x
//   /league/x                →  /dashboard
export function LeagueBackLink({ slug }: { slug: string }) {
  const pathname = usePathname() ?? ''
  const hub = `/league/${slug}`
  // trailingSlash: true means the path can arrive with or without a
  // trailing slash; strip it before splitting so the last segment isn't
  // an empty string.
  const clean = pathname.replace(/\/+$/, '')
  const onHub = clean === hub

  let href: string
  let label: string
  if (onHub) {
    href = '/dashboard'
    label = 'Back to library'
  } else {
    const parent = clean.slice(0, clean.lastIndexOf('/'))
    // Never climb above the league hub, and never emit an empty href if
    // the pathname turns out to be something unexpected.
    href = parent.length >= hub.length && parent.startsWith(hub) ? parent : hub
    label = href === hub ? 'Back to league' : 'Back'
  }

  return (
    <Link href={href} className="dc-nav-icon" aria-label={label}>
      <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="7 1 1 7 7 13" />
      </svg>
    </Link>
  )
}
