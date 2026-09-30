// Cron — daily automatic trade grading + 4-week revisits.
//
// This is how grades happen in production: no buttons. Any ungraded trade
// from FIRST_GRADED_SEASON (2026) on gets a grade on the next daily run, so
// a trade is marked up within a day of being made and a preseason trade is
// marked up the day after it clears. Old archives imported with a
// new league are deliberately left alone: the season floor is the guard, so
// imported history never picks up a grade even if a backfill or re-import
// gives it a recent timestamp.
//
// Grading waits for the week a trade's ranks read through to finish (see
// tradeRankWeek in lib/positionRanks). A Tuesday-to-Saturday trade reads
// through last week and is graded on the next run; one made Sunday or
// Monday, mid-slate, is held until the week is over and graded Tuesday.
//
// Revisits ride the same run: a graded trade gets its verdict pass once four
// more weeks are finished past that rank week (a preseason trade's verdict
// comes after week 4). Tied to the trade's week, not to when the grade was
// written.
//
// Last, every recent trade's rank chips are brought in line (lib/tradeRanks):
// the rank at trade once its week is over, the verdict's rank once there is
// a verdict, and no second chip before that.
//
// Manual backfill: ?only=ranks runs just that last pass (no grading, no
// Groq), and &league=<slug> narrows it to one league.
//
// Eligibility: the league owner must have Veteran-tier trades access
// (tier2+/comp) — same gate the trades page enforces — so free leagues
// don't consume Groq quota for a page they can't see.
//
// Budgets: Groq free tier is paced at ~5s/call inside gradeTrade's batch
// loop; MAX_GRADES + MAX_REVISITS keep the whole run safely inside
// maxDuration. A backlog simply drains across consecutive days.
//
// ── Freshness, which this job is unusually strict about ───────────────────
// A grade is permanent public prose quoting a rank, a market value and an
// injury designation. It is never revised, and a grade written off stale
// inputs reads exactly as confident as a correct one. Trades are also
// usually made BECAUSE of news, so "slightly stale" is precisely the case
// that inverts the verdict. Two different inputs, two different mechanisms:
//
//   • Market values (KTC, FantasyCalc, ...) are pulled LIVE. gradeTrade
//     passes { fresh: true } to valuateLeague, bypassing the 6h browse
//     cache, memoized per run so this stays one fetch per provider rather
//     than one per trade. See lib/values/cache.
//   • Ranks / injury / age come from the player_values TABLE, so freshness
//     there is a scheduling problem instead. Hence the chain ordering in
//     .github/workflows/cron.yml (dictionary, then values, then trades,
//     then this) plus the hard guard below for hand-dispatched runs.
//
// If every provider is down, gradeTrade declines to write a grade at all
// rather than writing a value-free one. The trade stays in the queue.
//
// Schedule: last step of the daily chain in .github/workflows/cron.yml.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gradeTrade, revisitTrade, FIRST_GRADED_SEASON, verdictIsDue } from '@/lib/tradeGrader'
import { leagueHasTradesAccess } from '@/lib/trades'
import { tradeRankWeek, tradeRankWeekOver } from '@/lib/positionRanks'
import { loadRankTrades, stampTradeRanks } from '@/lib/tradeRanks'

export const maxDuration = 300

const MAX_GRADES = 25
const MAX_REVISITS = 15
const PER_CALL_DELAY_MS = 5000
// Rank pass: newest trades first. Every graded-season trade is cheap to
// re-check (no LLM, stats cached per week), so the cap is generous.
const MAX_RANK_TRADES = 400

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

// A grade is a permanent, public artifact: it quotes a player's position
// rank and injury designation in prose and then never re-reads them. Writing
// one against a stale player_values table bakes last week's picture into the
// record, and the failure is invisible because the grade still reads fine.
//
// The daily workflow refreshes values immediately before calling this route,
// so in the normal case the table is minutes old. This guard is for the
// abnormal case: the value refresh failed, or somebody hand-dispatched this
// job on its own. A skipped day costs nothing since the backlog simply
// drains on the next run, so refusing is strictly better than guessing.
const MAX_VALUE_AGE_MS = 26 * 60 * 60 * 1000

