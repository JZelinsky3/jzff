// Sleeper scoring engine.
//
// Sleeper's scoring_settings is a flat { key: multiplier } map where each
// key matches a stat key from the per-week stats endpoint (e.g.
// scoring.pass_yd = 0.04, stats.pass_yd = 312 -> 12.48 points from passing
// yards). Linear stats are a simple multiply-and-sum.
//
// Per-game bonus keys ("bonus_pass_yd_300", "bonus_rec_yd_100", etc.) fire
// once per game if the threshold is met. Because they're per-game, we need
// per-week stats, not cumulative season totals — that's why callers feed
// applyScoring one game at a time and sum the results.
//
// Defensive note: Sleeper occasionally ships scoring keys that don't map to
// any stat ("rec_2pt_loss" was a real one in 2023). Unknown keys are
// silently zero — we trust scoring_settings as defined by the platform.

type RawStats = Record<string, number>
type ScoringSettings = Record<string, number>

// Fallback PPR profile used when the platform doesn't surface a Sleeper-
// style scoring_settings map. ESPN/Yahoo/NFL each define scoring in their
// own format and translating every key is a follow-up; for ranks this
// covers the 80% case (most leagues are some flavor of PPR with standard
// per-yard rates and TD bonuses).
export const DEFAULT_PPR_SCORING: ScoringSettings = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  pass_2pt: 2,
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  fum_lost: -2,
  fum_rec_td: 6,
}

// Bonus thresholds Sleeper supports as of 2026. Each entry pairs a scoring
// key with the stat key it gates on + the threshold to hit. Hardcoded
// rather than parsed because Sleeper's key schema is fixed and the
// thresholds are unambiguous from the key suffix.
const BONUS_RULES: Array<{ scoringKey: string; statKey: string; threshold: number }> = [
  { scoringKey: 'bonus_pass_yd_300', statKey: 'pass_yd', threshold: 300 },
  { scoringKey: 'bonus_pass_yd_400', statKey: 'pass_yd', threshold: 400 },
  { scoringKey: 'bonus_rush_yd_100', statKey: 'rush_yd', threshold: 100 },
  { scoringKey: 'bonus_rush_yd_200', statKey: 'rush_yd', threshold: 200 },
  { scoringKey: 'bonus_rec_yd_100',  statKey: 'rec_yd',  threshold: 100 },
  { scoringKey: 'bonus_rec_yd_200',  statKey: 'rec_yd',  threshold: 200 },
  // Position-conditional reception bonuses (TE premium, RB premium). These
  // don't gate on a threshold; they pay a per-reception bonus that we
  // resolve in scoreGame() against the player's position.
]

// Position-premium bonuses (per reception).
const POS_REC_BONUS: Array<{ scoringKey: string; position: string }> = [
  { scoringKey: 'bonus_rec_te', position: 'TE' },
  { scoringKey: 'bonus_rec_rb', position: 'RB' },
  { scoringKey: 'bonus_rec_wr', position: 'WR' },
]

// Apply a league's scoring_settings to a single game's raw stats. Linear
// keys multiply through, threshold bonuses fire if the per-game stat met
// the cutoff, position-premium reception bonuses pay per reception.
//
// position is optional — we just skip the position bonuses if it's null.
// Score is rounded to two decimals at the very end to match how the
// platform itself reports points.
export function scoreGame(
  scoring: ScoringSettings,
  stats: RawStats,
  position: string | null = null,
): number {
  let pts = 0

  for (const [key, value] of Object.entries(scoring)) {
    if (value === 0) continue
    // Bonus and position keys handled separately below — skip them here so
    // they don't multiply twice.
    if (key.startsWith('bonus_')) continue

    const stat = stats[key]
    if (typeof stat === 'number') pts += stat * value
  }

  // Threshold bonuses
  for (const rule of BONUS_RULES) {
    const mult = scoring[rule.scoringKey]
    if (!mult) continue
    const stat = stats[rule.statKey] ?? 0
    if (stat >= rule.threshold) pts += mult
  }

  // Position-conditional reception premiums
  if (position) {
    const rec = stats.rec ?? 0
    for (const rule of POS_REC_BONUS) {
      if (rule.position !== position) continue
      const mult = scoring[rule.scoringKey]
      if (!mult) continue
      pts += rec * mult
    }
  }

  return Math.round(pts * 100) / 100
}

// Sum game scores across an array of weekly stat lines. Missing weeks (no
// entry for the player that week) contribute zero.
export function scoreSeason(
  scoring: ScoringSettings,
  weeklyStats: Array<RawStats | undefined>,
  position: string | null = null,
): number {
  let total = 0
  for (const week of weeklyStats) {
    if (!week) continue
    total += scoreGame(scoring, week, position)
  }
  return Math.round(total * 100) / 100
}
