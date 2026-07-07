'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { readNavStack, writeNavStack } from '@/components/NavTracker'

// Back arrow that returns to the actual previous page. Resolution order:
//   1. The NavTracker visit stack (deterministic; survives races where a
//      fast click fires before the router commits the history entry, and
//      ignores forward-entry pollution in session history).
//   2. history.back() when the session has somewhere to go.
//   3. The declared fallback href (direct loads, external referrers,
//      middle/cmd-click, JS not yet hydrated).

export function BackButton({
  fallbackHref,
  ariaLabel = 'Back',
}: {
  fallbackHref: string
  ariaLabel?: string
}) {
  const router = useRouter()

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (typeof window === 'undefined') return

    // Use the live location, not React state: during a pending navigation
    // the rendered page and the committed URL can disagree, and the URL is
    // what the stack + history operate on.
    const current = window.location.pathname
    const stack = readNavStack()
    while (stack.length > 0 && stack[stack.length - 1] === current) stack.pop()
    const target = stack.pop()

    if (target && target !== current) {
      e.preventDefault()
      writeNavStack(stack)
      router.push(target)
      return
    }

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
