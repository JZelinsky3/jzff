// Vercel Cron — daily automatic trade grading + 4-week revisits.
//
// This is how grades happen in production: no buttons. Any trade that
// landed on the wire in the last GRADE_WINDOW_DAYS and hasn't been graded
// yet gets a grade on the next daily run, so a Tuesday-night trade is
// marked up by Wednesday morning. Old archives imported with a new league
// are deliberately left alone — the executed_at window means only trades
// made while the league is on TSC ever auto-grade.
//
// Revisits ride the same run: any auto-or-manually graded trade whose
// grade is 4+ weeks old and hasn't been revisited gets its verdict pass.
//
// Eligibility: the league owner must have Veteran-tier trades access
// (tier2+/comp) — same gate the trades page enforces — so free leagues
// don't consume Groq quota for a page they can't see.
//
// Budgets: Groq free tier is paced at ~5s/call inside gradeTrade's batch
// loop; MAX_GRADES + MAX_REVISITS keep the whole run safely inside
// maxDuration. A backlog simply drains across consecutive days.
//
// Schedule: daily 14:00 UTC (see vercel.json), after the Monday value
// refresh so grades quote fresh ranks.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gradeTrade, revisitTrade } from '@/lib/tradeGrader'
import { leagueHasTradesAccess } from '@/lib/trades'
import { computePositionRanks, stampRanks, type PositionRanks } from '@/lib/positionRanks'
import { DEFAULT_PPR_SCORING } from '@/lib/scoring'

export const maxDuration = 300

const GRADE_WINDOW_DAYS = 14
const REVISIT_AGE_DAYS = 28
const MAX_GRADES = 25
const MAX_REVISITS = 15
const PER_CALL_DELAY_MS = 5000
// Rank refresh: newest trades first, drains across days if a backlog
// ever exceeds the cap. Sides, not trades, are the write unit.
const MAX_RANK_TRADES = 150

type TradeRow = { id: string; league_id: string }

// Filter candidate trades down to leagues whose owner has trades access.
// Owner lookups are cached per run so a league with 5 new trades costs one
// Stripe/comp check, not five.
async function filterEligible(
  db: ReturnType<typeof createAdminClient>,
  rows: TradeRow[],
): Promise<{ eligible: TradeRow[]; leaguesChecked: number }> {
  const leagueIds = [...new Set(rows.map((r) => r.league_id))]
  if (leagueIds.length === 0) return { eligible: [], leaguesChecked: 0 }
  const { data: leagues } = await db
    .from('leagues')
    .select('id, owner_id')
    .in('id', leagueIds)
  // Access is per-league (a paid owner's trial slot unlocks trades even if
  // their other leagues don't), so we check each league once. leagueIds are
  // already de-duped above, so there's no repeated work to cache away.
  const accessByLeague = new Map<string, boolean>()
  for (const lg of leagues ?? []) {
    accessByLeague.set(lg.id, await leagueHasTradesAccess(lg.id, lg.owner_id))
  }
  return {
    eligible: rows.filter((r) => accessByLeague.get(r.league_id) === true),
    leaguesChecked: leagueIds.length,
  }
}

