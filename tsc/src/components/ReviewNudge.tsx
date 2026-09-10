'use client'

// A standing, dismissible prompt to leave a review, mounted once in the root
// layout so it reaches every React page instead of only /dashboard — where
// most visitors never go. Reviews don't need an account, so this shows to
// signed-out visitors too.
//
// Two shapes, because a full-width band reads very differently on the two:
//   • phone  — a slim strip at the top of the document flow, above the
//              masthead. Every mobile header on the site is `position:
//              sticky; top: 0`, so they slide up and stick as normal once
//              this scrolls away — no offsets to keep in sync.
//   • desktop — a small pill in the BOTTOM-LEFT. Not a band across the top
//              (which looks like a system alert on a 1400px page), and not
//              bottom-right, which the support widget already owns.
//
// Neither one sits over page content.

import { useCallback, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const DISMISS_KEY = 'tsc-review-nudge-dismissed'
const DISMISS_EVENT = 'tsc-review-nudge'

// Surfaces where the ask is wrong or in the way. The review page itself is
// the obvious one; the games boards own the bottom of the screen on a phone
// and pin their own fixed HUD; /admin is staff-only.
const HIDDEN_PREFIXES = ['/review', '/admin', '/login', '/auth', '/games/']

function isHidden(path: string): boolean {
  return HIDDEN_PREFIXES.some((p) => path === p || path.startsWith(p))
}

// The dismissal lives in localStorage, which the server can't read. Reading
// it through useSyncExternalStore (rather than an effect that flips state)
// means the server and the first client render agree on "hidden", so nobody
// who already dismissed it gets a flash of the prompt on every page load.
function subscribe(onChange: () => void): () => void {
  window.addEventListener(DISMISS_EVENT, onChange)
  return () => window.removeEventListener(DISMISS_EVENT, onChange)
}

function getSnapshot(): boolean {
  try {
    return !!localStorage.getItem(DISMISS_KEY)
  } catch {
    // Private-mode Safari throws. Showing the prompt is the harmless
    // direction — worst case they see it again next visit.
    return false
  }
}

export function ReviewNudge() {
  const pathname = usePathname()
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, () => true)

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* see getSnapshot — the dismissal just won't persist */
    }
    window.dispatchEvent(new Event(DISMISS_EVENT))
  }, [])

  if (dismissed || isHidden(pathname)) return null

  return (
    <div className="tsc-rev" data-review-nudge>
      <Link href="/review" className="tsc-rev-link" onClick={dismiss}>
        <span className="tsc-rev-stars" aria-hidden>
          ★★★★★
        </span>
        <span className="tsc-rev-text">
          <span className="tsc-rev-text-full">Enjoying the Chronicle? Leave a review</span>
          <span className="tsc-rev-text-short">Rate the Chronicle</span>
        </span>
      </Link>
      <button type="button" className="tsc-rev-x" onClick={dismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}
