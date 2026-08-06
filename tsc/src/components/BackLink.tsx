'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { readNavStack, writeNavStack } from '@/components/NavTracker'

// "Back" means the previous page, everywhere it isn't deliberately something
// else.
//
// The declared href is a FALLBACK, not the destination. It only gets used
// when there is genuinely nowhere to go back to — a direct load, an external
// referrer, a cmd-click, or a click that lands before hydration. Every mobile
// bar used to ship its own bare <Link href={backHref}>, which meant back
// always fired the fallback: on /login and /pricing that is '/', so tapping
// back from inside a league or a game ejected you to the landing page.
//
// Resolution order:
//   1. The NavTracker visit stack (deterministic; survives races where a
//      fast click fires before the router commits the history entry, and
//      ignores forward-entry pollution in session history).
//   2. history.back() when the session has somewhere to go.
//   3. The declared fallback href.
//
// Deliberate exceptions that should NOT use this: LeagueBackLink and the
// dashboard's back slot walk UP one level rather than backwards, and the
// season archives have their own rules. Those are hierarchy, not history.
export function useBackNav() {
  const router = useRouter()

  return (e: React.MouseEvent<HTMLAnchorElement>) => {
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
    // else fall through to the href — the page was loaded directly with no
    // prior entry, so 'back' has no useful destination.
  }
}

/** Back affordance that brings its own styling and glyph. The bars each have
 *  their own (a disc on games, a pill on login/pricing), so only the
 *  behaviour is shared. For the standard nav arrow use <BackButton>. */
export function BackLink({
  href,
  className,
  ariaLabel = 'Back',
  children,
}: {
  /** Fallback only. See useBackNav. */
  href: string
  className?: string
  ariaLabel?: string
  children: React.ReactNode
}) {
  const onClick = useBackNav()
  return (
    <Link href={href} className={className} aria-label={ariaLabel} onClick={onClick}>
      {children}
    </Link>
  )
}
