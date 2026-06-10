'use client'

// Win-probability sparkline. Phase 1 renders a placeholder line (current WP as
// flat). Phase 3 wires the readFrameHistory output through so it's a real
// stock-chart of the day. Pure SVG — no client library.

export function WPSparkline({
  points,
  width = 120,
  height = 32,
}: {
  points: number[]            // 0..1 series, side A's WP across the day
  width?: number
  height?: number
}) {
  const series = points.length > 0 ? points : [0.5]
  // Map each point to (x, y) in pixel space — y flipped so 1 (winning) is at top.
  const stepX = series.length > 1 ? width / (series.length - 1) : width
  const ys = series.map((v, i) => {
    const clamped = Math.max(0, Math.min(1, v))
    return { x: i * stepX, y: height - clamped * height }
  })
  const d = ys.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const lastY = ys[ys.length - 1].y
  const last = series[series.length - 1] ?? 0.5
  const leading = last >= 0.5
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block">
      {/* center 50% line */}
      <line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="2 2" />
      <path d={d} fill="none" stroke={leading ? 'var(--sl-ember)' : 'var(--sl-cool)'} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={lastY} r="2.5" fill={leading ? 'var(--sl-ember-glow)' : 'var(--sl-cool)'} />
    </svg>
  )
}
