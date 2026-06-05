'use client'

import { useState } from 'react'

// Switches the pricing surface between the paid 3-column grid and the
// free/UDFA card. The current view is persisted to a cookie so the
// server can read it and render the right view on first paint — no
// useEffect, no flash, and no Safari-specific localStorage quirks
// (which is why this isn't using localStorage anymore).
//
// `initialView` should be the server-resolved value: read the cookie
// in the page server component and pass it down here.
export function PricingViewTabs({
  paid,
  free,
  initialView = 'paid',
  cookieName = 'tsc-pricing-view',
}: {
  paid: React.ReactNode
  free: React.ReactNode
  initialView?: 'paid' | 'free'
  cookieName?: string
}) {
  const [view, setView] = useState<'paid' | 'free'>(initialView)

  function selectView(next: 'paid' | 'free') {
    setView(next)
    // One-year cookie, path=/ so it applies across /pricing and
    // /pricing/plans. SameSite=Lax is the safe default for first-party
    // preference cookies; no Secure flag so it also works on http://localhost.
    try {
      document.cookie = `${cookieName}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    } catch {
      /* cookies blocked — UI still works for the current session */
    }
  }
  // Single wrapping div rather than a fragment — React 19 / Next 16 treat
  // multi-child fragments returned from a component as a positional list,
  // and warn about missing keys at the parent call site even when the
  // children are stable JSX literals.
  // Each branch wrapped in a stable parent div with an explicit, distinct
  // key so React doesn't see (tabs-wrap, ternary-result) as a positional
  // list and warn at the parent call site.
  return (
    <div className="pricing-view-tabs-root">
      <div className="pricing-view-tabs-wrap" key="tabs">
        <div role="tablist" aria-label="Pricing view" className="pricing-view-tabs">
          <button
            role="tab"
            aria-selected={view === 'paid'}
            className={`pricing-view-tab${view === 'paid' ? ' is-active' : ''}`}
            onClick={() => selectView('paid')}
          >
            Paid
          </button>
          <button
            role="tab"
            aria-selected={view === 'free'}
            className={`pricing-view-tab${view === 'free' ? ' is-active' : ''}`}
            onClick={() => selectView('free')}
          >
            Free
          </button>
        </div>
      </div>
      <div className="pricing-view-content" key={view}>
        {view === 'paid' ? paid : free}
      </div>
    </div>
  )
}
