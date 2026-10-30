import { TIERS, tierFor } from '@/lib/packEmpire/rules'

/** A run's rung on the ladder as a badge, data-rung numbered I to VIII the way
    the ladder is. Read off the score so it always agrees with that ladder. */
export function TierBadge({ score }: { score: number }) {
  const tier = tierFor(score)
  const rung = TIERS.indexOf(tier) + 1
  return (
    <span
      className="pe-tier-badge"
      data-rung={rung}
      style={{ '--tc': tier.color } as React.CSSProperties}
    >
      {tier.label}
      {rung === 1 && <i className="pe-tier-shine" aria-hidden />}
    </span>
  )
}
