'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markMembersReviewed } from './actions'

// Manual signal for the hub onboarding checklist. Member-edit actions
// (rename, merge, hide, alumni override, delete) all stamp this
// automatically — this button is for the "I looked at the list and it's
// fine as-is" case so the step doesn't sit unchecked forever.
export function MarkReviewedButton({
  leagueId,
  reviewedAt,
}: {
  leagueId: string
  reviewedAt: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (reviewedAt) {
    return (
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '.62rem',
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
        }}
        title={`Marked reviewed ${new Date(reviewedAt).toLocaleString()}`}
      >
        ✓ Reviewed
      </span>
    )
  }

  return (
    <button
      type="button"
      className="dc-btn"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const r = await markMembersReviewed(leagueId)
          if (r.ok) router.refresh()
        })
      }}
    >
      {pending ? 'Marking…' : 'Mark members reviewed →'}
    </button>
  )
}
