// Session-scoped win-probability history. Each poll appends one point per
// matchup; WpMeter draws the sparkline from this. Server seeds the series
// from persisted frames so a mid-afternoon page load still shows the arc.

export type WpPoint = { t: string; matchupId: number; wpA: number }

const MAX_POINTS = 240 // ~2h of 30s polls per matchup is plenty for a sparkline

export function appendWp(series: WpPoint[], points: WpPoint[]): WpPoint[] {
  if (points.length === 0) return series
  const lastT = series.length ? series[series.length - 1].t : ''
  // Same frame re-delivered (poll error retry, demo re-fetch): skip.
  if (points[0]?.t === lastT) return series
  const merged = [...series, ...points]
  // Trim per matchup, keeping chronological order.
  const byMatchup = new Map<number, number>()
  for (const p of merged) byMatchup.set(p.matchupId, (byMatchup.get(p.matchupId) ?? 0) + 1)
  const over = new Set([...byMatchup.entries()].filter(([, n]) => n > MAX_POINTS).map(([id]) => id))
  if (over.size === 0) return merged
  const drop = new Map<number, number>()
  for (const id of over) drop.set(id, (byMatchup.get(id) ?? 0) - MAX_POINTS)
  return merged.filter((p) => {
    const d = drop.get(p.matchupId) ?? 0
    if (d <= 0) return true
    drop.set(p.matchupId, d - 1)
    return false
  })
}

export function seriesFor(series: WpPoint[], matchupId: number): WpPoint[] {
  return series.filter((p) => p.matchupId === matchupId)
}
