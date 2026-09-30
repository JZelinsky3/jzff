// Per-season league rules: scoring format and playoff shape.
//
// Two layers, same idiom as seasons.settings everywhere else:
//
//   • What the platform told us. Ingests write playoff_week_start,
//     playoff_team_count, playoff_round_weeks, championship_weeks,
//     playoff_rounds and scoring into seasons.settings on every sync.
//   • What the commissioner says. leagues.settings.season_rules[year] holds
//     the same keys, typed in on the Sources page. A sync never writes there,
//     so an override survives every re-sync, and it wins over the platform.
//
// Eras ("Non-PPR years", "13-game seasons") live beside them at
// leagues.settings.eras and are just named sets of years the almanac can
// filter by.

import { DEFAULT_PPR_SCORING } from '@/lib/scoring'

export type ScoringRules = {
  /** Points per reception: 0 (standard), 0.5 (half), 1 (full). */
  ppr?: number | null
  /** Points per passing touchdown, usually 4 or 6. */
  pass_td?: number | null
  /** Extra points per tight end reception on top of `ppr` (TE premium). */
  te_premium?: number | null
}

// Who makes the playoffs in a league with divisions (conferences):
//   record            the best records overall, divisions ignored
//   division_winners  every division winner is in and seeded first, the
//                     rest of the field by record (Sleeper's rule)
//   per_division      the top N of each division, N = playoff teams split
//                     evenly (pams: top 3 of each conference); the winners
//                     are seeded first
// Unset means the platform's rule: division_winners when the league has
// divisions, record when it doesn't.
export type PlayoffFormat = 'record' | 'division_winners' | 'per_division'
export const PLAYOFF_FORMATS: PlayoffFormat[] = ['record', 'division_winners', 'per_division']

export function resolvePlayoffFormat(format: PlayoffFormat | null | undefined, hasDivisions: boolean): PlayoffFormat {
  if (!hasDivisions) return 'record'
  return format ?? 'division_winners'
}

export type SeasonRules = {
  playoff_week_start?: number | null
  playoff_team_count?: number | null
  playoff_format?: PlayoffFormat | null
  /** Weeks every playoff round lasts (1, or 2 for two-week rounds). */
  playoff_round_weeks?: number | null
  /** Weeks the championship alone lasts, when only the final is two weeks. */
  championship_weeks?: number | null
  scoring?: ScoringRules | null
}

export type Era = { id: string; name: string; years: number[] }

export const ROUND_WEEK_CHOICES = [1, 2] as const

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function readFormat(v: unknown): PlayoffFormat | null {
  return typeof v === 'string' && (PLAYOFF_FORMATS as string[]).includes(v) ? (v as PlayoffFormat) : null
}

function readScoring(v: unknown): ScoringRules | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const out: ScoringRules = {
    ppr: num(o.ppr),
    pass_td: num(o.pass_td),
    te_premium: num(o.te_premium),
  }
  return out.ppr == null && out.pass_td == null && out.te_premium == null ? null : out
}

// Read one bag of rule keys from either layer. Unknown or malformed values
// come back null rather than throwing: settings JSON is hand-editable.
export function readRules(v: unknown): SeasonRules {
  if (!v || typeof v !== 'object') return {}
  const o = v as Record<string, unknown>
  return {
    playoff_week_start: num(o.playoff_week_start),
    playoff_team_count: num(o.playoff_team_count),
    playoff_format: readFormat(o.playoff_format),
    playoff_round_weeks: num(o.playoff_round_weeks),
    championship_weeks: num(o.championship_weeks),
    scoring: readScoring(o.scoring),
  }
}

export function commishRulesFor(leagueSettings: unknown, year: number): SeasonRules {
  const all = (leagueSettings as { season_rules?: Record<string, unknown> } | null)?.season_rules
  return readRules(all?.[String(year)])
}

export function readEras(leagueSettings: unknown): Era[] {
  const raw = (leagueSettings as { eras?: unknown } | null)?.eras
  if (!Array.isArray(raw)) return []
  const out: Era[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const years = Array.isArray(o.years)
      ? [...new Set(o.years.filter((y): y is number => typeof y === 'number' && Number.isInteger(y)))].sort((a, b) => a - b)
      : []
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const id = typeof o.id === 'string' && o.id ? o.id : null
    if (!id || !name || years.length === 0) continue
    out.push({ id, name, years })
  }
  return out
}

// Commissioner value wins, then the platform's, field by field.
export function effectiveRules(platform: unknown, commish: SeasonRules): SeasonRules {
  const p = readRules(platform)
  const pick = <K extends keyof SeasonRules>(k: K) => (commish[k] ?? p[k] ?? null) as SeasonRules[K]
  const scoring = commish.scoring || p.scoring
    ? {
        ppr: commish.scoring?.ppr ?? p.scoring?.ppr ?? null,
        pass_td: commish.scoring?.pass_td ?? p.scoring?.pass_td ?? null,
        te_premium: commish.scoring?.te_premium ?? p.scoring?.te_premium ?? null,
      }
    : null
  return {
    playoff_week_start: pick('playoff_week_start'),
    playoff_team_count: pick('playoff_team_count'),
    playoff_format: pick('playoff_format'),
    playoff_round_weeks: pick('playoff_round_weeks'),
    championship_weeks: pick('championship_weeks'),
    scoring,
  }
}

