'use client'

// Position-by-position head-to-head. Each slot pairs Side A's starter against
// Side B's starter so you instantly see where the matchup is being won/lost.

import type { SlMatchup } from '@/lib/sundayLive/types'
import { pairLineupSlots } from '../../_lib/booth'
import { fmtScore } from '../../_lib/format'

export function PositionH2H({ matchup }: { matchup: SlMatchup }) {
  const rows = pairLineupSlots(matchup)
  return (
    <div className="sl-card overflow-hidden rounded-md">
      <div className="flex items-center justify-between border-b border-sl-edge-soft px-4 py-2.5">
        <div className="sl-ff-mono text-[0.58rem] uppercase tracking-[0.26em] text-sl-ember">
          Position H2H
        </div>
        <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.22em] text-sl-dim">
          slot-by-slot margin
        </div>
      </div>
      <div className="flex flex-col">
        {rows.map((r, i) => {
          const aWinning = r.marginA > 0
          const bWinning = r.marginA < 0
          return (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 border-t border-sl-edge-soft px-4 py-2 first:border-t-0 sm:gap-4">
              <div className={`min-w-0 truncate text-right text-xs ${aWinning ? 'text-sl-cream' : 'text-sl-mute'}`}>
                {r.a?.name ?? '—'}
              </div>
              <div className={`sl-tnum w-12 text-right text-xs ${aWinning ? 'text-sl-ember' : 'text-sl-mute'}`}>
                {fmtScore(r.a?.points ?? 0)}
              </div>
              <div className="sl-ff-mono w-12 text-center text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim">
                {r.slot}
              </div>
              <div className={`sl-tnum w-12 text-left text-xs ${bWinning ? 'text-sl-ember' : 'text-sl-mute'}`}>
                {fmtScore(r.b?.points ?? 0)}
              </div>
              <div className={`min-w-0 truncate text-left text-xs ${bWinning ? 'text-sl-cream' : 'text-sl-mute'}`}>
                {r.b?.name ?? '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
