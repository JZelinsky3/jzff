// Rank chips on graded-season trades: one writer, one rule.
//
// Every player asset on a trade carries up to two position ranks:
//
//   rank_at_trade  where he sat in the points race when the deal was made
//   rank_now       where he sat when the four-week verdict came down
//
// The trade card shows the first alone. The verdict shows both and the
// move between them. That second chip used to be refreshed DAILY on every
// trade, so a deal made on Monday already showed "WR46 → WR33" by Tuesday,
// a verdict nobody had written. And both ranks read through the week being
// played, so a chip stamped on a Sunday afternoon counted half a slate.
//
// From FIRST_GRADED_SEASON on, this module is the only thing that writes
// either field (ingest stamps older seasons only), which keeps a sync and
// the cron from overwriting each other with slightly different numbers.
// Which weeks it reads through is decided in lib/positionRanks
// (tradeRankWeek, verdictRankWeek). Both use the league's own scoring,
// commissioner overrides included, so the two chips always compare like
// with like.
//
// Idempotent: the grade-trades cron runs it daily over recent trades,
// which is also how a backlog (or a rule change) gets backfilled.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  FIRST_GRADED_SEASON,
  ranksThroughWeek,
  stampRanks,
  tradeRankWeek,
  tradeRankWeekOver,
  verdictRankWeek,
  type PositionRanks,
} from '@/lib/positionRanks'
import { commishRulesFor, effectiveRules, scoringSettingsFor } from '@/lib/seasonRules'

type Db = ReturnType<typeof createAdminClient>
type Platform = 'sleeper' | 'espn' | 'yahoo' | 'nfl'
type Asset = Record<string, unknown>

export type RankTrade = {
  id: string
  platform: Platform
  year: number
  executedAt: string
  revisitedAt: string | null
  seasonStartDate: string | null
  scoring: Record<string, number>
}

type Row = {
  id: string
  platform: string | null
  executed_at: string | null
  revisited_at: string | null
  seasons: { year: number; settings: unknown } | { year: number; settings: unknown }[] | null
  leagues: { settings: unknown } | { settings: unknown }[] | null
}

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

export async function loadRankTrades(
  db: Db,
  filter: { tradeIds?: string[]; leagueId?: string; limit?: number },
  warnings: string[],
): Promise<RankTrade[]> {
  let q = db
    .from('trades')
    .select('id, platform, executed_at, revisited_at, seasons!inner(year, settings), leagues!inner(settings)')
    .eq('status', 'completed')
    .gte('seasons.year', FIRST_GRADED_SEASON)
    .order('executed_at', { ascending: false })
  if (filter.tradeIds) q = q.in('id', filter.tradeIds)
  if (filter.leagueId) q = q.eq('league_id', filter.leagueId)
  const { data, error } = await q.limit(filter.limit ?? 500)
  if (error) {
    warnings.push(`trade ranks: load trades: ${error.message}`)
    return []
  }
  const out: RankTrade[] = []
  for (const r of (data ?? []) as Row[]) {
    const season = one(r.seasons)
    if (!season || !r.executed_at) continue
    const settings = (season.settings ?? {}) as Record<string, unknown>
    const rules = effectiveRules(settings, commishRulesFor(one(r.leagues)?.settings, season.year))
    out.push({
      id: r.id,
      platform: (r.platform as Platform) ?? 'sleeper',
      year: season.year,
      executedAt: r.executed_at,
      revisitedAt: r.revisited_at,
      seasonStartDate: typeof settings.season_start_date === 'string' ? settings.season_start_date : null,
      scoring: scoringSettingsFor(rules.scoring),
    })
  }
  return out
}

function without(assets: Asset[], field: 'rank_at_trade' | 'rank_now'): Asset[] {
  return assets.map((a) => {
    if (!(field in a)) return a
    const rest = { ...a }
    delete rest[field]
    return rest
  })
}

// Stamp both chips on each trade's sides. Returns the number of sides
// rewritten. A rank source that fails or comes back empty leaves the
// stored chip alone rather than wiping it.
export async function stampTradeRanks(db: Db, trades: RankTrade[], warnings: string[]): Promise<number> {
  if (trades.length === 0) return 0
  const cache = new Map<string, Promise<PositionRanks | null>>()
  const ranksFor = (t: RankTrade, week: number) => {
    const key = `${t.year}:${week}:${JSON.stringify(t.scoring)}`
    let p = cache.get(key)
    if (!p) {
      p = ranksThroughWeek({ season: t.year, week, scoring: t.scoring })
        .then((m) => (m.size > 0 ? m : null))
        .catch((e) => {
          warnings.push(`trade ranks: ${t.year} week ${week}: ${e instanceof Error ? e.message : String(e)}`)
          return null
        })
      cache.set(key, p)
    }
    return p
  }

  const { data: sides, error } = await db
    .from('trade_sides')
    .select('id, trade_id, assets')
    .in('trade_id', trades.map((t) => t.id))
  if (error) {
    warnings.push(`trade ranks: load sides: ${error.message}`)
    return 0
  }
  const byTrade = new Map(trades.map((t) => [t.id, t]))

  let written = 0
  for (const s of sides ?? []) {
    const t = byTrade.get(s.trade_id as string)
    if (!t) continue
    const original = (s.assets as Asset[]) ?? []
    let assets = original

    // The rank at trade, once the week it reads through is finished. A
    // weekend trade has none until Tuesday, same as its grade.
    const atWeek = tradeRankWeek(t.year, t.executedAt, t.seasonStartDate)
    if (tradeRankWeekOver(t.year, atWeek, t.seasonStartDate)) {
      const ranks = await ranksFor(t, atWeek)
      if (ranks) assets = await stampRanks(without(assets, 'rank_at_trade'), { ranks, platform: t.platform, field: 'rank_at_trade' })
    }

    // The verdict's rank, only once there is a verdict. Before it, the
    // card carries one chip.
    const nowWeek = t.revisitedAt ? verdictRankWeek(t.year, atWeek, t.revisitedAt, t.seasonStartDate) : null
    if (nowWeek == null || nowWeek <= atWeek) {
      assets = without(assets, 'rank_now')
    } else {
      const ranks = await ranksFor(t, nowWeek)
      if (ranks) assets = await stampRanks(without(assets, 'rank_now'), { ranks, platform: t.platform, field: 'rank_now' })
    }

    if (JSON.stringify(assets) === JSON.stringify(original)) continue
    const { error: upErr } = await db.from('trade_sides').update({ assets }).eq('id', s.id)
    if (upErr) warnings.push(`trade ranks: side ${s.id}: ${upErr.message}`)
    else written++
  }
  return written
}
