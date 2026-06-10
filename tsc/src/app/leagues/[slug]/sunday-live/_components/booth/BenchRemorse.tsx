'use client'

// "You'd be ahead if you'd started X instead of Y." Per-side calculation; only
// renders when there's actually something to report (cleaner than showing an
// empty card every minute of pre-game).

import type { SlMatchup } from '@/lib/sundayLive/types'
import { computeBenchRemorse } from '../../_lib/booth'
import { fmtScore } from '../../_lib/format'

export function BenchRemorse({ matchup }: { matchup: SlMatchup }) {
  const rowsA = computeBenchRemorse(matchup.a)
  const rowsB = computeBenchRemorse(matchup.b)
  if (rowsA.length === 0 && rowsB.length === 0) return null
  return (
    <div className="sl-card overflow-hidden rounded-md">
      <div className="border-b border-sl-edge-soft px-4 py-2.5">
        <div className="sl-ff-mono text-[0.58rem] uppercase tracking-[0.26em] text-sl-ember">
          Bench Remorse
        </div>
        <div className="sl-ff-mono text-[0.55rem] uppercase tracking-[0.22em] text-sl-dim">
          the swap that would&apos;ve mattered
        </div>
      </div>
      <div className="grid grid-cols-1 gap-px bg-sl-edge-soft sm:grid-cols-2">
        <Column side="A" team={matchup.a.teamName} rows={rowsA.slice(0, 3)} />
        <Column side="B" team={matchup.b.teamName} rows={rowsB.slice(0, 3)} />
      </div>
    </div>
  )
}

function Column({
  side,
  team,
  rows,
}: {
  side: 'A' | 'B'
  team: string
  rows: ReturnType<typeof computeBenchRemorse>
}) {
  return (
    <div className="bg-sl-stadium px-4 py-3">
      <div className="sl-ff-mono mb-2 text-[0.55rem] uppercase tracking-[0.22em] text-sl-dim">
        {side} · {team}
      </div>
      {rows.length === 0 ? (
        <div className="text-xs italic text-sl-mute">No swaps would&apos;ve helped — good lineup.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs text-sl-cream">
                  Started <span className="text-sl-mute">{r.startedName}</span> ({fmtScore(r.startedPoints)})
                </div>
                <div className="truncate text-[0.7rem] italic text-sl-mute">
                  Should&apos;ve started <span className="text-sl-cream not-italic">{r.shouldveName}</span> ({fmtScore(r.shouldvePoints)})
                </div>
              </div>
              <div className="sl-tnum shrink-0 text-sm font-semibold text-sl-green">
                +{r.swing.toFixed(1)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
