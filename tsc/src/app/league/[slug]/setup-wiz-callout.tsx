'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { dismissWelcomeCallout } from './welcome/actions'

// "Setup wizard" callout for the league hub. Owner-only, dismissable —
// click the small check chip and it disappears for this league forever
// (the wizard route stays reachable; this is just the prominent card).
export function SetupWizCallout({
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
    // The whole card is a <Link>. Without stop+prevent the dismiss chip's
    // click bubbles up and navigates to /welcome before the action fires.
    e.preventDefault()
    e.stopPropagation()
    setHidden(true)
    startTransition(async () => {
      const r = await dismissWelcomeCallout(leagueId)
      if (!r.ok) {
        // Roll back the optimistic hide if the action failed.
        setHidden(false)
        return
      }
      router.refresh()
    })
  }

  if (hidden) return null

  return (
    <Link href={`/league/${slug}/welcome`} className="setup-wiz-callout">
      <div className="setup-wiz-callout-mark" aria-hidden>
        <span>✦</span>
      </div>
      <div className="setup-wiz-callout-body">
        <div className="setup-wiz-callout-kicker">★ For commissioners ★</div>
        <div className="setup-wiz-callout-title">
          Setup <em>wizard.</em>
        </div>
        <div className="setup-wiz-callout-desc">
          A guided walk through sources, sync, members, rivalries, and publish.
          Start, skip steps, come back later.
        </div>
      </div>
      <div className="setup-wiz-callout-actions">
        <div className="setup-wiz-callout-cta" aria-hidden>
          <span>Open</span>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 3 11 8 6 13" />
          </svg>
        </div>
        <button
          type="button"
          className="setup-wiz-callout-done"
          onClick={onDismiss}
          disabled={busy}
          title="Mark complete and hide this card"
          aria-label="Mark setup wizard complete"
        >
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 8.5 7 12 13 4.5" />
          </svg>
          <span>Done</span>
        </button>
      </div>
    </Link>
  )
}
