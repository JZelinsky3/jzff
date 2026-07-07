'use client'

// The power rank mark: a military-style rank banner (notched shield, star
// above a chevron stripe) with the rank set in the serif beside it. Pure
// currentColor glyph, panel-colored cutouts, so it reads as the same badge
// on any surface and can become the universal power-rankings mark sitewide.

export function PowerIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className="shrink-0" aria-hidden>
      <path d="M1.7 0.8 H10.3 V8.1 L6 11.2 L1.7 8.1 Z" fill="currentColor" />
      <path
        d="M6 2 L6.65 3.35 L8.15 3.55 L7.05 4.6 L7.35 6.1 L6 5.35 L4.65 6.1 L4.95 4.6 L3.85 3.55 L5.35 3.35 Z"
        fill="var(--sl-panel)"
      />
      <path
        d="M2.6 6.9 L6 8.9 L9.4 6.9"
        fill="none"
        stroke="var(--sl-panel)"
        strokeWidth="1.1"
      />
    </svg>
  )
}

export function PowerMark({ rank }: { rank: number }) {
  return (
    <span
      className="inline-flex items-center gap-[4px] text-sl-gold"
      title={`No. ${rank} in the power rankings`}
    >
      <PowerIcon />
      <span className="sl-display text-[14px] leading-none">{rank}</span>
    </span>
  )
}
