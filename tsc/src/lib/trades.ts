// Trade Grader — data shape for the public trades page.
//
// Phase 2: pulls completed trades + sides + grades. Tier-gated: the league
// owner must have an active tier2+ subscription (or be a comp user) for
// trades data to be returned. T1 / no-sub / testing leagues get a tier-locked
// response that the page renders as an upgrade CTA.
//
// Sort buckets returned to the client:
//   • this_week  — trades from the most recent NFL week with any trade
//   • earlier    — every other historical trade
//   • verdict    — trades whose 4-week revisit just landed (revisited_at
//                  within the last 7 days). Empty until revisits run.
//
// See supabase/migrations/0022_trade_grader.sql.

import { createAdminClient } from '@/lib/supabase/admin'
import { isCompUser, isSubscriptionActive, getUserSubscription } from '@/lib/stripe'

const MAX_TRADES = 100
const VERDICT_WINDOW_DAYS = 7

export type TradeAsset =
  | { kind: 'player'; player_id: string; name: string | null; position: string | null; team: string | null }
  | { kind: 'pick'; season_year: number; round: number; original_owner_manager_id: string | null }
  | { kind: 'faab'; amount: number }

export type TradeSidePublic = {
  side_id: string
  manager: {
    id: string
    display_name: string
    team_name: string | null
    avatar_url: string | null
  }
  assets: TradeAsset[]
  grade: string | null
  blurb: string | null
  revisit_grade: string | null
  revisit_blurb: string | null
}

export type TradePublic = {
  id: string
  platform: string
  season_year: number
  week: number | null
  executed_at: string
  sides: TradeSidePublic[]
}

export type TradesState =
  | { status: 'no-league' }
  | { status: 'tier-locked'; league_id: string }
  | { status: 'no-trades'; league_id: string }
  | {
      status: 'ok'
      league_id: string
      this_week: TradePublic[]
      earlier: TradePublic[]
      verdict: TradePublic[]
    }

// Veteran-tier (or higher) is required to view this league's trades. The
// check runs against the LEAGUE OWNER's subscription, not the current
// viewer — readers don't pay; the commissioner does. Comp/lifetime users
// bypass the check.
async function ownerHasTradesAccess(ownerId: string): Promise<boolean> {
  if (await isCompUser(ownerId)) return true
  const sub = await getUserSubscription(ownerId)
  if (!isSubscriptionActive(sub) || !sub) return false
  return sub.tier === 'tier2' || sub.tier === 'tier3'
}