// Keep every player asset's `rank_now` current for recent seasons, so the
// wire shows where a traded player sits in the points race TODAY (and the
// verdict desk can show "at trade → now"). Revisits used to be the only
// thing stamping rank_now, frozen at trade week + 4; this pass refreshes
// it daily instead. Ranks are computed once per season year (through week
// 18 — season-to-date under default PPR, same convention as revisits) and
// stamped across every eligible trade of that season. Costs zero LLM
// calls; the Sleeper stat fetches are cached in-process.
async function refreshRanksNow(
  db: ReturnType<typeof createAdminClient>,
  warnings: string[],
): Promise<number> {
  // The season whose stats are still "live" flips over in September; the
  // previous year rides along so a just-finished season keeps its final
  // ranks and pre-pipeline trades get backfilled.
  const nowDate = new Date()
  const liveYear = nowDate.getMonth() >= 8 ? nowDate.getFullYear() : nowDate.getFullYear() - 1
  const seasonYears = [liveYear, liveYear - 1]

  const { data: rows, error } = await db
    .from('trades')
    .select('id, league_id, platform, seasons!inner(year)')
    .eq('status', 'completed')
    .in('seasons.year', seasonYears)
    .order('executed_at', { ascending: false })
    .limit(MAX_RANK_TRADES)
  if (error) {
    warnings.push(`rank refresh: load trades: ${error.message}`)
    return 0
  }

  const { eligible } = await filterEligible(db, (rows ?? []) as TradeRow[])
  if (eligible.length === 0) return 0
  const eligibleIds = new Set(eligible.map((r) => r.id))

  const metaByTrade = new Map<string, { platform: 'sleeper' | 'espn' | 'yahoo' | 'nfl'; year: number }>()
  for (const t of rows ?? []) {
    if (!eligibleIds.has(t.id)) continue
    const season = Array.isArray(t.seasons) ? t.seasons[0] : t.seasons
    metaByTrade.set(t.id, {
      platform: (t.platform as 'sleeper' | 'espn' | 'yahoo' | 'nfl') ?? 'sleeper',
      year: season?.year ?? liveYear,
    })
  }

  const ranksByYear = new Map<number, PositionRanks | null>()
  for (const year of new Set([...metaByTrade.values()].map((m) => m.year))) {
    try {
      ranksByYear.set(year, await computePositionRanks({
        season: year,
        throughWeek: 18,
        scoring: DEFAULT_PPR_SCORING,
      }))
    } catch (e) {
      warnings.push(`rank refresh: ranks for ${year}: ${e instanceof Error ? e.message : String(e)}`)
      ranksByYear.set(year, null)
    }
  }

  const { data: sides, error: sidesErr } = await db
    .from('trade_sides')
    .select('id, trade_id, assets')
    .in('trade_id', [...metaByTrade.keys()])
  if (sidesErr) {
    warnings.push(`rank refresh: load sides: ${sidesErr.message}`)
    return 0
  }

  let stamped = 0
  for (const s of sides ?? []) {
    const meta = metaByTrade.get(s.trade_id)
    const ranks = meta ? ranksByYear.get(meta.year) : null
    if (!meta || !ranks || ranks.size === 0) continue
    const original = (s.assets as Array<Record<string, unknown>>) ?? []
    const updated = await stampRanks(original, { ranks, platform: meta.platform, field: 'rank_now' })
    if (JSON.stringify(updated) === JSON.stringify(original)) continue
    const { error: upErr } = await db
      .from('trade_sides')
      .update({ assets: updated })
      .eq('id', s.id)
    if (upErr) warnings.push(`rank refresh: side ${s.id}: ${upErr.message}`)
    else stamped++
  }
  return stamped
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const warnings: string[] = []
  const now = Date.now()

  // ── Fresh trades → initial grades ─────────────────────────────────────
  const windowStart = new Date(now - GRADE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: freshRows, error: freshErr } = await db
    .from('trades')
    .select('id, league_id')
    .eq('status', 'completed')
    .is('ai_summary', null)
    .gte('executed_at', windowStart)
    .order('executed_at', { ascending: false })
    .limit(MAX_GRADES * 3)
  if (freshErr) warnings.push(`load fresh trades: ${freshErr.message}`)

  const fresh = await filterEligible(db, (freshRows ?? []) as TradeRow[])
  const toGrade = fresh.eligible.slice(0, MAX_GRADES)

  let graded = 0
  for (let i = 0; i < toGrade.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS))
    const r = await gradeTrade(toGrade[i].id)
    if (r.graded_sides > 0) graded += 1
    warnings.push(...r.warnings)
  }

  // ── Month-old grades → verdict revisits ───────────────────────────────
  const revisitCutoff = new Date(now - REVISIT_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: staleRows, error: staleErr } = await db
    .from('trades')
    .select('id, league_id')
    .eq('status', 'completed')
    .not('ai_summary', 'is', null)
    .is('revisited_at', null)
    .lte('ai_summary_at', revisitCutoff)
    .order('ai_summary_at', { ascending: true })
    .limit(MAX_REVISITS * 3)
  if (staleErr) warnings.push(`load revisit candidates: ${staleErr.message}`)

  const stale = await filterEligible(db, (staleRows ?? []) as TradeRow[])
  const toRevisit = stale.eligible.slice(0, MAX_REVISITS)

  let revisited = 0
  for (let i = 0; i < toRevisit.length; i++) {
    if (i > 0 || graded > 0) await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS))
    const r = await revisitTrade(toRevisit[i].id)
    if (r.graded_sides > 0) revisited += 1
    warnings.push(...r.warnings)
  }

  // ── Current-rank refresh on every recent trade ────────────────────────
  const ranksStamped = await refreshRanksNow(db, warnings)

  return NextResponse.json({
    graded,
    gradeCandidates: fresh.eligible.length,
    revisited,
    revisitCandidates: stale.eligible.length,
    ranksStamped,
    warnings,
  })
}
