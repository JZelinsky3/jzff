'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { dismissSeasonNotice } from './welcome/actions'
import { seasonNoticeCopy, type SeasonNotice } from '@/lib/seasonNotice'

// "The season has kicked off" callout for the league hub. Same card shape
// as SetupWizCallout so the hub keeps one visual language, with a rust
// accent instead of gold: the wizard is an optional nicety, this one is
// something that needs doing before the week rolls over.
//
// Dismiss is per-year, not forever. An archive-only league shouldn't be
// nagged all autumn, but it should still hear about it next September.
export function SeasonLiveCallout({
  leagueId,
  slug,
  notice,
}: {
  leagueId: string
  slug: string
  notice: SeasonNotice
}) {
  const router = useRouter()
  const [hidden, setHidden] = useState(false)
  const [busy, startTransition] = useTransition()
  const copy = seasonNoticeCopy(notice)

  function onDismiss(e: React.MouseEvent) {
    // The card is a <Link>; without stop+prevent the chip navigates too.
    e.preventDefault()
    e.stopPropagation()
    setHidden(true)
    startTransition(async () => {
      const r = await dismissSeasonNotice(leagueId, notice.year)
      if (!r.ok) {
        setHidden(false)
        return
      }
      router.refresh()
    })
  }

  if (hidden) return null

  return (
    <Link href={copy.href(slug)} className="setup-wiz-callout is-season">
      <div className="setup-wiz-callout-mark" aria-hidden>
        <span>★</span>
      </div>
      <div className="setup-wiz-callout-body">
        <div className="setup-wiz-callout-kicker">★ The season is under way ★</div>
        <div className="setup-wiz-callout-title">
          {copy.title} <em>{copy.titleEm}</em>
        </div>
        <div className="setup-wiz-callout-desc">{copy.desc}</div>
      </div>
      <div className="setup-wiz-callout-actions">
        <div className="setup-wiz-callout-cta" aria-hidden>
          <span>{copy.cta}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 3 11 8 6 13" />
          </svg>
        </div>
        <button
          type="button"
          className="setup-wiz-callout-done"
          onClick={onDismiss}
          disabled={busy}
          title={`Hide this until the ${notice.year + 1} season`}
          aria-label="Hide the season notice for this year"
        >
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 8.5 7 12 13 4.5" />
          </svg>
          <span>Hide</span>
        </button>
      </div>
    </Link>
  )
}
