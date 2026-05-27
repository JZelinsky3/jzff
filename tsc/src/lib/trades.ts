// Trade Grader — data shape for the public trades page.
//
// Phase 1: pulls completed trades + sides + manager info. Grades are not yet
// generated (Phase 2 wires the LLM call), so every side returns grade=null.
// See supabase/migrations/0022_trade_grader.sql.
//
// We don't gate on a "live season" here — the trades page shows historical
// trades alongside current ones, organized newest-first. Limit kept low so
// the response stays small on long-history leagues; pagination can land later
// if any league actually trades more than this in a season.

import { createAdminClient } from '@/lib/supabase/admin'

const MAX_TRADES = 100

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
  | { status: 'no-trades'; league_id: string }
  | { status: 'ok'; league_id: string; trades: TradePublic[] }

export async function getTradesState(slug: string): Promise<TradesState | null> {
  const db = createAdminClient()

  const { data: league } = await db
    .from('leagues')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) return null

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

  // Grades will populate in Phase 2. Fetch the table anyway so the UI shape
  // is stable now and the swap to "show grades" is a no-op on this side.
  const sideIds = (sideRows ?? []).map((s) => s.id)
  const { data: gradeRows } = sideIds.length > 0
    ? await db
        .from('trade_grades')
        .select('trade_side_id, grade, blurb, revisit_grade, revisit_blurb')
        .in('trade_side_id', sideIds)
    : { data: [] }

  const gradeBySide = new Map<string, { grade: string | null; blurb: string | null; revisit_grade: string | null; revisit_blurb: string | null }>()
  for (const g of gradeRows ?? []) {
    gradeBySide.set(g.trade_side_id, {
      grade: g.grade ?? null,
      blurb: g.blurb ?? null,
      revisit_grade: g.revisit_grade ?? null,
      revisit_blurb: g.revisit_blurb ?? null,
    })
  }

  const sidesByTrade = new Map<string, TradeSidePublic[]>()
  for (const s of sideRows ?? []) {
    const grade = gradeBySide.get(s.id) ?? { grade: null, blurb: null, revisit_grade: null, revisit_blurb: null }
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
      ...grade,
    }
    const list = sidesByTrade.get(s.trade_id) ?? []
    list.push(side)
    sidesByTrade.set(s.trade_id, list)
  }

  const trades: TradePublic[] = tradeRows.map((t) => {
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

  return { status: 'ok', league_id: league.id, trades }
}
