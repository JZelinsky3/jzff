'use client'

// One "I was here today" ping per browser tab session.
//
// Mounted in the root layout beside AttributionCapture. The guard is
// sessionStorage rather than a date in localStorage on purpose: a date guard
// would fire exactly once per user per day and make the hit counter a
// constant 1, while a per-session guard counts "came back after dinner" as
// the second visit it actually is. Closing every tab and returning is a new
// session, which is the honest definition of a return.
//
// The route no-ops when signed out, so this component does not need to know
// whether there is a session -- and must not guess, because the layout is
// cached and would hand a stale answer to a user who just signed in.

import { useEffect } from 'react'

const KEY = 'tsc_visit_pinged'

export function VisitPing() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return
      sessionStorage.setItem(KEY, '1')
    } catch {
      // Private-mode storage errors: skip the ping rather than ping on every
      // single navigation for the rest of the session.
      return
    }

    fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: window.location.pathname.slice(0, 200) }),
      keepalive: true,
    }).catch(() => {
      // Offline or blocked. Let the next session try again.
      try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
    })
  }, [])

  return null
}
