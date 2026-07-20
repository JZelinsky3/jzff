// Trade grader — pulls a trade from the DB, asks Groq to grade each side,
// and writes the result into trade_grades + trades.ai_summary.
//
// Two flows live here:
//   • gradeTrade / gradeUngradedForLeague — initial grading. One Groq call
//     produces a combined summary + per-side letter grades.
//   • revisitTrade / revisitForLeague — the 4-week verdict pass. Calls Groq
//     a second time with the original grade + summary as context, asks
//     "does this still hold up?", and writes revisit_grade / revisit_summary.
//
// Cross-platform: asset player ids are resolved to Sleeper ids up front
// (direct for Sleeper trades, name+position match for ESPN/Yahoo/NFL), so
// the consensus value engine + roster context attach on every platform.
// Value anchoring runs on the SAME consensus engine as the Analyzer /
// Finder / Rumor Mill (valuateLeague), calibrated to the league's
// effective Trade Desk settings.
//
// Out of scope (Phase 3+):
//   • Auto-grading on ingest + Vercel cron for scheduled grading
//   • Real performance data fed into the revisit prompt (player stats over
//     the 4 weeks since trade); without that, the revisit is a fresh-eyes
//     review of the same context

import { createAdminClient } from '@/lib/supabase/admin'
import { groqChatJson, GroqError } from '@/lib/groq'
import { getSleeperValuesForPlayerIds, type PlayerValue } from '@/lib/playerValues'
import { computePositionRanks, stampRanks, buildNameLookup, nameKey } from '@/lib/positionRanks'
import { DEFAULT_PPR_SCORING } from '@/lib/scoring'
import { loadAnalyzerData, type AnalyzerLeagueData, type AnalyzerRoster } from '@/lib/tradeDesk/analyzer'
import { parseSettings, mergeEffective, type EffectiveSettings } from '@/lib/tradeDesk/settings'
import { valuateLeague, type PlayerValue as ConsensusValue, type LeagueMode } from '@/lib/values'

// Same env override the Analyzer + Rumor Mill use, so one var upgrades the
// whole desk's writing model at once.
const MODEL = process.env.GROQ_MODEL_TRADE ?? 'llama-3.3-70b-versatile'

type TradePlatform = 'sleeper' | 'espn' | 'yahoo' | 'nfl'

// Everything the prompt formatter needs to describe a player asset with
// real market context, regardless of which platform the trade came from.
// All maps are keyed by SLEEPER id — resolveSleeperId translates each
// asset first.
type ValueBundle = {
  // Consensus market values from the same engine the Analyzer / Finder /
  // Rumor Mill run on. Empty map when valuation failed (prompt degrades
  // to "(no value data)").
  consensus: Map<string, ConsensusValue>
  // "RB7"-style labels derived from consensus ordering within position.
  rankLabels: Map<string, string>
  // Sleeper metadata rows (age / injury status) — cheap secondary lookup.
  meta: Map<string, PlayerValue>
}

// Resolve a player asset to its Sleeper id. Sleeper trades store Sleeper
// ids natively; ESPN / Yahoo / NFL trades store platform-native ids, so we
// fall back to the same name+position match the rank stamper uses. Returns
// null when the asset can't be resolved (deep bench, defense in a weird
// format) — the prompt then shows the asset without value data.
function resolveSleeperId(
  a: Record<string, unknown>,
  platform: TradePlatform,
  nameLookup: Map<string, string> | null,
): string | null {
  if (a.kind !== 'player') return null
  const pid = typeof a.player_id === 'string' ? a.player_id : null
  if (platform === 'sleeper') return pid
  const name = typeof a.name === 'string' ? a.name : null
  const position = typeof a.position === 'string' ? a.position : null
  if (!name || !nameLookup) return null
  // Position-qualified first; bare-name fallback covers assets with no
  // position stored (retired players in old archives) — buildNameLookup
  // only registers bare names when they're unique, so this can't mismatch.
  if (position) {
    const exact = nameLookup.get(nameKey(name, position))
    if (exact) return exact
  }
  return nameLookup.get(nameKey(name, '')) ?? null
}

// "RB7"-style position rank labels from the consensus value ordering.
// Mirrors how the Analyzer's percentile badges are derived, but as a rank
// integer, which reads better in prose.
function consensusRankLabels(values: Map<string, ConsensusValue>): Map<string, string> {
  const byPos = new Map<string, Array<{ id: string; value: number }>>()
  for (const [pid, pv] of values) {
    const pos = pv.position.toUpperCase()
    if (!['QB', 'RB', 'WR', 'TE'].includes(pos)) continue
    const arr = byPos.get(pos) ?? []
    arr.push({ id: pid, value: pv.value })
    byPos.set(pos, arr)
  }
  const out = new Map<string, string>()
  for (const [pos, arr] of byPos) {
    arr.sort((a, b) => b.value - a.value)
    arr.forEach((e, i) => out.set(e.id, `${pos}${i + 1}`))
  }
  return out
}

