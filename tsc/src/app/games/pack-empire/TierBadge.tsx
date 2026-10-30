import { tierFor } from '@/lib/packEmpire/rules'

/** A run's rung on the ladder, as a badge in that rung's colour. Read off the
    score so it always agrees with the ladder printed beside it. */
export function TierBadge({ score }: { score: number }) {
  const tier = tierFor(score)
  return (
    <span className="pe-tier-badge" style={{ '--tc': tier.color } as React.CSSProperties}>
      {tier.label}
    </span>
  )
}
