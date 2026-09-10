'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { dismissSeasonNotice } from '@/app/league/[slug]/welcome/actions'
import { seasonNoticeCopy, type SeasonNotice } from '@/lib/seasonNotice'

// Mobile "the season has kicked off" pill. Same row shape as
// MobileSetupWizCallout so the hub keeps one rhythm; the star mark and the
// week in the title are what mark it as the urgent one. Copy comes from
// lib/seasonNotice so the phone and the desktop card never drift.
//
// Dismiss stores the year, so an archive-only league quiets down for this
// season but still hears about it next September.
export function MobileSeasonLiveCallout({
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
    <div className="mwc">
      <Link href={copy.href(slug)} className="mwc-row">
        <span className="mwc-spark" aria-hidden>★</span>
        <span className="mwc-body">
          <span className="mwc-kicker">Week {notice.week} has kicked off</span>
          <span className="mwc-title">
            {notice.kind === 'no-season' ? (
              <>Sync <em>{notice.year}</em></>
            ) : notice.kind === 'not-live' ? (
              <>Start the <em>season</em></>
            ) : (
              <>Set the <em>week</em></>
            )}
          </span>
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
        aria-label="Hide the season notice for this year"
      >
        <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 8.5 7 12 13 4.5" />
        </svg>
        <span>Hide</span>
      </button>
    </div>
  )
}