// One-line positional depth summary per trade side, built from the
// Analyzer's cross-platform roster loader — works for Sleeper, ESPN,
// Yahoo, and NFL.com alike (the loader translates every roster to Sleeper
// ids). Summaries reflect the CURRENT roster, not the at-trade roster;
// the prompt discloses that caveat.
//
// Returns Map<side_id, summary>. Sides whose manager can't be matched to
// a live roster just get no summary line.
function buildRosterSummaries(args: {
  data: AnalyzerLeagueData
  sides: Array<{ side_id: string; manager_external_id: string | null }>
  bundle: ValueBundle
}): Map<string, string> {
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
  const out = new Map<string, string>()
  for (const side of args.sides) {
    if (!side.manager_external_id) continue
    const roster: AnalyzerRoster | undefined = args.data.rosters.find(
      (r) => r.ownerId === side.manager_external_id,
    )
    if (!roster || roster.playerIds.length === 0) continue

    const byPos = new Map<string, Array<{ value: number; label: string }>>()
    for (const pid of roster.playerIds) {
      const p = args.data.players[pid]
      const pos = (p?.position ?? '').toUpperCase()
      if (!(POSITIONS as readonly string[]).includes(pos)) continue
      const value = args.bundle.consensus.get(pid)?.value ?? 0
      const rank = args.bundle.rankLabels.get(pid)
      const arr = byPos.get(pos) ?? []
      arr.push({ value, label: `${p?.name ?? pid}${rank ? ` (${rank})` : ''}` })
      byPos.set(pos, arr)
    }

    const fragments: string[] = []
    for (const pos of POSITIONS) {
      const arr = byPos.get(pos) ?? []
      arr.sort((a, b) => b.value - a.value)
      if (arr.length === 0) {
        fragments.push(`${pos}: none`)
        continue
      }
      const top = arr.slice(0, 3).map((p) => p.label)
      const more = arr.length > 3 ? ` +${arr.length - 3}` : ''
      fragments.push(`${pos}(${arr.length}): ${top.join(', ')}${more}`)
    }
    out.set(side.side_id, fragments.join(' | '))
  }
  return out
}

// Valid letter grades. Used both in the prompt (so the model knows what to
// return) and at parse time to reject hallucinated grades like "B--".
const VALID_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'] as const
type Grade = typeof VALID_GRADES[number]

export type GradeResult = {
  trade_id: string
  graded_sides: number
  warnings: string[]
}