export async function getTradesState(slug: string): Promise<TradesState | null> {
  const db = createAdminClient()

  const { data: league } = await db
    .from('leagues')
    .select('id, owner_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) return null

  // Tier gate. Fails closed: anything but a confirmed tier2+ owner blocks
  // the response.
  if (!(await ownerHasTradesAccess(league.owner_id))) {
    return { status: 'tier-locked', league_id: league.id }
  }

  // Pull trades + season year in one query. Order newest first, cap at MAX_TRADES.
  const { data: tradeRows, error: tradesErr } = await db
    .from('trades')
    .select('id, platform, week, executed_at, seasons!inner(year)')
    .eq('league_id', league.id)
    .eq('status', 'completed')
    .order('executed_at', { ascending: false })
    .limit(MAX_TRADES)
  if (tradesErr) throw new Error(`trades query: ${tradesErr.message}`)

  if (!tradeRows || tradeRows.length === 0) {
    return { status: 'no-trades', league_id: league.id }
  }

  const tradeIds = tradeRows.map((t) => t.id)

  // Sides + nested manager — fetch in a single round-trip via the FK relationship.
  const { data: sideRows, error: sidesErr } = await db
    .from('trade_sides')
    .select('id, trade_id, assets, manager_id, managers!inner(id, display_name, team_name, avatar_url)')
    .in('trade_id', tradeIds)
  if (sidesErr) throw new Error(`trade_sides query: ${sidesErr.message}`)

  // Grades + revisit timestamps. The revisited_at column drives the "verdict"
  // bucket below.
  const sideIds = (sideRows ?? []).map((s) => s.id)
  const { data: gradeRows } = sideIds.length > 0
    ? await db
        .from('trade_grades')
        .select('trade_side_id, grade, blurb, revisit_grade, revisit_blurb, revisited_at')
        .in('trade_side_id', sideIds)
    : { data: [] }

  const gradeBySide = new Map<string, { grade: string | null; blurb: string | null; revisit_grade: string | null; revisit_blurb: string | null; revisited_at: string | null }>()
  for (const g of gradeRows ?? []) {
    gradeBySide.set(g.trade_side_id, {
      grade: g.grade ?? null,
      blurb: g.blurb ?? null,
      revisit_grade: g.revisit_grade ?? null,
      revisit_blurb: g.revisit_blurb ?? null,
      revisited_at: g.revisited_at ?? null,
    })
  }

  const sidesByTrade = new Map<string, TradeSidePublic[]>()
  // Track which trades just got their 4-week revisit so we can bucket them.
  const tradesWithRecentVerdict = new Set<string>()
  const verdictCutoff = Date.now() - VERDICT_WINDOW_DAYS * 24 * 60 * 60 * 1000

  for (const s of sideRows ?? []) {
    const grade = gradeBySide.get(s.id) ?? { grade: null, blurb: null, revisit_grade: null, revisit_blurb: null, revisited_at: null }
    if (grade.revisited_at && Date.parse(grade.revisited_at) >= verdictCutoff) {
      tradesWithRecentVerdict.add(s.trade_id)
    }
    // Supabase returns the embedded relation as an object (singular FK) or array
    // depending on the schema's inferred cardinality. Normalize defensively.
    const mgr = Array.isArray(s.managers) ? s.managers[0] : s.managers
    const side: TradeSidePublic = {
      side_id: s.id,
      manager: {
        id: mgr?.id ?? s.manager_id,
        display_name: mgr?.display_name ?? 'Unknown',
        team_name: mgr?.team_name ?? null,
        avatar_url: mgr?.avatar_url ?? null,
      },
      assets: (s.assets as TradeAsset[]) ?? [],
      grade: grade.grade,
      blurb: grade.blurb,
      revisit_grade: grade.revisit_grade,
      revisit_blurb: grade.revisit_blurb,
    }
    const list = sidesByTrade.get(s.trade_id) ?? []
    list.push(side)
    sidesByTrade.set(s.trade_id, list)
  }

  const allTrades: TradePublic[] = tradeRows.map((t) => {
    const season = Array.isArray(t.seasons) ? t.seasons[0] : t.seasons
    return {
      id: t.id,
      platform: t.platform,
      season_year: season?.year ?? 0,
      week: t.week,
      executed_at: t.executed_at,
      sides: sidesByTrade.get(t.id) ?? [],
    }
  })

  // ── Bucket into This Week / Earlier / Verdict ─────────────────────────
  // "This week" = trades from the most recent NFL week with at least one
  // trade. A bare date cutoff would mis-categorize trades that happened
  // late Tuesday vs. early the next Monday — using the league week is more
  // semantically aligned with what users mean by "this week."
  const verdict = allTrades.filter((t) => tradesWithRecentVerdict.has(t.id))
  const nonVerdict = allTrades.filter((t) => !tradesWithRecentVerdict.has(t.id))

  const currentYear = nonVerdict[0]?.season_year ?? null
  let thisWeekKey: string | null = null
  if (currentYear != null) {
    const currentSeasonTrades = nonVerdict.filter((t) => t.season_year === currentYear && t.week != null)
    if (currentSeasonTrades.length > 0) {
      thisWeekKey = `${currentYear}-${currentSeasonTrades[0].week}`
    }
  }

  const this_week = thisWeekKey
    ? nonVerdict.filter((t) => `${t.season_year}-${t.week}` === thisWeekKey)
    : []
  const earlier = nonVerdict.filter((t) => `${t.season_year}-${t.week}` !== thisWeekKey)

  return { status: 'ok', league_id: league.id, this_week, earlier, verdict }
}
