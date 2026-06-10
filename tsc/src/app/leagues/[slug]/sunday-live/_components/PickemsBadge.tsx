// Pickems badge — renders the right variant.
// Phase 5 wires actual pickems data; until then this only renders if data is
// passed in.

import type { PickemsBadge as PB } from '@/lib/sundayLive/types'

const LABELS: Record<PB['variant'], string> = {
  'split':          'PICKEMS',
  'coin-flip':      '★ COIN FLIP',
  'upset-alert':    '🐉 UPSET ALERT',
  'consensus-cold': '🪦 CONSENSUS COLD',
}

export function PickemsBadge({ data }: { data: PB | null }) {
  if (!data || data.totalVotes === 0) return null
  return (
    <span className="sl-pick" data-variant={data.variant}>
      <span>{LABELS[data.variant]}</span>
      <span className="text-sl-dim sl-tnum">{Math.round(data.pctA)}/{100 - Math.round(data.pctA)}</span>
    </span>
  )
}
