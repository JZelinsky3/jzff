// The record: turning a lineup's PPG into a season.
//
// Seventeen opponents, each a PPG drawn from what this wheel actually
// produces (see scripts/build-minigame-benchmark.mjs, which simulates
// thousands of real deals off the real pool and takes evenly spaced
// quantiles of the results). Beat an opponent's number, win that game.
// Beat all seventeen and you are 17-0.
//
// Competent play sits at the median of that field, so an ordinary run comes
// out near .500 and a great one has to earn the wins.

// Pure, and deliberately so: the client imports this to score a lineup as
// it's being built, so nothing here may touch the filesystem. Reading the
// benchmark file is benchmarkFile.ts's job, server-side.

export const GAMES = 17

export type Benchmark = {
  profile: string
  /** 17 PPG thresholds, ascending. thresholds[i] is opponent i+1. */
  thresholds: number[]
  median: number
}

/** Wins out of 17 for a lineup worth `ppg` per week. */
export function recordFor(ppg: number, benchmark: Benchmark | null): number {
  if (!benchmark) return 0
  let wins = 0
  for (const t of benchmark.thresholds) if (ppg > t) wins++
  return wins
}

/** How the season reads on the back page. */
export function recordHeadline(wins: number): string {
  const losses = GAMES - wins
  if (wins === GAMES) return 'Perfect season. Nobody beat you.'
  if (wins >= 15) return 'A bye and a banner.'
  if (wins >= 13) return 'Top seed. Comfortably.'
  if (wins >= 11) return 'That team is making a run.'
  if (wins >= 9) return 'You are in the playoff hunt.'
  if (wins === 8 && losses === 9) return 'One game under. Painful.'
  if (wins >= 6) return 'Lottery team.'
  if (wins >= 3) return 'That is a rebuild.'
  if (wins >= 1) return 'At least you won one.'
  return 'Winless. Genuinely impressive in its own way.'
}
