'use client'

// Shared featured-game furniture. The Stage card itself retired when the
// command center became the desk; what lives on is the kit every featured
// surface (the desk's main monitor, the game room) sets the table with:
// the series lines, the series block, and the score-over-projection grid.

import type { SlMatchup } from '@/lib/sundayLive/types'
import type { SlWeekMatchupContext } from '@/lib/sundayLive/seasonContext'
import { fmtPts } from '../../_lib/format'

// The series, two lines: who leads it, then the last meeting with its winner.
export function seriesLines(
  m: SlMatchup,
  wc: SlWeekMatchupContext | null,
): { series: string; last: string | null } | null {
  const h2h = wc?.h2h ?? null
  if (!h2h || h2h.aWins + h2h.bWins + h2h.ties === 0) return null
  const ties = h2h.ties ? `-${h2h.ties}` : ''
  const series =
    h2h.aWins === h2h.bWins
      ? `Series even at ${h2h.aWins}-${h2h.bWins}${ties}`
      : `${h2h.aWins > h2h.bWins ? m.a.ownerName : m.b.ownerName} leads the series ${Math.max(h2h.aWins, h2h.bWins)}-${Math.min(h2h.aWins, h2h.bWins)}${ties}`
  const lm = h2h.last
  const last = lm
    ? lm.winner === 'T'
      ? `Last met W${lm.week} ${lm.year}: it ended in a tie`
      : `Last met W${lm.week} ${lm.year}: ${lm.winner === 'A' ? m.a.ownerName : m.b.ownerName} won by ${fmtPts(lm.margin)}`
    : null
  return { series, last }
}

// Shared render for the series block under the win-probability meter. The
// lead line wears the banner color: brass at night, almanac blue in the day
// world (gold text on cream is banned).
export function SeriesBlock({ series }: { series: { series: string; last: string | null } }) {
  return (
    <div className="mt-2.5 text-center">
      <div
        className="sl-display text-[12.5px] tracking-wide"
        style={{ color: 'var(--sl-banner, var(--sl-gold))' }}
      >
        {series.series}
      </div>
      {series.last && (
        <div className="sl-display mt-0.5 text-[11.5px] tracking-wide text-sl-mute">{series.last}</div>
      )}
    </div>
  )
}

// The scores with the projections beneath: one shared grid so each proj
// number sits centered under its own score. Just the numbers; the dim
// small type under a big score reads as the projection on its own.
export function ScoreBoard({
  a,
  b,
  vs,
  projA,
  projB,
}: {
  a: React.ReactNode
  b: React.ReactNode
  vs: React.ReactNode
  projA: number
  projB: number
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-end justify-items-center gap-x-4 gap-y-1.5">
      {a}
      {vs}
      {b}
      <span className="sl-num text-[11px] leading-none text-sl-dim">{fmtPts(projA)}</span>
      <span aria-hidden />
      <span className="sl-num text-[11px] leading-none text-sl-dim">{fmtPts(projB)}</span>
    </div>
  )
}
