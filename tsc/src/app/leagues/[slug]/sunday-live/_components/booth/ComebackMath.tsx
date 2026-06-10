'use client'

// "Comeback math: you need X.X to catch up." Only renders when there's an
// actual gap AND there's enough remaining to make catching up plausible.

import type { SlMatchup } from '@/lib/sundayLive/types'
import { computeComebackMath } from '../../_lib/booth'

export function ComebackMath({ matchup }: { matchup: SlMatchup }) {
  const cm = computeComebackMath(matchup)
  if (!cm) return null
  const trailingSide = cm.trailing === 'a' ? matchup.a : matchup.b
  return (
    <div className="sl-card overflow-hidden rounded-md border-l-2 border-l-sl-violet">
      <div className="px-4 py-3">
        <div className="sl-ff-mono mb-1 text-[0.58rem] uppercase tracking-[0.26em] text-sl-violet">
          Comeback Math
        </div>
        <div className="text-sm text-sl-cream">
          <strong className="font-semibold">{trailingSide.teamName}</strong> needs{' '}
          <span className="sl-tnum text-sl-ember">{cm.gap.toFixed(1)} + opponent&apos;s remaining</span> to catch up.
        </div>
        <div className="mt-1 grid grid-cols-3 gap-3 text-[0.65rem]">
          <Stat label="Gap" value={cm.gap.toFixed(1)} />
          <Stat label="Their ceiling" value={cm.ceiling.toFixed(1)} />
          <Stat label="Opp. ceiling" value={cm.opponentCeiling.toFixed(1)} />
        </div>
        <div className="sl-ff-mono mt-2 text-[0.55rem] uppercase tracking-[0.2em]">
          <span className={cm.possible ? 'text-sl-green' : 'text-sl-dim'}>
            {cm.possible ? `Math says ~${cm.pctChance}% possible` : 'Mathematically out of reach'}
          </span>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="sl-ff-mono text-[0.5rem] uppercase tracking-[0.18em] text-sl-dim">{label}</div>
      <div className="sl-tnum text-sm font-semibold text-sl-cream">{value}</div>
    </div>
  )
}
