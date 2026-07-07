'use client'

// Win probability: a two-tone tug-of-war (side A in burgundy and amber, side
// B in ink navy, cream needle at the meeting point) plus the session
// sparkline built from the poll-by-poll history (server-seeded, so afternoon
// page loads still show the arc of the day).

import type { SlMatchup } from '@/lib/sundayLive/types'
import { useSl } from '../SlProvider'
import { seriesFor } from '../../_lib/wpSeries'
import { fmtPct } from '../../_lib/format'

function Sparkline({ matchupId, w = 300 }: { matchupId: number; w?: number }) {
  const { wpSeries } = useSl()
  const pts = seriesFor(wpSeries, matchupId)
  if (pts.length < 3) return null

  const h = 36
  const step = w / (pts.length - 1)
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${((1 - p.wpA) * h).toFixed(1)}`)
    .join(' ')

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block" aria-hidden>
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="var(--sl-line)" strokeDasharray="3 4" />
      <path d={path} fill="none" stroke="var(--sl-glow)" strokeWidth={1.5} />
    </svg>
  )
}

export function WpMeter({ matchup, sparkline = false }: { matchup: SlMatchup; sparkline?: boolean }) {
  const wpA = matchup.a.wp
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="sl-num text-[13px] text-sl-glow">{fmtPct(wpA)}</span>
        <span className="sl-kicker">WIN PROBABILITY</span>
        <span
          className="sl-num text-[13px]"
          style={{ color: 'color-mix(in srgb, var(--sl-navy) 55%, var(--sl-cream))' }}
        >
          {fmtPct(1 - wpA)}
        </span>
      </div>
      {/* Side A runs glow at its edge into electric at the needle (ink black
          in the day world, so the junction never reads as one blue bar);
          side B stops short of the panel color (.sl-meter-b). */}
      <div className="flex h-2 overflow-hidden rounded-full">
        <div
          className="sl-wp-fill bg-gradient-to-r from-sl-glow to-sl-electric"
          style={{ width: `${Math.round(wpA * 100)}%` }}
        />
        {/* Literal paper cream: the cream var flips to navy in the day world
            and the needle must stay visible between the two fills */}
        <div className="w-px shrink-0" style={{ background: 'rgba(249, 243, 226, 0.9)' }} aria-hidden />
        <div className="sl-meter-b flex-1" />
      </div>
      {sparkline && (
        <div className="mt-2.5 flex justify-center">
          <Sparkline matchupId={matchup.matchupId} />
        </div>
      )}
    </div>
  )
}