// Rounds a bracket of `teams` needs: 2 → 1, 3-4 → 2, 5-8 → 3, 9-16 → 4.
export function bracketRounds(teams: number | null | undefined): number {
  const t = teams ?? 6
  if (t <= 2) return 1
  if (t <= 4) return 2
  if (t <= 8) return 3
  return 4
}

// The NFL weeks each playoff round is played in, first round first.
// e.g. start 15, six teams, two-week final → [[15], [16], [17, 18]].
// Capped at week 18: there is no fantasy football after the NFL stops.
export function playoffRoundWeeks(args: {
  start: number
  rounds: number
  roundWeeks?: number | null
  championshipWeeks?: number | null
}): number[][] {
  const per = args.roundWeeks === 2 ? 2 : 1
  const finalLen = Math.max(per, args.championshipWeeks === 2 ? 2 : 1)
  const out: number[][] = []
  let w = args.start
  for (let r = 1; r <= args.rounds; r++) {
    const len = r === args.rounds ? finalLen : per
    const weeks: number[] = []
    for (let i = 0; i < len && w <= 18; i++) weeks.push(w++)
    if (weeks.length) out.push(weeks)
  }
  return out
}

// The playoff shape the almanac should use for a season. The platform's own
// explicit round list (ESPN's matchup periods) is the best source, but a
// commissioner who types in a start week or round length is describing a
// different shape, so any of those keys switches to the computed one.
export function effectivePlayoffRounds(platformSettings: unknown, commish: SeasonRules): number[][] | null {
  const eff = effectiveRules(platformSettings, commish)
  const commishTouchedShape =
    commish.playoff_week_start != null || commish.playoff_team_count != null ||
    commish.playoff_round_weeks != null || commish.championship_weeks != null
  const stored = (platformSettings as { playoff_rounds?: unknown } | null)?.playoff_rounds
  if (!commishTouchedShape && Array.isArray(stored) && stored.every((r) => Array.isArray(r))) {
    const rounds = (stored as unknown[][]).map((r) => r.filter((w): w is number => typeof w === 'number'))
    if (rounds.length && rounds.every((r) => r.length > 0)) return rounds
  }
  if (eff.playoff_week_start == null) return null
  return playoffRoundWeeks({
    start: eff.playoff_week_start,
    rounds: bracketRounds(eff.playoff_team_count),
    roundWeeks: eff.playoff_round_weeks,
    championshipWeeks: eff.championship_weeks,
  })
}

// "Full PPR · 6-pt pass TD · TE +0.5". Null when nothing is known.
export function scoringLabel(s: ScoringRules | null | undefined): string | null {
  if (!s) return null
  const parts: string[] = []
  if (s.ppr != null) parts.push(s.ppr >= 1 ? (s.ppr > 1 ? `${s.ppr} PPR` : 'Full PPR') : s.ppr > 0 ? 'Half PPR' : 'Standard')
  if (s.pass_td != null) parts.push(`${s.pass_td}-pt pass TD`)
  if (s.te_premium) parts.push(`TE +${s.te_premium}`)
  return parts.length ? parts.join(' · ') : null
}

// Short key used to suggest eras: seasons that share it scored the same way.
export function scoringKey(s: ScoringRules | null | undefined): string | null {
  if (!s || (s.ppr == null && s.pass_td == null)) return null
  return `${s.ppr ?? '?'}|${s.pass_td ?? '?'}|${s.te_premium ?? 0}`
}

// A Sleeper-style scoring_settings map for the position-rank engine, so trade
// rank chips on ESPN/Yahoo/NFL leagues use the league's own format instead of
// assuming full PPR.
export function scoringSettingsFor(s: ScoringRules | null | undefined): Record<string, number> {
  const out: Record<string, number> = { ...DEFAULT_PPR_SCORING }
  if (!s) return out
  if (s.ppr != null) out.rec = s.ppr
  if (s.pass_td != null) out.pass_td = s.pass_td
  if (s.te_premium) out.bonus_rec_te = s.te_premium
  return out
}

// Read a Sleeper league's scoring_settings into our three knobs.
export function scoringFromSleeper(ss: Record<string, number> | null | undefined): ScoringRules | null {
  if (!ss) return null
  return {
    ppr: typeof ss.rec === 'number' ? ss.rec : 0,
    pass_td: typeof ss.pass_td === 'number' ? ss.pass_td : null,
    te_premium: typeof ss.bonus_rec_te === 'number' && ss.bonus_rec_te > 0 ? ss.bonus_rec_te : null,
  }
}
