'use client'

// League-wide QB → pass-catcher stacks. Reuses the same StackUnit[] the booth
// uses, surfaced on the hub as a single card showing the top 4 combined units.

import type { StackUnit } from '@/lib/sundayLive/types'
import { fmtScore } from '../_lib/format'

export function LeagueStacks({ stacks }: { stacks: StackUnit[] }) {
  if (stacks.length === 0) return null
  return (
    <div className="sl-card overflow-hidden rounded-md">
      <div className="border-b border-sl-edge-soft px-3.5 py-2.5">
        <div className="sl-ff-mono text-[0.58rem] uppercase tracking-[0.26em] text-sl-ember">
          League stacks
        </div>
        <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.22em] text-sl-dim">
          biggest QB → pass-catcher combos across the league
        </div>
      </div>
      <ul className="flex flex-col">
        {stacks.slice(0, 4).map((s, i) => (
          <li key={`${s.ownerName}-${s.team}-${i}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-sl-edge-soft px-3.5 py-2.5 first:border-t-0">
            <div className="sl-ff-mono shrink-0 rounded-sm border border-sl-edge bg-sl-stadium-hi px-1.5 py-0.5 text-[0.55rem] uppercase tracking-[0.16em] text-sl-cream">
              {s.team}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs text-sl-cream">
                {s.players.map((p) => p.name).join(' → ')}
              </div>
              <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim">
                {s.ownerName}
              </div>
            </div>
            <div className="sl-tnum text-sm font-semibold text-sl-ember">
              {fmtScore(s.combined)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
