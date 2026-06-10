'use client'

// Power Pulse — top 5 by current power ranking, each with their live result.
// Silent skip when empty (paid-feature gate failed, week mismatch, or pre-week-3
// when power rankings haven't differentiated yet).

import type { PowerPulseRow } from '@/lib/sundayLive/types'

const RESULT_LABEL: Record<'leading' | 'trailing' | 'tied', { label: string; cls: string }> = {
  leading:  { label: 'LEADING',  cls: 'text-sl-green' },
  trailing: { label: 'TRAILING', cls: 'text-sl-signal' },
  tied:     { label: 'TIED',     cls: 'text-sl-mute' },
}

export function PowerPulse({ rows }: { rows: PowerPulseRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="sl-card overflow-hidden rounded-md">
      <div className="border-b border-sl-edge-soft px-3.5 py-2.5">
        <div className="sl-ff-mono text-[0.58rem] uppercase tracking-[0.26em] text-sl-ember">
          Power Pulse
        </div>
        <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.22em] text-sl-dim">
          top 5 · current week result
        </div>
      </div>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const result = r.liveResult ? RESULT_LABEL[r.liveResult] : null
          return (
            <li
              key={`${r.rank}-${r.teamName}`}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-sl-edge-soft px-3.5 py-2 first:border-t-0"
            >
              <div className="sl-ff-mono w-6 shrink-0 text-right text-[0.58rem] font-semibold text-sl-ember sl-tnum">
                #{r.rank}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs text-sl-cream">{r.teamName}</div>
                <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.18em] text-sl-dim">
                  {r.ownerName} · <span className="sl-tnum">{r.wins}-{r.losses}</span>
                </div>
              </div>
              {result && (
                <span className={`sl-ff-mono shrink-0 text-[0.55rem] uppercase tracking-[0.18em] ${result.cls}`}>
                  {result.label}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
