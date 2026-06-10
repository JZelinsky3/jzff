'use client'

// Big Moments scoped to this matchup. Italic-serif caption is the broadcast
// touch — it names the moment. Renders empty if there aren't any yet
// (which is fine; the card just doesn't appear).

import type { Moment, SlMatchup } from '@/lib/sundayLive/types'
import { fmtPct } from '../../_lib/format'

const TIER_LABEL: Record<Moment['tier'], { label: string; cls: string }> = {
  wave:       { label: '🌊 WAVE',       cls: 'text-sl-cool' },
  surge:      { label: '⚡ SURGE',      cls: 'text-sl-ember' },
  earthquake: { label: '🚨 EARTHQUAKE', cls: 'text-sl-signal' },
}

export function MatchupMoments({
  matchup,
  moments,
}: {
  matchup: SlMatchup
  moments: Moment[]
}) {
  const filtered = moments.filter((m) => m.matchupId === matchup.matchupId).slice(0, 4)
  if (filtered.length === 0) return null
  return (
    <div className="sl-card overflow-hidden rounded-md">
      <div className="border-b border-sl-edge-soft px-4 py-2.5">
        <div className="sl-ff-mono text-[0.58rem] uppercase tracking-[0.26em] text-sl-ember">
          Big Moments
        </div>
        <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.22em] text-sl-dim">
          the swings that mattered
        </div>
      </div>
      <ul className="flex flex-col">
        {filtered.map((m) => {
          const t = TIER_LABEL[m.tier]
          const winner = m.side === 'a' ? matchup.a : matchup.b
          return (
            <li key={m.id} className="sl-moment-in border-t border-sl-edge-soft px-4 py-3 first:border-t-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className={`sl-ff-mono text-[0.6rem] uppercase tracking-[0.22em] ${t.cls}`}>
                  {t.label}
                </span>
                <span className="sl-ff-mono text-[0.55rem] tracking-[0.14em] text-sl-dim">
                  {new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <div className="text-sm text-sl-cream">
                <span className="sl-tnum text-sl-mute">{fmtPct(m.wpBefore)}</span>
                <span className="mx-2 text-sl-dim">→</span>
                <span className="sl-tnum text-sl-ember">{fmtPct(m.wpAfter)}</span>
                <span className="ml-2 text-sl-mute">· {winner.teamName}</span>
              </div>
              <div className="mt-0.5 text-[0.7rem] italic text-sl-mute">{m.cause}</div>
              {m.caption && (
                <div className="sl-ff-serif mt-1 text-xs italic text-sl-ember">
                  &ldquo;{m.caption}&rdquo;
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
