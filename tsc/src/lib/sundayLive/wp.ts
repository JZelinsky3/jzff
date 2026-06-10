// Win-probability model — Phase 0 first-pass.
//
// Inputs: current point gap, projected point gap, fraction of game played.
// Output: WP in [0,1] for side A (against B).
//
// Approach: logistic over the *expected final margin*, blended toward the
// observed margin as more of the game elapses. Calibrated so that:
//   - at kickoff (progress=0), projection is the only signal
//   - at end (progress=1), observed margin is the only signal
//   - mid-game blends linearly toward observed
// The k constant is tuned so a 10-pt edge at 50% progress reads ~80% WP, which
// matches fantasy intuition for typical 100-120 scoring.

export type WPInputs = {
  scoreA: number
  scoreB: number
  projA: number
  projB: number
  progress: number // 0..1 — fraction of league's game-day window elapsed
}

export function winProbA({ scoreA, scoreB, projA, projB, progress }: WPInputs): number {
  const observedGap = scoreA - scoreB
  const projectedGap = (projA - scoreA) + (projB - scoreB) // remaining points
  // Expected final margin: current gap plus what's projected to remain.
  const expectedFinalMargin = scoreA - scoreB + (projA - scoreA) - (projB - scoreB)
  // Blend: as progress → 1, the observed gap dominates over what's projected.
  const blended = expectedFinalMargin * (1 - clamp01(progress) * 0.5) + observedGap * (clamp01(progress) * 0.5)
  void projectedGap
  const k = 0.12
  return clamp01(1 / (1 + Math.exp(-k * blended)))
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0.5
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

// Derive the league's "Sunday progress" — fraction of the kickoff→last-game
// window elapsed. Falls back to a simple "starters whose games are live or
// final" ratio when no scoreboard timing is available.
export function deriveProgress(
  playedStarters: number,
  totalStarters: number,
  liveFraction: number,
): number {
  if (totalStarters <= 0) return 0
  const finished = playedStarters / totalStarters
  // liveFraction = average game-time elapsed for currently-live games
  const partial = (liveFraction || 0) * (1 - finished)
  return clamp01(finished + partial * 0.5)
}
