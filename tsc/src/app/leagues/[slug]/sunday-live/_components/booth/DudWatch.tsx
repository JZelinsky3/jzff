'use client'

// One pinned card — the worst-performing starter in this matchup. Disappears
// if no one is sufficiently underperforming. Petty. Fun.

import type { SlMatchup } from '@/lib/sundayLive/types'
import { computeDudWatch } from '../../_lib/booth'
import { fmtScore } from '../../_lib/format'

export function DudWatch({ matchup }: { matchup: SlMatchup }) {
  const d = computeDudWatch(matchup)
  if (!d) return null
  return (
    <div className="sl-card sl-rim-live overflow-hidden rounded-md">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <div className="sl-ff-mono text-[0.58rem] uppercase tracking-[0.26em] text-sl-signal">
            🪦 Dud Watch
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-sl-cream">
            {d.player.name}
          </div>
          <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim">
            started by {d.ownerName} · {d.player.position} · {d.player.team ?? '—'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="sl-tnum text-2xl font-semibold text-sl-cream">
            {fmtScore(d.player.points)}
          </div>
          <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.18em] text-sl-signal sl-tnum">
            {d.deltaFromProj.toFixed(1)} vs proj
          </div>
        </div>
      </div>
    </div>
  )
}
