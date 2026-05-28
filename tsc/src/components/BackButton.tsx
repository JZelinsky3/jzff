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
    if (typeof document === 'undefined' || !document.referrer) return
    try {
      const ref = new URL(document.referrer)
      if (ref.origin !== window.location.origin) return
      // Don't loop back to the same page (some browsers leave the
      // current URL as referrer after a reload).
      if (ref.pathname === window.location.pathname && ref.search === window.location.search) return
      e.preventDefault()
      window.history.back()
    } catch {
      // malformed referrer — let the link navigate normally
    }
  }
  return (
    <Link href={fallbackHref} className="dc-nav-icon" aria-label={ariaLabel} onClick={onClick}>
      <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="7 1 1 7 7 13" />
      </svg>
    </Link>
  )
}
