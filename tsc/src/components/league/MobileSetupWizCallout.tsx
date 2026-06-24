'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { dismissWelcomeCallout } from '@/app/league/[slug]/welcome/actions'

// Mobile-native version of SetupWizCallout. The desktop one is a wide
// horizontal card with kicker + headline + ghost done-chip; that shape
// reads as desktop chrome cramped into a phone. Here we mirror the
// other mobile-hub pills: a single tappable row, gold sparkle, two-line
// title/sub, chevron on the right, a small "Done" pill underneath that
// dismisses the card without navigating.
export function MobileSetupWizCallout({
  leagueId,
  slug,
}: {
  leagueId: string
  slug: string
}) {
  const router = useRouter()
  const [hidden, setHidden] = useState(false)
  const [busy, startTransition] = useTransition()

  function onDismiss(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setHidden(true)
    startTransition(async () => {
      const r = await dismissWelcomeCallout(leagueId)
      if (!r.ok) {
        setHidden(false)
        return
      }
      router.refresh()
    })
  }

  if (hidden) return null

  return (
    <div className="mwc">
      <Link href={`/league/${slug}/welcome`} className="mwc-row">
        <span className="mwc-spark" aria-hidden>✦</span>
        <span className="mwc-body">
          <span className="mwc-kicker">For commissioners</span>
          <span className="mwc-title">Setup <em>wizard</em></span>
        </span>
        <span className="mwc-chev" aria-hidden>
          <svg viewBox="0 0 8 14" width="8" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 1 7 7 1 13" />
          </svg>
        </span>
      </Link>
      <button
        type="button"
        className="mwc-done"
        onClick={onDismiss}
        disabled={busy}
        aria-label="Mark setup wizard complete"
      >
        <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 8.5 7 12 13 4.5" />
        </svg>
        <span>Done</span>
      </button>
    </div>
  )
}
