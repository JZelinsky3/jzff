// Sweat Index — composite 0..100 score that ranks "how stressful is this
// matchup right now." Drives the hero rotation order and the side scoreboard
// sort. Closer + more uncertainty + later in the day = higher.

export type SweatInputs = {
  closeness: number          // |scoreA - scoreB|
  wp: number                 // 0..1 (for side A)
  progress: number           // 0..1 (Sunday progress)
  playersRemainingA: number
  playersRemainingB: number
  status: 'pre' | 'live' | 'final'
}

export function sweatIndex({
  closeness,
  wp,
  progress,
  playersRemainingA,
  playersRemainingB,
  status,
}: SweatInputs): number {
  if (status === 'final') return 0
  if (status === 'pre') return 35 // pre-game baseline — interesting but undecided
  // Closeness: 0 pts gap → 100, 60+ pts gap → 0
  const cls = clampPct(100 - (closeness / 60) * 100)
  // WP uncertainty: peaks at 0.5, falls to 0 at 0 or 1
  const wpu = 100 - Math.abs(wp - 0.5) * 200
  // Progress weighting: starts lower, peaks in the late window
  const prg = 60 + progress * 40
  // Players remaining differential: gap matters more if one side has 0 left
  const playerDiff = Math.abs(playersRemainingA - playersRemainingB)
  const playerPenalty = playerDiff > 4 ? -10 : 0
  const raw = 0.45 * cls + 0.35 * wpu + 0.20 * prg + playerPenalty
  return Math.round(clampPct(raw))
}

function clampPct(x: number): number {
  if (!Number.isFinite(x)) return 0
  if (x < 0) return 0
  if (x > 100) return 100
  return x
}
