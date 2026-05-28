'use client'

import Link from 'next/link'
import type React from 'react'

// Back arrow that prefers `history.back()` when the visitor arrived from
// another page on the same site (the typical "go back where I came from"
// expectation), and falls through to the declared href on direct loads,
// external referrers, and middle/cmd-click — those still want a real
// navigation, not a no-op.

export function BackButton({
  fallbackHref,
  ariaLabel = 'Back',
}: {
  fallbackHref: string
  ariaLabel?: string
}) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (typeof window === 'undefined') return
    // history.length > 1 means there's somewhere in the session history
    // to go back to. Works both for direct loads with a referrer AND for
    // Next.js App-Router client-side navigation — App Router pushState
    // extends session history but never updates document.referrer, so a
    // referrer-only check (the old logic) was bailing and letting the
    // fallback href win on every internal SPA hop.
    if (window.history.length > 1) {
      e.preventDefault()
      window.history.back()
    }
    // else fall through to fallbackHref — page was loaded directly with
    // no prior entry, so 'back' has no useful destination.
  }
  return (
    <Link href={fallbackHref} className="dc-nav-icon" aria-label={ariaLabel} onClick={onClick}>
      <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="7 1 1 7 7 13" />
      </svg>
    </Link>
  )
}