// One-trade grade. Returns graded_sides=0 with a warning if the call fails
// or the trade is malformed; never throws (callers loop over many trades and
// shouldn't be killed by one bad one).
export async function gradeTrade(tradeId: string): Promise<GradeResult> {
  const db = createAdminClient()
  const warnings: string[] = []

  // 1. Load trade + sides + manager display + league type. We also pull
  // seasons.external_id (the platform's league ID for that season) so the
  // roster-context lookup can hit the right Sleeper league for historical
  // trades.
  const { data: trade, error: tErr } = await db
    .from('trades')
    .select('id, league_id, season_id, week, executed_at, platform, leagues!inner(league_type, trade_desk_settings), seasons!inner(year, external_id)')
    .eq('id', tradeId)
    .maybeSingle()
  if (tErr || !trade) {
    warnings.push(`load trade ${tradeId}: ${tErr?.message ?? 'not found'}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  const { data: sides, error: sErr } = await db
    .from('trade_sides')
    .select('id, manager_id, assets, managers!inner(display_name, team_name, external_id)')
    .eq('trade_id', tradeId)
  if (sErr || !sides || sides.length < 2) {
    warnings.push(`load sides for trade ${tradeId}: ${sErr?.message ?? 'fewer than 2 sides'}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  const league = Array.isArray(trade.leagues) ? trade.leagues[0] : trade.leagues
  const season = Array.isArray(trade.seasons) ? trade.seasons[0] : trade.seasons
  const leagueType = (league?.league_type as 'redraft' | 'keeper' | 'dynasty') ?? 'redraft'
  const seasonYear = season?.year ?? null
  const platform = ((trade.platform as string | null) ?? 'sleeper') as TradePlatform

  // 2. Resolve every player asset to a Sleeper id so value data attaches
  // on ALL platforms — ESPN/Yahoo/NFL trades store platform-native ids
  // that would otherwise miss every lookup.
  const nameLookup = platform === 'sleeper' ? null : await buildNameLookup()
  const sidByAsset = new Map<Record<string, unknown>, string>()
  const resolvedIds: string[] = []
  for (const s of sides) {
    for (const a of (s.assets as Array<Record<string, unknown>>) ?? []) {
      const sid = resolveSleeperId(a, platform, nameLookup)
      if (sid) {
        sidByAsset.set(a, sid)
        resolvedIds.push(sid)
      }
    }
  }

  // 3. League context + consensus values — the SAME engine the Analyzer /
  // Finder / Rumor Mill run on, calibrated to the league's effective
  // settings (mode, superflex, scoring, TE premium, source preference).
  // loadAnalyzerData also gives us cross-platform rosters for the depth
  // summaries. Every step is best-effort: a failure degrades the prompt,
  // never blocks the grade.
  let effective: EffectiveSettings
  let analyzerData: AnalyzerLeagueData | null = null
  const load = await loadAnalyzerData(trade.league_id as string, { lookupBy: 'id' })
  if (load.ok) {
    analyzerData = load.data
    effective = load.data.effective
  } else {
    warnings.push(`league context: ${load.error.kind} — grading without roster context`)
    effective = mergeEffective(parseSettings(league?.trade_desk_settings), {
      mode: leagueType as LeagueMode,
      lineupType: null,
      teamCount: null,
      qbStarters: null,
    })
  }

  let consensus = new Map<string, ConsensusValue>()
  try {
    const valuation = await valuateLeague({
      mode: effective.mode,
      qbStarters: effective.qbStarters,
      teamCount: effective.teamCount,
      scoringProfile: effective.scoringProfile,
      tePremium: effective.tePremium,
      sourcePreference: effective.valueSourcePreference,
    })
    consensus = valuation.values
  } catch (e) {
    warnings.push(`consensus values: ${(e as Error).message}`)
  }

  const bundle: ValueBundle = {
    consensus,
    rankLabels: consensusRankLabels(consensus),
    meta: await getSleeperValuesForPlayerIds(resolvedIds),
  }

  const rosterSummaries = analyzerData
    ? buildRosterSummaries({
        data: analyzerData,
        sides: sides.map((s) => {
          const mgr = Array.isArray(s.managers) ? s.managers[0] : s.managers
          return {
            side_id: s.id as string,
            manager_external_id: (mgr?.external_id as string | null) ?? null,
          }
        }),
        bundle,
      })
    : new Map<string, string>()

  // 4. Build the prompt.
  const prompt = buildPrompt({
    leagueType,
    seasonYear,
    week: trade.week ?? null,
    tradeId,
    sides: sides.map((s) => {
      const mgr = Array.isArray(s.managers) ? s.managers[0] : s.managers
      return {
        side_id: s.id as string,
        manager_name: (mgr?.team_name as string | null) || (mgr?.display_name as string) || 'Manager',
        assets: (s.assets as Array<Record<string, unknown>>) ?? [],
        roster_summary: rosterSummaries.get(s.id as string) ?? null,
      }
    }),
    bundle,
    sidByAsset,
  })

  // 5. Call Groq.
  const apiKey = process.env.GROQ_API_KEY_TRADES || process.env.GROQ_API_KEY
  if (!apiKey) {
    warnings.push('GROQ_API_KEY_TRADES (or GROQ_API_KEY) not set')
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  let parsed: { summary: string; sides: Array<{ side_id: string; grade: string }> }
  try {
    const result = await groqChatJson<typeof parsed>({
      apiKey,
      model: MODEL,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      // Temperature 0.55 — high enough to break out of formulaic openings
      // and produce varied vocabulary; low enough that grade calibration
      // stays anchored. Lower values produced "X won this trade because..."
      // openings every time.
      temperature: 0.55,
      maxTokens: 900,
    })
    parsed = result.data
  } catch (e) {
    const msg = e instanceof GroqError ? e.message : (e as Error).message
    warnings.push(`groq call for trade ${tradeId}: ${msg}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  if (!parsed?.sides || !Array.isArray(parsed.sides)) {
    warnings.push(`trade ${tradeId}: model returned no sides array`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  // 6a. Write the trade-level summary first (one row update, not per-side).
  const summary = (parsed.summary ?? '').toString().trim().slice(0, 1500)
  if (summary) {
    const { error: sumErr } = await db
      .from('trades')
      .update({
        ai_summary: summary,
        ai_summary_model: `groq:${MODEL}`,
        ai_summary_at: new Date().toISOString(),
      })
      .eq('id', tradeId)
    if (sumErr) warnings.push(`update ai_summary for ${tradeId}: ${sumErr.message}`)
  } else {
    warnings.push(`trade ${tradeId}: model returned no summary`)
  }

  // 6b. Upsert per-side grades. Match by side_id; reject grades the model
  // invented. blurb column is no longer populated — the trade-level
  // ai_summary is the prose. Existing rows with old per-side blurbs are
  // cleared on re-grade so the UI stays consistent.
  const sideIds = new Set(sides.map((s) => s.id as string))
  let graded = 0
  for (const g of parsed.sides) {
    if (!sideIds.has(g.side_id)) {
      warnings.push(`trade ${tradeId}: model returned grade for unknown side ${g.side_id}`)
      continue
    }
    if (!(VALID_GRADES as readonly string[]).includes(g.grade)) {
      warnings.push(`trade ${tradeId}: invalid grade "${g.grade}" for side ${g.side_id}`)
      continue
    }
    const { error: upErr } = await db.from('trade_grades').upsert(
      {
        trade_side_id: g.side_id,
        grade: g.grade as Grade,
        blurb: null,
        model: `groq:${MODEL}`,
        graded_at: new Date().toISOString(),
      },
      { onConflict: 'trade_side_id' },
    )
    if (upErr) {
      warnings.push(`upsert grade for side ${g.side_id}: ${upErr.message}`)
      continue
    }
    graded++
  }

  return { trade_id: tradeId, graded_sides: graded, warnings }
}

// Revisit a previously-graded trade. Re-runs the LLM with the original
// summary + per-side grades as context, asks if the original verdict holds
// up. Writes revisit_summary / revisit_model / revisited_at on `trades`
// and revisit_grade on each `trade_grades` row.
//
// In Phase 2 we don't have player-performance data over the 4 weeks since
// the trade, so the revisit is essentially a fresh-eyes second opinion.
// Phase 3 will inject real stats and make this meaningful.
export async function revisitTrade(tradeId: string): Promise<GradeResult> {
  const db = createAdminClient()
  const warnings: string[] = []

  const { data: trade, error: tErr } = await db
    .from('trades')
    .select('id, league_id, week, ai_summary, platform, leagues!inner(league_type, trade_desk_settings), seasons!inner(year, external_id)')
    .eq('id', tradeId)
    .maybeSingle()
  if (tErr || !trade) {
    warnings.push(`load trade ${tradeId}: ${tErr?.message ?? 'not found'}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  if (!trade.ai_summary) {
    warnings.push(`trade ${tradeId}: no initial grade — grade it before revisiting`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  const { data: sides, error: sErr } = await db
    .from('trade_sides')
    .select('id, manager_id, assets, managers!inner(display_name, team_name, external_id), trade_grades(grade)')
    .eq('trade_id', tradeId)
  if (sErr || !sides || sides.length < 2) {
    warnings.push(`load sides for trade ${tradeId}: ${sErr?.message ?? 'fewer than 2 sides'}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  const league = Array.isArray(trade.leagues) ? trade.leagues[0] : trade.leagues
  const season = Array.isArray(trade.seasons) ? trade.seasons[0] : trade.seasons
  const leagueType = (league?.league_type as 'redraft' | 'keeper' | 'dynasty') ?? 'redraft'

  // Resolve asset ids cross-platform (same path as gradeTrade) and pull
  // consensus values. Revisits intentionally skip the live roster fetch
  // (the original summary already encoded that picture); valuateLeague is
  // provider-cached so it adds little latency to batch runs. Effective
  // settings come from the stored trade_desk_settings + league_type, no
  // roster round-trips.
  const revisitPlatform = ((trade.platform as string | null) ?? 'sleeper') as TradePlatform
  const revisitLookup = revisitPlatform === 'sleeper' ? null : await buildNameLookup()
  const sidByAsset = new Map<Record<string, unknown>, string>()
  const resolvedIds: string[] = []
  for (const s of sides) {
    for (const a of (s.assets as Array<Record<string, unknown>>) ?? []) {
      const sid = resolveSleeperId(a, revisitPlatform, revisitLookup)
      if (sid) {
        sidByAsset.set(a, sid)
        resolvedIds.push(sid)
      }
    }
  }

  const effective = mergeEffective(parseSettings(league?.trade_desk_settings), {
    mode: leagueType as LeagueMode,
    lineupType: null,
    teamCount: null,
    qbStarters: null,
  })
  let consensus = new Map<string, ConsensusValue>()
  try {
    const valuation = await valuateLeague({
      mode: effective.mode,
      qbStarters: effective.qbStarters,
      teamCount: effective.teamCount,
      scoringProfile: effective.scoringProfile,
      tePremium: effective.tePremium,
      sourcePreference: effective.valueSourcePreference,
    })
    consensus = valuation.values
  } catch (e) {
    warnings.push(`consensus values: ${(e as Error).message}`)
  }
  const bundle: ValueBundle = {
    consensus,
    rankLabels: consensusRankLabels(consensus),
    meta: await getSleeperValuesForPlayerIds(resolvedIds),
  }
  const rosterSummaries = new Map<string, string>()

  const sidePayload = sides.map((s) => {
    const mgr = Array.isArray(s.managers) ? s.managers[0] : s.managers
    const grades = Array.isArray(s.trade_grades) ? s.trade_grades : s.trade_grades ? [s.trade_grades] : []
    const originalGrade = (grades[0]?.grade as string | null) ?? null
    return {
      side_id: s.id as string,
      manager_name: (mgr?.team_name as string | null) || (mgr?.display_name as string) || 'Manager',
      assets: (s.assets as Array<Record<string, unknown>>) ?? [],
      original_grade: originalGrade,
      roster_summary: rosterSummaries.get(s.id as string) ?? null,
    }
  })

  const prompt = buildRevisitPrompt({
    leagueType,
    seasonYear: season?.year ?? null,
    week: trade.week ?? null,
    originalSummary: trade.ai_summary as string,
    sides: sidePayload,
    bundle,
    sidByAsset,
  })

  const apiKey = process.env.GROQ_API_KEY_TRADES || process.env.GROQ_API_KEY
  if (!apiKey) {
    warnings.push('GROQ_API_KEY_TRADES (or GROQ_API_KEY) not set')
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  let parsed: { summary: string; sides: Array<{ side_id: string; grade: string }> }
  try {
    const result = await groqChatJson<typeof parsed>({
      apiKey,
      model: MODEL,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.55,
      maxTokens: 900,
    })
    parsed = result.data
  } catch (e) {
    const msg = e instanceof GroqError ? e.message : (e as Error).message
    warnings.push(`groq revisit for trade ${tradeId}: ${msg}`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  if (!parsed?.sides || !Array.isArray(parsed.sides)) {
    warnings.push(`trade ${tradeId}: revisit returned no sides array`)
    return { trade_id: tradeId, graded_sides: 0, warnings }
  }

  const now = new Date().toISOString()
  const summary = (parsed.summary ?? '').toString().trim().slice(0, 1500)
  if (summary) {
    const { error: sumErr } = await db
      .from('trades')
      .update({
        revisit_summary: summary,
        revisit_model: `groq:${MODEL}`,
        revisited_at: now,
      })
      .eq('id', tradeId)
    if (sumErr) warnings.push(`update revisit_summary for ${tradeId}: ${sumErr.message}`)
  } else {
    warnings.push(`trade ${tradeId}: revisit returned no summary`)
  }

  const sideIds = new Set(sides.map((s) => s.id as string))
  let revised = 0
  for (const g of parsed.sides) {
    if (!sideIds.has(g.side_id)) {
      warnings.push(`trade ${tradeId}: revisit grade for unknown side ${g.side_id}`)
      continue
    }
    if (!(VALID_GRADES as readonly string[]).includes(g.grade)) {
      warnings.push(`trade ${tradeId}: invalid revisit grade "${g.grade}" for side ${g.side_id}`)
      continue
    }
    // Update — the row should already exist from the initial grade. If it
    // doesn't (edge case), we skip rather than partially fabricating one.
    const { error: upErr, count } = await db
      .from('trade_grades')
      .update({ revisit_grade: g.grade, revisited_at: now }, { count: 'exact' })
      .eq('trade_side_id', g.side_id)
    if (upErr) {
      warnings.push(`update revisit_grade for side ${g.side_id}: ${upErr.message}`)
      continue
    }
    if ((count ?? 0) === 0) {
      warnings.push(`side ${g.side_id} has no initial grade row — skipping revisit`)
      continue
    }
    revised++
  }

  // Stamp `rank_now` on each side's player assets — the 4-week verdict
  // snapshot. computePositionRanks fetches Sleeper weekly stats up to
  // (trade.week + 4) and ranks within position, same as ingest does for
  // rank_at_trade. Default PPR scoring is used here regardless of the
  // league's actual ruleset; matching exact custom scoring is a follow-up
  // when we surface platform-specific scoring extraction.
  if (trade.week && season?.year) {
    const verdictWeek = Math.min(18, Number(trade.week) + 4)
    const platform = (trade.platform as 'sleeper' | 'espn' | 'yahoo' | 'nfl') ?? 'sleeper'
    try {
      const ranks = await computePositionRanks({
        season: Number(season.year),
        throughWeek: verdictWeek,
        scoring: DEFAULT_PPR_SCORING,
      })
      for (const s of sides) {
        const original = (s.assets as Array<Record<string, unknown>>) ?? []
        const stamped = await stampRanks(original, { ranks, platform, field: 'rank_now' })
        const { error: stampErr } = await db
          .from('trade_sides')
          .update({ assets: stamped })
          .eq('id', s.id as string)
        if (stampErr) {
          warnings.push(`stamp rank_now for side ${s.id}: ${stampErr.message}`)
        }
      }
    } catch (e) {
      warnings.push(`revisit ranks for trade ${tradeId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { trade_id: tradeId, graded_sides: revised, warnings }
}

// Run revisits on graded trades that don't yet have a revisit. `eligibleOnly`
// (default true) restricts to trades graded ≥ 4 weeks ago — production mode.
// Pass false to revisit anything graded, for testing.
export async function revisitForLeague(args: {
  leagueId: string
  limit: number
  eligibleOnly?: boolean
}): Promise<{ scanned: number; revisited: number; warnings: string[] }> {
  const db = createAdminClient()
  const warnings: string[] = []
  const limit = limit_cap(args.limit)

  // Candidates: trades with an ai_summary (i.e. initially graded) and no
  // revisit yet, newest first.
  let q = db
    .from('trades')
    .select('id, ai_summary_at, revisited_at')
    .eq('league_id', args.leagueId)
    .eq('status', 'completed')
    .not('ai_summary', 'is', null)
    .is('revisited_at', null)
    .order('ai_summary_at', { ascending: false })

  const { data: rows, error } = await q.limit(limit * 2)
  if (error || !rows) {
    warnings.push(`load revisit candidates: ${error?.message ?? 'no data'}`)
    return { scanned: 0, revisited: 0, warnings }
  }

  const eligible = (args.eligibleOnly ?? true)
    ? rows.filter((r) => {
        if (!r.ai_summary_at) return false
        const ageMs = Date.now() - Date.parse(r.ai_summary_at)
        return ageMs >= 28 * 24 * 60 * 60 * 1000 // 4 weeks
      })
    : rows

  const targets = eligible.slice(0, limit).map((r) => r.id as string)

  const PER_CALL_DELAY_MS = 5000
  let revisited = 0
  for (let i = 0; i < targets.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS))
    const r = await revisitTrade(targets[i])
    revisited += r.graded_sides > 0 ? 1 : 0
    warnings.push(...r.warnings)
  }

  return { scanned: rows.length, revisited, warnings }
}

// Grade up to `limit` ungraded trades for a league, newest first. Returns
// aggregate counts + warnings. Caller is responsible for permission checks.
//
// `force` re-grades trades that already have grades (overwrites existing rows
// via upsert). Useful when you've tuned the prompt and want to refresh the
// archive without wiping the table by hand.
//
// We grade serially (not in parallel) for two reasons:
//   1. Groq's free tier rate-limits per second; bursts cause 429s.
//   2. The UI shows a single counter, so sequential is easier to reason about.
export async function gradeUngradedForLeague(args: {
  leagueId: string
  limit: number
  seasonYear?: number | null
  force?: boolean
}): Promise<{ scanned: number; graded: number; warnings: string[] }> {
  const db = createAdminClient()
  const warnings: string[] = []

  // Find trades that have at least one ungraded side. We pull all sides for
  // a league via an inner join and then collapse to distinct trade_ids; this
  // is cheaper than a NOT EXISTS subquery and lets us stop after `limit`.
  let q = db
    .from('trades')
    .select('id, executed_at, season_id, seasons!inner(year)')
    .eq('league_id', args.leagueId)
    .eq('status', 'completed')
    .order('executed_at', { ascending: false })
  if (args.seasonYear != null) {
    q = q.eq('seasons.year', args.seasonYear)
  }

  const { data: candidateTrades, error: cErr } = await q.limit(Math.max(limit_cap(args.limit) * 4, 50))
  if (cErr || !candidateTrades) {
    warnings.push(`load candidate trades: ${cErr?.message ?? 'no data'}`)
    return { scanned: 0, graded: 0, warnings }
  }

  // Pick which trades to grade. In force mode, take the first `limit` trades
  // by recency (re-grade everything). Otherwise filter to trades that have at
  // least one ungraded side.
  const ungraded: string[] = []
  if (args.force) {
    for (const t of candidateTrades) {
      if (ungraded.length >= limit_cap(args.limit)) break
      ungraded.push(t.id as string)
    }
  } else {
    for (const t of candidateTrades) {
      if (ungraded.length >= limit_cap(args.limit)) break
      const { data: sides } = await db
        .from('trade_sides')
        .select('id, trade_grades(trade_side_id)')
        .eq('trade_id', t.id)
      if (!sides) continue
      const anyMissing = sides.some((s) => {
        const grades = s.trade_grades as unknown
        const arr = Array.isArray(grades) ? grades : grades ? [grades] : []
        return arr.length === 0
      })
      if (anyMissing) ungraded.push(t.id as string)
    }
  }

  // Grade each ungraded trade. Pace at ~5s/call to stay under Groq's free
  // tier 12k TPM ceiling (each call is ~900 tokens). Skip the delay on the
  // first call so the user sees fast first feedback. The Groq client also
  // retries on 429, so the worst case here is slower, not failing.
  const PER_CALL_DELAY_MS = 5000
  let graded = 0
  for (let i = 0; i < ungraded.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS))
    const r = await gradeTrade(ungraded[i])
    graded += r.graded_sides > 0 ? 1 : 0
    warnings.push(...r.warnings)
  }

  return { scanned: candidateTrades.length, graded, warnings }
}

// ─── Prompt builder ──────────────────────────────────────────────────────

// Deterministic per-trade lead angle. Rotating the opening angle is the
// single biggest lever against every archive write-up sounding the same:
// the model reliably obeys "open from THIS angle," and hashing the trade
// id means re-grades keep the same angle while neighboring trades on the
// page get different ones.
const LEAD_ANGLES = [
  'the age and contention-window mismatch between the two sides',
  'the opportunity cost: what the stronger side had to give up to get this done',
  'positional scarcity: which position in this league is hardest to fill, and how this deal moves it',
  'the riskiest player in the deal (injury history, role uncertainty, age cliff) and what happens if that bet fails',
  'roster fit: how each headline piece slots into, or duplicates, its new team\'s depth chart',
  'market timing: who bought low, who sold high, and whether it was the right moment',
  'the throw-in piece everyone will ignore, and whether it quietly swings the deal',
  'what each manager is telling the league about their season by making this trade',
]

function pickLeadAngle(tradeId: string): string {
  let h = 2166136261
  for (let i = 0; i < tradeId.length; i++) {
    h ^= tradeId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return LEAD_ANGLES[(h >>> 0) % LEAD_ANGLES.length]
}

type PromptArgs = {
  leagueType: 'redraft' | 'keeper' | 'dynasty'
  seasonYear: number | null
  week: number | null
  tradeId: string
  sides: Array<{
    side_id: string
    manager_name: string
    assets: Array<Record<string, unknown>>
    // One-line positional depth summary for the side's current roster.
    // Null when the manager couldn't be matched to a live roster or the
    // roster fetch failed.
    roster_summary: string | null
  }>
  // Consensus values + rank labels + Sleeper meta, keyed by Sleeper id;
  // sidByAsset translates each asset object to its Sleeper id.
  bundle: ValueBundle
  sidByAsset: Map<Record<string, unknown>, string>
}

function buildPrompt(args: PromptArgs): { system: string; user: string } {
  const typeNote =
    args.leagueType === 'dynasty'
      ? 'This is a DYNASTY league — weight long-term player value, draft picks (especially early-round), and youth heavily. Rest-of-season production matters less than future seasons.'
      : args.leagueType === 'keeper'
      ? 'This is a KEEPER league — players retained from year to year. Weight both rest-of-season production AND keeper value (cheap young talent is more valuable).'
      : 'This is a REDRAFT league — only current-season value matters. Players reset every year. Draft picks (if present) are for next year only.'

  // Calibration matters: without explicit anchors the model tends to grade
  // every trade as a blowout (A on one side, D/F on the other). Real fantasy
  // trades cluster in the B range because managers don't make trades they
  // think are obviously bad. Give the model a target distribution.
  //
  // Recap quality matters too: without an explicit ban list and worked
  // examples, the model defaults to "X won this trade because..." every
  // time. The summary is a grading RATIONALE, not a play-by-play.
  const system =
    [
      'You are an experienced fantasy football trade analyst writing for a league archive. The summary you write is a GRADING RATIONALE — it must explain WHY the grades came out the way they did, not just restate who received what.',
      typeNote,
      '',
      'GRADING SCALE (use only these grades): A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F.',
      '',
      'GRADE CALIBRATION — value-anchored:',
      '• Use the consensus market value and position rank on each player line as your primary anchor. Values sit on a roughly 0-10000 scale blended from FantasyCalc, KeepTradeCut, DynastyProcess, and FantasyPros, calibrated to this league\'s format. Lower rank number = more valuable player.',
      '• A trade with very small rank gaps between sides is roughly even — both sides earn comparable grades.',
      '• A trade where one side acquires meaningfully better-ranked players earns a higher grade for that side.',
      '• When BOTH sides acquired top-24 positional starters they can use, BOTH sides can earn A-range grades. Mutual wins are real — A/A is a correct grade for a trade where both teams hit a real need without losing value.',
      '• Grades on opposing sides do NOT need to mirror. A trade can be A-/B (clear winner + the other side still got fair value), A/A (both sides won), or A/C (one side significantly stole value).',
      '• Use D / D- / F ONLY when a side got dramatically worse players (huge rank gap) without addressing positional scarcity.',
      '• Don\'t default to B+/B for everything just because trades "should be balanced." If the data shows a real gap, grade accordingly.',
      '',
      'WRITING THE RATIONALE — 3 to 4 sentences total. Follow these rules:',
      '',
    '1. NEVER start with "The X won this trade", "X won the trade", or any variation of who-won-the-trade as the opening line. The user message names a LEAD ANGLE for this specific write-up: open from that angle, then broaden into the full rationale. Never open with a verdict statement.',
      '',
      '2. The rationale must EXPLAIN THE GRADE. The reader can already see who received what from the asset list. Your job is to say WHY one side\'s package is worth more (or less, or even). Reference player tiers, age curves, opportunity, role, NFL team context, draft pick value if dynasty/keeper, positional scarcity. Be specific.',
      '',
      '3. Vary sentence structure and vocabulary. Do not use the same opening template twice.',
      '',
      'BANNED PHRASES — never write any of these:',
      '• "won this trade" / "won the trade" / "got the better end"',
      '• "primarily due to" / "primarily because"',
      '• "added depth" / "upgrades the position" / "addressed a need" as the entire reason',
      '• "solid move" / "great trade for both" / "win-win" / "fair deal" as the verdict',
      '• Any sentence whose only purpose is to restate who received whom',
      '• The em dash character. Never use an em dash anywhere in your writing; use commas, periods, or parentheses instead.',
      '',
      'EXAMPLES — study these carefully:',
      '',
      'GOOD (varied openings, real analysis):',
      '• "Christian McCaffrey is the bet here: an elite RB1 ceiling if he stays healthy, but the Sinkaroos are paying full freight in 2026 picks for a 29-year-old with a calf history. Horsecocks come away with the cleaner long-term profile via two firsts and Jahmyr Gibbs, who has three years of cost control ahead of him. In a dynasty timeline that values youth and picks, Horsecocks built equity. A win-now manager would defend the McCaffrey side."',
      '• "Trading down from a top-six pick for two thirds and a depth piece looks fine on paper, but the tier break at pick 6 is real — that\'s where the season-altering RBs go. Joey\'s thirds are lottery tickets, not equivalents. The Sinkaroos give up the most leverage they had at the deadline and walk away with role players."',
      '',
      'BAD (formulaic, restates the trade):',
      '• "The Sinkaroos won this trade, primarily due to acquiring Christian McCaffrey, who upgrades their RB position. Horsecocks added depth via Jahmyr Gibbs and two picks. Solid move for both teams."',
      '• "Joey won the trade because he got a better player. He gave up two picks but added a top RB. The other side gained some picks but lost their best player."',
      '',
      'USING THE VALUE DATA + ROSTER CONTEXT:',
      '• Each player line shows the player\'s consensus position rank (e.g. "RB3" = the 3rd-most-valuable RB on the market), consensus market value, age, and injury status when known. Position rank is your primary anchor — a player with rank "RB12" is a strong starter; "RB48" is depth. Market value settles close calls: RB11 vs RB13 with near-equal values is a wash.',
      '• Each side also has a "Current roster" line showing positional depth (e.g. "RB(4): McCaffrey (RB3), Hall (RB8), Mostert (RB42) +1 | WR(3): Chase (WR2)..."). Use this to weigh need: a side acquiring an RB while already deep at RB is paying retail; the same RB to a side thin at the position is a real win. NOTE: this is the current roster, which may differ from the at-trade roster for historical trades — when the trade is recent (within a week or two), trust the roster; for older trades, treat it as a rough proxy.',
      '• Tier reference: pos_rank 1-12 = elite starter at the position; 13-24 = solid starter; 25-48 = bye-week filler / handcuff; 49+ = deep depth / waiver.',
      '• Calibrate the grade gap to the rank gap:',
      '  - Both sides got comparable tiers (e.g. RB10 traded for RB14) → roughly even, both B+/B (or A-/A- if both filled real needs).',
      '  - One tier apart (RB8 vs RB22) → clear winner, A-/B range.',
      '  - Two+ tiers apart (RB4 vs RB28) → big swing, A/C+ or larger.',
      '• When BOTH sides acquired top-24 positional starters they can use, BOTH can earn A-range grades. A/A is correct when both teams hit a real need without overpaying. Mutual wins are real.',
      '• Age matters more for dynasty/keeper than redraft. For dynasty: under-25 = ascending; 29+ = declining. Bump grades accordingly. For redraft: only current-year production matters.',
      '• Picks have no rank data — treat next-year 1st rounders as ~top-50 positional value, 2nds as ~top-100, 3rds as ~top-150, 4th+ as depth. Future-year picks (2027+) are worth ~70% of next-year picks.',
      '',
      'OUTPUT: strict JSON only — no prose before/after, no markdown fences. Shape:',
      '{ "summary": "<grading rationale, 3-4 sentences>", "sides": [{ "side_id": "<uuid>", "grade": "<letter>" }, ...] }',
    ].join('\n')

  const sidesText = args.sides
    .map((s, idx) => {
      const assets = s.assets.length === 0
        ? '  (nothing)'
        : s.assets.map((a) => `  - ${formatAssetWithValue(a, args.bundle, args.sidByAsset)}`).join('\n')
      const roster = s.roster_summary ? `\n   Current roster: ${s.roster_summary}` : ''
      return `Side ${idx + 1} — ${s.manager_name} (side_id: ${s.side_id}) received:\n${assets}${roster}`
    })
    .join('\n\n')

  const user =
    [
      `League type: ${args.leagueType}`,
      args.seasonYear != null ? `Season: ${args.seasonYear}` : null,
      args.week != null ? `Week: ${args.week}` : null,
      `LEAD ANGLE for this write-up (open from this angle, then broaden): ${pickLeadAngle(args.tradeId)}`,
      '',
      sidesText,
      '',
      'Return JSON with this exact shape:',
      '{',
      '  "summary": "<3-4 sentence recap of the whole trade>",',
      '  "sides": [',
      args.sides.map((s) => `    {"side_id": "${s.side_id}", "grade": "<letter>"}`).join(',\n'),
      '  ]',
      '}',
    ]
      .filter((line) => line !== null)
      .join('\n')

  return { system, user }
}

// Revisit prompt — fed the original verdict so the model can either agree
// ("the grade holds") or shift. Same JSON output shape as buildPrompt for
// parser reuse, but the writing voice is retrospective.
type RevisitPromptArgs = {
  leagueType: 'redraft' | 'keeper' | 'dynasty'
  seasonYear: number | null
  week: number | null
  originalSummary: string
  sides: Array<{
    side_id: string
    manager_name: string
    assets: Array<Record<string, unknown>>
    original_grade: string | null
    roster_summary: string | null
  }>
  bundle: ValueBundle
  sidByAsset: Map<Record<string, unknown>, string>
}

function buildRevisitPrompt(args: RevisitPromptArgs): { system: string; user: string } {
  const typeNote =
    args.leagueType === 'dynasty'
      ? 'This is a DYNASTY league — long-term value matters more than rest-of-season.'
      : args.leagueType === 'keeper'
      ? 'This is a KEEPER league — both rest-of-season and next-year value matter.'
      : 'This is a REDRAFT league — only current-season value matters.'

  const system =
    [
      'You are an experienced fantasy football trade analyst writing a retrospective on a trade graded 4 weeks ago. The retrospective you write is a GRADING RATIONALE — it must explain WHY the (possibly revised) grades are what they are, not just restate the trade.',
      typeNote,
      '',
      'You are given the original recap and the original per-side letter grades.',
      'Your job: write a fresh retrospective that says whether the grade held up. Adjust grades if your view has changed; otherwise keep them.',
      '',
      'GRADING SCALE (use only these): A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F.',
      '',
      'CALIBRATION:',
      '• Stay anchored to the original grade unless the trade looks meaningfully different in hindsight.',
      '• When you do shift, move one or two notches (e.g. B+ → A-, not B+ → F). Dramatic regrades require a clearly different read.',
      '• Most retrospectives will keep the original grade. That is the correct outcome when nothing about the deal looks different now.',
      '',
      'WRITING THE RETROSPECTIVE — 3 to 4 sentences. Follow these rules:',
      '',
      '1. Vary your openings. NEVER start two retrospectives with the same phrase. SPECIFICALLY BANNED openers: "Four weeks after", "Four weeks into the season", "Four weeks later", "In hindsight", "Looking back", "The X side\'s grade holds up", "X won the trade in hindsight", or any verdict-first formula.',
      '',
      '2. Lead with the most interesting observation in retrospect: a specific player\'s arc (breakout, regression, injury), a pick that gained/lost value, a positional context that has changed, a roster decision that aged well or badly. Concrete first, conclusion later.',
      '',
      '3. The retrospective must EXPLAIN the (possibly revised) grade. Reference what has changed (or held) about specific players, picks, or roster contexts. Be specific.',
      '',
      'Example good openers (vary your voice — do not copy these verbatim):',
      '• "The Saquon bet has paid off in a way few saw coming..."',
      '• "Pollard\'s ankle changes the calculus here..."',
      '• "Pittsburgh\'s offense has cratered and so has this trade for..."',
      '• "On second look, the Sinkaroos\' draft capital was the real prize..."',
      '• "What looked like a depth move at the time has become a roster cornerstone..."',
      '• "The early returns favored A; week-six performance flips that..."',
      '',
      'BANNED PHRASES (same as initial grading): "won this trade", "primarily due to", "added depth", "upgrades the position", "solid move", "fair deal". The em dash character is also banned everywhere; use commas, periods, or parentheses instead.',
      '',
      'Reference managers by team name. Retrospective voice is optional and should be used sparingly — most sentences should be present-tense analysis.',
      '',
      'OUTPUT: strict JSON only — { "summary": "<retrospective rationale>", "sides": [{ "side_id", "grade" }, ...] }',
    ].join('\n')

  const sidesText = args.sides
    .map((s, idx) => {
      const assets = s.assets.length === 0
        ? '  (nothing)'
        : s.assets.map((a) => `  - ${formatAssetWithValue(a, args.bundle, args.sidByAsset)}`).join('\n')
      const rosterLine = s.roster_summary ? `   Current roster: ${s.roster_summary}\n` : ''
      const originalGradeLine = s.original_grade ? `   Original grade: ${s.original_grade}\n` : ''
      return `Side ${idx + 1} — ${s.manager_name} (side_id: ${s.side_id}) received:\n${assets}\n${rosterLine}${originalGradeLine}`
    })
    .join('\n')

  const user =
    [
      `League type: ${args.leagueType}`,
      args.seasonYear != null ? `Season: ${args.seasonYear}` : null,
      args.week != null ? `Week: ${args.week}` : null,
      '',
      'ORIGINAL RECAP (from 4 weeks ago):',
      args.originalSummary,
      '',
      'TRADE:',
      sidesText,
      '',
      'Return JSON with this exact shape:',
      '{',
      '  "summary": "<3-4 sentence retrospective>",',
      '  "sides": [',
      args.sides.map((s) => `    {"side_id": "${s.side_id}", "grade": "<letter>"}`).join(',\n'),
      '  ]',
      '}',
    ]
      .filter((line) => line !== null)
      .join('\n')

  return { system, user }
}

function formatAsset(a: Record<string, unknown>): string {
  const kind = a.kind as string
  if (kind === 'player') {
    const name = (a.name as string) || `Player ${a.player_id}`
    const pos = (a.position as string) || '—'
    const team = (a.team as string) || '?'
    return `${pos} ${name} (${team})`
  }
  if (kind === 'pick') {
    const year = a.season_year as number
    const round = a.round as number
    return `${year} ${ordinal(round)} round pick`
  }
  if (kind === 'faab') {
    return `$${a.amount} FAAB`
  }
  return `unknown asset (${kind})`
}

// Like formatAsset but inlines the player's consensus position rank,
// market value, age, and injury status in plain prose so the prompt reads
// naturally. Works on every platform because the asset was resolved to a
// Sleeper id first (sidByAsset). Falls back to the plain format for
// players we couldn't resolve or the value engine doesn't cover.
function formatAssetWithValue(
  a: Record<string, unknown>,
  bundle: ValueBundle,
  sidByAsset: Map<Record<string, unknown>, string>,
): string {
  const kind = a.kind as string
  if (kind !== 'player') return formatAsset(a)

  const name = (a.name as string) || `Player ${a.player_id}`
  const pos = (a.position as string) || '—'
  const team = (a.team as string) || '?'
  const sid = sidByAsset.get(a)
  if (!sid) return `${name} — ${pos} on ${team} (no value data)`

  const cv = bundle.consensus.get(sid)
  const meta = bundle.meta.get(sid)
  const traits: string[] = []
  const rank = bundle.rankLabels.get(sid)
  if (rank) traits.push(rank)
  if (cv) traits.push(`market value ${cv.value}`)
  const age = cv?.age ?? meta?.age
  if (age != null) traits.push(`age ${age}`)
  const injury = meta?.injury_status ?? null
  if (injury && injury !== 'Healthy') traits.push(`injury: ${injury}`)
  if (traits.length === 0) return `${name} — ${pos} on ${team} (no value data)`
  return `${name} — ${pos} on ${team}, ${traits.join(', ')}`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

// Cap the per-request batch size so a single button click can't run away
// with Vercel's serverless timeout. Caller-supplied limit is clamped here.
function limit_cap(n: number): number {
  return Math.max(1, Math.min(50, n))
}
