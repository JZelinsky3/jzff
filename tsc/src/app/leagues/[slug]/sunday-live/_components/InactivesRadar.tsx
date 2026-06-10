'use client'

// Pre-kickoff warning banner. Only renders when phase === 'pre-kickoff' AND
// somebody in the league has a starter who is OUT / IR / Suspended. Dismissable
// per-session.

import { useState } from 'react'
import type { InactiveAlert } from '@/lib/sundayLive/types'

function isOut(s: string | null): boolean {
  if (!s) return false
  const u = s.toLowerCase()
  return u.startsWith('out') || u === 'ir' || u === 'pup' || u.startsWith('sus')
}

export function InactivesRadar({
  phase,
  inactives,
}: {
  phase: 'pre-kickoff' | 'live' | 'finished' | 'idle'
  inactives: InactiveAlert[]
}) {
  const [dismissed, setDismissed] = useState(false)
  if (phase !== 'pre-kickoff' || dismissed) return null
  const seriousStarters = inactives.filter((i) => i.isStarter && isOut(i.status))
  if (seriousStarters.length === 0) return null
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-sl-signal/40 bg-sl-signal/[0.06] px-4 py-3">
      <div className="min-w-0">
        <div className="sl-ff-mono mb-1 text-[0.58rem] uppercase tracking-[0.26em] text-sl-signal">
          🚨 Inactives Radar
        </div>
        <div className="text-xs text-sl-cream">
          <span className="sl-tnum font-semibold text-sl-signal">{seriousStarters.length}</span>{' '}
          starter{seriousStarters.length === 1 ? ' is' : 's are'} ruled out across the league:{' '}
          <span className="text-sl-mute">
            {seriousStarters.slice(0, 6).map((p) => `${p.name} (${p.ownerName})`).join(' · ')}
            {seriousStarters.length > 6 && ` · +${seriousStarters.length - 6} more`}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="sl-ff-mono shrink-0 rounded-sm border border-sl-edge px-2.5 py-1.5 text-[0.58rem] uppercase tracking-[0.22em] text-sl-mute hover:text-sl-cream"
        aria-label="Dismiss"
      >
        Dismiss
      </button>
    </div>
  )
}
