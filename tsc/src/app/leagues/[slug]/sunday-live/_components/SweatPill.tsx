// Sweat Index pill — colored by tier.

import { sweatTier } from '../_lib/format'

export function SweatPill({ score, label = true }: { score: number; label?: boolean }) {
  if (score <= 0) return null
  const tier = sweatTier(score)
  return (
    <span className="sl-sweat" data-tier={tier} title={`Sweat Index ${score}`}>
      {label && <span className="text-sl-dim">SWEAT</span>}
      <span className="sl-tnum">{score}</span>
    </span>
  )
}