async function playerValuesAgeMs(
  db: ReturnType<typeof createAdminClient>,
): Promise<number | null> {
  const { data } = await db
    .from('player_values')
    .select('updated_at')
    .eq('source', 'sleeper')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.updated_at) return null
  const t = Date.parse(data.updated_at)
  return Number.isFinite(t) ? Date.now() - t : null
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
  const params = new URL(req.url).searchParams

  if (params.get('only') === 'ranks') {
    const warnings: string[] = []
    let leagueId: string | undefined
    const slug = params.get('league')
    if (slug) {
      const { data: lg } = await db.from('leagues').select('id').eq('slug', slug).maybeSingle()
      if (!lg) return NextResponse.json({ error: `no league ${slug}` }, { status: 404 })
      leagueId = lg.id
    }
    const trades = await loadRankTrades(db, { leagueId, limit: MAX_RANK_TRADES }, warnings)
    const ranksStamped = await stampTradeRanks(db, trades, warnings)
    return NextResponse.json({ trades: trades.length, ranksStamped, warnings })
  }

  // Freshness gate. `?force=1` is the manual-dispatch escape hatch for when
  // you knowingly want grades out of a degraded state.
  const force = params.get('force') === '1'
  const valueAgeMs = await playerValuesAgeMs(db)
  if (!force && (valueAgeMs == null || valueAgeMs > MAX_VALUE_AGE_MS)) {
    const age = valueAgeMs == null ? 'never populated' : `${Math.round(valueAgeMs / 3600000)}h old`
    return NextResponse.json(
      {
        error: 'player values are stale; refusing to grade',
        detail: `player_values is ${age}; run /api/cron/refresh-player-values first, or pass ?force=1`,
        valueAgeHours: valueAgeMs == null ? null : Math.round(valueAgeMs / 3600000),
      },
      { status: 503 },
    )
  }
  const warnings: string[] = []

  // ── Fresh trades → initial grades ─────────────────────────────────────
  // Every ungraded trade from FIRST_GRADED_SEASON on, newest first.
  //
  // There used to be a 14-day executed_at window here as the guard against
  // grading imported history. The season floor does that job properly now,
  // and the window actively broke preseason: the offseason is long, so a
  // draft-week trade would age past 14 days and never get a grade at all.
  // Anything still ungraded is fair game; the caps below drain a backlog
  // across consecutive days.
  const { data: freshRows, error: freshErr } = await db
    .from('trades')
    .select('id, league_id, executed_at, seasons!inner(year, settings)')
    .eq('status', 'completed')
    .is('ai_summary', null)
    .gte('seasons.year', FIRST_GRADED_SEASON)
    .order('executed_at', { ascending: false })
    .limit(MAX_GRADES * 3)
  if (freshErr) warnings.push(`load fresh trades: ${freshErr.message}`)

  // Held until the week its ranks read through is over: a trade made on
  // Sunday or Monday waits for Tuesday.
  const readyRows = (freshRows ?? []).filter((t) => {
    const season = Array.isArray(t.seasons) ? t.seasons[0] : t.seasons
    if (!season || !t.executed_at) return false
    const settings = (season.settings ?? {}) as Record<string, unknown>
    const start = typeof settings.season_start_date === 'string' ? settings.season_start_date : null
    return tradeRankWeekOver(season.year, tradeRankWeek(season.year, t.executed_at, start), start)
  })

  const fresh = await filterEligible(db, readyRows as TradeRow[])
  const toGrade = fresh.eligible.slice(0, MAX_GRADES)

  let graded = 0
  for (let i = 0; i < toGrade.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS))
    const r = await gradeTrade(toGrade[i].id)
    if (r.graded_sides > 0) graded += 1
    warnings.push(...r.warnings)
  }

  // ── Graded trades → verdicts, four weeks after the trade's week ───────
  const { data: staleRows, error: staleErr } = await db
    .from('trades')
    .select('id, league_id, executed_at, seasons!inner(year, settings)')
    .eq('status', 'completed')
    .not('ai_summary', 'is', null)
    .is('revisited_at', null)
    .gte('seasons.year', FIRST_GRADED_SEASON)
    .order('executed_at', { ascending: true })
    .limit(MAX_REVISITS * 6)
  if (staleErr) warnings.push(`load revisit candidates: ${staleErr.message}`)

  const dueRows = (staleRows ?? []).filter((t) => {
    const season = Array.isArray(t.seasons) ? t.seasons[0] : t.seasons
    return !!season && verdictIsDue({
      year: season.year,
      executedAt: t.executed_at as string | null,
      seasonSettings: season.settings as Record<string, unknown> | null,
    })
  })

  const stale = await filterEligible(db, dueRows as TradeRow[])
  const toRevisit = stale.eligible.slice(0, MAX_REVISITS)

  let revisited = 0
  for (let i = 0; i < toRevisit.length; i++) {
    if (i > 0 || graded > 0) await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS))
    const r = await revisitTrade(toRevisit[i].id)
    if (r.graded_sides > 0) revisited += 1
    warnings.push(...r.warnings)
  }

  // ── Rank chips on every recent trade ──────────────────────────────────
  const ranksStamped = await stampTradeRanks(db, await loadRankTrades(db, { limit: MAX_RANK_TRADES }, warnings), warnings)

  return NextResponse.json({
    graded,
    gradeCandidates: fresh.eligible.length,
    revisited,
    revisitCandidates: stale.eligible.length,
    ranksStamped,
    warnings,
  })
}
