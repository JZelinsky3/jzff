'use client'

// One team's starters. Slots are re-ordered into the classic card order
// (QB, RB, WR, TE, flex, K, defense) regardless of how the platform delivers
// them; the slate carries the manager's avatar and the running total.

import type { SlPlayer, SlSide } from '@/lib/sundayLive/types'
import { Avatar } from './Scorebug'
import { StarterRow } from './StarterRow'
import { fmtPts } from '../../_lib/format'

function slotRank(p: SlPlayer): number {
  const s = (p.slot ?? p.position ?? '').toUpperCase()
  if (s === 'QB') return 0
  if (s === 'RB') return 1
  if (s === 'WR') return 2
  if (s === 'TE') return 3
  if (s.includes('FLEX') || /^W\/?R(\/?T)?$/.test(s) || s === 'RB/WR' || s === 'RB/WR/TE') return 4
  if (s === 'K' || s === 'PK') return 6
  if (s === 'DEF' || s === 'DST' || s === 'D/ST' || s === 'IDP') return 7
  return 5 // anything exotic lands between flex and kicker
}

// Starters in card order; also feeds the lettered player pips so the pip row
// matches the box score line for line.
export function orderedStarters(side: SlSide): SlPlayer[] {
  return side.players
    .filter((p) => p.isStarter)
    .map((p, i) => ({ p, i }))
    .sort((x, y) => slotRank(x.p) - slotRank(y.p) || x.i - y.i)
    .map((x) => x.p)
}

export function StarterTable({
  side,
  playerDelta,
}: {
  side: SlSide
  // playerId -> points just gained (desk passes it; the lab renders without)
  playerDelta?: Map<string, number>
}) {
  const starters = orderedStarters(side)

  return (
    <div className="sl-hoverable sl-panel overflow-hidden">
      <div className="sl-slate items-center! justify-between">
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar side={side} px={34} />
          <span className="sl-display truncate text-[15px] text-sl-text">{side.teamName}</span>
          <span className="hidden truncate text-[11px] text-sl-dim md:inline">{side.ownerName}</span>
        </span>
        <span className="sl-num shrink-0 text-[16px] text-sl-glow">{fmtPts(side.score)}</span>
      </div>
      <div>
        {starters.map((p, i) => (
          // Alternating wash so long box scores scan row by row.
          <div key={p.playerId} className={i % 2 === 1 ? 'bg-sl-panel-2/40' : ''}>
            <StarterRow p={p} recent={playerDelta?.get(p.playerId)} />
          </div>
        ))}
      </div>
    </div>
  )
}
