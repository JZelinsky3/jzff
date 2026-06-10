'use client'

// 1-line league recap stripe. Shows when phase === 'live'. Derives a few
// quick counts (Big Moments, players ruled out post-kickoff, close games) and
// renders them as a story-style summary. Dismissable per-session.

import { useMemo, useState } from 'react'
import type { SlLeague } from '@/lib/sundayLive/types'

function isOut(s: string | null): boolean {
  if (!s) return false
  const u = s.toLowerCase()
  return u.startsWith('out') || u === 'ir' || u === 'pup' || u.startsWith('sus')
}

export function SinceKickoff({ league }: { league: SlLeague }) {
  const [dismissed, setDismissed] = useState(false)
  const phase = league.league.phase

  const summary = useMemo(() => {
    const moments = league.moments.length
    const rulings = league.inactives.filter((i) => i.isStarter && isOut(i.status)).length
    const close = league.matchups.filter(
      (m) => m.status === 'live' && m.sweatIndex >= 70,
    ).length
    const parts: string[] = []
    if (moments > 0) parts.push(`${moments} big swing${moments === 1 ? '' : 's'}`)
    if (rulings > 0) parts.push(`${rulings} ruled out`)
    if (close > 0)   parts.push(`${close} close game${close === 1 ? '' : 's'} brewing`)
    return parts
  }, [league])

  if (phase !== 'live' || dismissed || summary.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-sl-ember/30 bg-sl-ember/[0.04] px-4 py-2.5">
      <div className="min-w-0">
        <span className="sl-ff-mono mr-2 text-[0.55rem] uppercase tracking-[0.26em] text-sl-ember">
          Since kickoff
        </span>
        <span className="text-xs italic text-sl-cream">
          {summary.join(' · ')}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="sl-ff-mono shrink-0 text-[0.55rem] uppercase tracking-[0.22em] text-sl-mute hover:text-sl-cream"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
