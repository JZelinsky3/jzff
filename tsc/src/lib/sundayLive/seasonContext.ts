// Season context for the storyline engine.
//
// Everything the producer voice needs that ISN'T in the live frame: all-time
// head-to-head records, this season's form and streaks, power rankings,
// trades and recent transactions, and season position ranks. Loaded once per
// (league, year, week) and cached 10 minutes; the poll path reads it through
// the cache so a warm poll costs nothing.
//
// Shapes are plain JSON (no Maps): unstable_cache round-trips through the
// data cache.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { sleeper, type SleeperTransaction } from '@/lib/platforms/sleeper'
import { getPlayersMap } from '@/lib/sleeperPlayers'
import { getPowerRankings } from '@/lib/powerRankings'
import { computePositionRanks } from '@/lib/positionRanks'
import type { SlLeague } from './types'

export type H2hRecord = {
  aWins: number // wins for the lexically-smaller manager id in the pair key
  bWins: number
  ties: number
  last: { year: number; week: number; scoreA: number; scoreB: number; isPlayoff: boolean } | null
}

export type SeasonForm = {
  wins: number
  losses: number
  ties: number
  pf: number
  pa: number
  // "W3" / "L2" / null through the completed weeks before the live week.
  streak: string | null
  weeklyScores: number[]
  // Chronological W/L/T per completed week, parallel to weeklyScores.
  results: Array<'W' | 'L' | 'T'>
  seasonHigh: number
}

export type SlSeasonContext = {
  year: number
  throughWeek: number // completed weeks considered (live week - 1)
  // Platform owner id -> manager identity.
  managers: Record<string, { managerId: string; displayName: string }>
  // Pair key `${minManagerId}|${maxManagerId}` -> all-time record.
  h2h: Record<string, H2hRecord>
  // managerId -> this season's form through the completed weeks.
  season: Record<string, SeasonForm>
  leagueSeasonHigh: { score: number; managerId: string | null; week: number | null }
  careerHigh: Record<string, number> // managerId -> best single-week score ever
  // managerId -> current power rank (1-based) and rank delta.
  power: Record<string, { rank: number; delta: number; total: number }>
  // This season's trades: playerId moves between roster ids.
  trades: Array<{
    week: number | null
    executedAt: string
    adds: Record<string, number>  // playerId -> receiving roster_id
    drops: Record<string, number> // playerId -> losing roster_id
    rosterIds: number[]
  }>
  // Recent waiver/FA moves (last ~4 weeks incl. live week).
  moves: Array<{
    type: string
    week: number
    adds: Record<string, number> | null
    drops: Record<string, number> | null
  }>
  // playerId -> "RB12" season-to-date rank under this league's scoring.
  positionRanks: Record<string, string>
  // Names for player ids referenced by trades/moves (may not be in the frame).
  playerNames: Record<string, string>
}

function streakOf(results: Array<'W' | 'L' | 'T'>): string | null {
  if (results.length === 0) return null
  const last = results[results.length - 1]
  if (last === 'T') return null
  let n = 0
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++
  return n >= 2 ? `${last}${n}` : null
}

async function loadSeasonContextRaw(
  leagueId: string,
  slug: string,
  platform: string,
  externalLeagueId: string,
  year: number,
  liveWeek: number,
): Promise<SlSeasonContext> {
  const db = createAdminClient()
  const throughWeek = Math.max(0, liveWeek - 1)

  const [managersRes, matchupRes, seasonRowRes] = await Promise.all([
    db.from('managers').select('id, external_id, display_name').eq('league_id', leagueId),
    db
      .from('matchups')
      .select('week, manager_a_id, manager_b_id, score_a, score_b, is_playoff, seasons!inner(league_id, year)')
      .eq('seasons.league_id', leagueId),
    db.from('seasons').select('id').eq('league_id', leagueId).eq('year', year).maybeSingle(),
  ])

  const managers: SlSeasonContext['managers'] = {}
  for (const m of managersRes.data ?? []) {
    if (m.external_id) {
      managers[m.external_id as string] = {
        managerId: m.id as string,
        displayName: (m.display_name as string) ?? 'Unknown',
      }
    }
  }

  type MatchupRow = {
    week: number
    manager_a_id: string | null
    manager_b_id: string | null
    score_a: number
    score_b: number
    is_playoff: boolean
    seasons: { league_id: string; year: number }
  }
  const rows = (matchupRes.data ?? []) as unknown as MatchupRow[]

  // All-time head-to-head, excluding the live week and future demo weeks.
  const inScope = rows.filter(
    (r) => r.seasons.year < year || (r.seasons.year === year && r.week <= throughWeek),
  )

  const h2h: SlSeasonContext['h2h'] = {}
  for (const r of inScope) {
    if (!r.manager_a_id || !r.manager_b_id) continue
    const [lo, hi] =
      r.manager_a_id < r.manager_b_id
        ? [r.manager_a_id, r.manager_b_id]
        : [r.manager_b_id, r.manager_a_id]
    const key = `${lo}|${hi}`
    const rec = (h2h[key] ??= { aWins: 0, bWins: 0, ties: 0, last: null })
    const loScore = r.manager_a_id === lo ? r.score_a : r.score_b
    const hiScore = r.manager_a_id === lo ? r.score_b : r.score_a
    if (loScore > hiScore) rec.aWins++
    else if (hiScore > loScore) rec.bWins++
    else rec.ties++
    const prev = rec.last
    if (!prev || r.seasons.year > prev.year || (r.seasons.year === prev.year && r.week > prev.week)) {
      rec.last = { year: r.seasons.year, week: r.week, scoreA: loScore, scoreB: hiScore, isPlayoff: r.is_playoff }
    }
  }

  // This season's form + career highs.
  const season: SlSeasonContext['season'] = {}
  const careerHigh: SlSeasonContext['careerHigh'] = {}
  const leagueSeasonHigh: SlSeasonContext['leagueSeasonHigh'] = { score: 0, managerId: null, week: null }
  const resultsByManager: Record<string, Array<{ week: number; res: 'W' | 'L' | 'T'; pf: number; pa: number }>> = {}

  for (const r of inScope) {
    for (const [mid, mine, theirs] of [
      [r.manager_a_id, r.score_a, r.score_b],
      [r.manager_b_id, r.score_b, r.score_a],
    ] as Array<[string | null, number, number]>) {
      if (!mid) continue
      careerHigh[mid] = Math.max(careerHigh[mid] ?? 0, mine)
      if (r.seasons.year !== year) continue
      const res: 'W' | 'L' | 'T' = mine > theirs ? 'W' : mine < theirs ? 'L' : 'T'
      ;(resultsByManager[mid] ??= []).push({ week: r.week, res, pf: mine, pa: theirs })
      if (mine > leagueSeasonHigh.score) {
        leagueSeasonHigh.score = mine
        leagueSeasonHigh.managerId = mid
        leagueSeasonHigh.week = r.week
      }
    }
  }
  for (const [mid, list] of Object.entries(resultsByManager)) {
    list.sort((a, b) => a.week - b.week)
    season[mid] = {
      wins: list.filter((x) => x.res === 'W').length,
      losses: list.filter((x) => x.res === 'L').length,
      ties: list.filter((x) => x.res === 'T').length,
      pf: Math.round(list.reduce((s, x) => s + x.pf, 0) * 10) / 10,
      pa: Math.round(list.reduce((s, x) => s + x.pa, 0) * 10) / 10,
      streak: streakOf(list.map((x) => x.res)),
      weeklyScores: list.map((x) => x.pf),
      results: list.map((x) => x.res),
      seasonHigh: Math.max(0, ...list.map((x) => x.pf)),
    }
  }

  // Power rankings (manager-keyed). Best effort.
  const power: SlSeasonContext['power'] = {}
  try {
    const pr = await getPowerRankings(slug)
    if (pr && pr.status === 'ok' && pr.weeks.length > 0) {
      const latest = pr.weeks[pr.weeks.length - 1]
      for (const t of latest.overall) {
        power[t.team_id] = { rank: t.rank, delta: t.delta, total: latest.overall.length }
      }
    }
  } catch {
    // storylines simply skip power rules
  }

  // Trades this season + recent moves (Sleeper only for now).
  const trades: SlSeasonContext['trades'] = []
  const moves: SlSeasonContext['moves'] = []
  const nameIds = new Set<string>()

  if (platform === 'sleeper' && seasonRowRes.data?.id) {
    const { data: tradeRows } = await db
      .from('trades')
      .select('week, executed_at, raw_payload')
      .eq('season_id', seasonRowRes.data.id as string)
      .eq('status', 'completed')
    for (const t of tradeRows ?? []) {
      const raw = (t.raw_payload ?? {}) as { adds?: Record<string, number>; drops?: Record<string, number>; roster_ids?: number[] }
      const adds = raw.adds ?? {}
      const drops = raw.drops ?? {}
      trades.push({
        week: (t.week as number | null) ?? null,
        executedAt: (t.executed_at as string) ?? '',
        adds,
        drops,
        rosterIds: raw.roster_ids ?? [],
      })
      for (const pid of [...Object.keys(adds), ...Object.keys(drops)]) nameIds.add(pid)
    }

    const weeks: number[] = []
    for (let w = Math.max(1, liveWeek - 4); w <= liveWeek; w++) weeks.push(w)
    const txLists = await Promise.all(
      weeks.map((w) => sleeper.transactions(externalLeagueId, w).catch(() => null)),
    )
    for (let i = 0; i < weeks.length; i++) {
      for (const tx of (txLists[i] ?? []) as SleeperTransaction[]) {
        if (tx.status !== 'complete') continue
        if (tx.type !== 'waiver' && tx.type !== 'free_agent') continue
        moves.push({ type: tx.type, week: weeks[i], adds: tx.adds, drops: tx.drops })
        for (const pid of [...Object.keys(tx.adds ?? {}), ...Object.keys(tx.drops ?? {})]) nameIds.add(pid)
      }
    }
  }

  // Names for every player id the transaction rules might mention.
  const playerNames: SlSeasonContext['playerNames'] = {}
  if (nameIds.size > 0) {
    try {
      const playersMap = await getPlayersMap()
      for (const pid of nameIds) {
        const p = playersMap[pid]
        if (p?.name) playerNames[pid] = p.name
      }
    } catch {
      // names fall back to "a player" in copy
    }
  }

  // Season position ranks under this league's scoring (Sleeper only), with
  // its own long cache since it only changes weekly.
  let positionRanks: SlSeasonContext['positionRanks'] = {}
  if (platform === 'sleeper' && throughWeek >= 1) {
    try {
      positionRanks = await cachedPositionRanks(externalLeagueId, year, throughWeek)
    } catch {
      // rank-overtake rule simply skips
    }
  }

  return {
    year,
    throughWeek,
    managers,
    h2h,
    season,
    leagueSeasonHigh,
    careerHigh,
    power,
    trades,
    moves,
    positionRanks,
    playerNames,
  }
}

async function positionRanksRaw(
  externalLeagueId: string,
  year: number,
  throughWeek: number,
): Promise<Record<string, string>> {
  const lg = (await sleeper.league(externalLeagueId)) as unknown as {
    scoring_settings?: Record<string, number>
  } | null
  const ranks = await computePositionRanks({
    season: year,
    throughWeek,
    scoring: lg?.scoring_settings ?? {},
  })
  return Object.fromEntries(ranks)
}

function cachedPositionRanks(externalLeagueId: string, year: number, throughWeek: number) {
  return unstable_cache(
    () => positionRanksRaw(externalLeagueId, year, throughWeek),
    ['sl-position-ranks', externalLeagueId, String(year), String(throughWeek)],
    { revalidate: 21_600, tags: ['sl-position-ranks'] },
  )()
}

export function getSeasonContext(
  leagueId: string,
  slug: string,
  platform: string,
  externalLeagueId: string,
  year: number,
  liveWeek: number,
): Promise<SlSeasonContext> {
  return unstable_cache(
    () => loadSeasonContextRaw(leagueId, slug, platform, externalLeagueId, year, liveWeek),
    // v2: bump when SlSeasonContext grows a field, or cached entries from the
    // old shape serve without it until they expire.
    ['sl-season-context', 'v2', leagueId, String(year), String(liveWeek)],
    { revalidate: 600, tags: [`sl-season-context-${leagueId}`] },
  )()
}

// ── Week context (client-facing, per matchup) ────────────────────────────────
// Built once in page.tsx from the context + first frame; passed as a prop so
// it never rides the poll payload.

// Last-five form: record over the stretch, scoring pace across it, and the
// week-by-week results (oldest first) so the client can draw the pill strip.
export type SlSideForm = { rec: string; ppg: number; results: Array<'W' | 'L' | 'T'> }

export type SlWeekMatchupContext = {
  h2h: {
    aWins: number
    bWins: number
    ties: number
    // Winner is from side A's perspective so the client can name them.
    // margin is the final gap in points (0 on a tie).
    last: { year: number; week: number; winner: 'A' | 'B' | 'T'; margin: number } | null
  } | null
  streakA: string | null
  streakB: string | null
  powerA: number | null
  powerB: number | null
  recordA: string | null
  recordB: string | null
  formA: SlSideForm | null
  formB: SlSideForm | null
  // Season points-for, the standings tiebreaker (scenario machine).
  pfA: number | null
  pfB: number | null
}

export type SlWeekContext = { matchups: Record<number, SlWeekMatchupContext> }

// Last five completed weeks: "3-2" and points per game across them.
// results may be absent on a stale cached context; return null and let the
// client fall back gracefully.
function lastFive(form: SeasonForm | undefined): SlSideForm | null {
  const results = form?.results ?? []
  if (!form || results.length === 0) return null
  const span = results.slice(-5)
  const scores = form.weeklyScores.slice(-span.length)
  const w = span.filter((x) => x === 'W').length
  const l = span.filter((x) => x === 'L').length
  const t = span.filter((x) => x === 'T').length
  const ppg = Math.round((scores.reduce((s, x) => s + x, 0) / Math.max(1, scores.length)) * 10) / 10
  return { rec: `${w}-${l}${t ? `-${t}` : ''}`, ppg, results: span }
}

export function buildWeekContext(frame: SlLeague, ctx: SlSeasonContext): SlWeekContext {
  const out: SlWeekContext = { matchups: {} }
  for (const m of frame.matchups) {
    const ma = m.a.ownerId ? ctx.managers[m.a.ownerId] : undefined
    const mb = m.b.ownerId ? ctx.managers[m.b.ownerId] : undefined
    let h2hOut: SlWeekMatchupContext['h2h'] = null
    if (ma && mb) {
      const [lo, hi] = ma.managerId < mb.managerId ? [ma, mb] : [mb, ma]
      const rec = ctx.h2h[`${lo.managerId}|${hi.managerId}`]
      if (rec) {
        // Re-orient to side A's perspective.
        const aIsLo = ma.managerId === lo.managerId
        const aWins = aIsLo ? rec.aWins : rec.bWins
        const bWins = aIsLo ? rec.bWins : rec.aWins
        const last = rec.last
          ? {
              year: rec.last.year,
              week: rec.last.week,
              winner:
                rec.last.scoreA === rec.last.scoreB
                  ? ('T' as const)
                  : (rec.last.scoreA > rec.last.scoreB) === aIsLo
                    ? ('A' as const)
                    : ('B' as const),
              margin: Math.round(Math.abs(rec.last.scoreA - rec.last.scoreB) * 10) / 10,
            }
          : null
        h2hOut = { aWins, bWins, ties: rec.ties, last }
      }
    }
    const formA = ma ? ctx.season[ma.managerId] : undefined
    const formB = mb ? ctx.season[mb.managerId] : undefined
    const powA = ma ? ctx.power[ma.managerId] : undefined
    const powB = mb ? ctx.power[mb.managerId] : undefined
    out.matchups[m.matchupId] = {
      h2h: h2hOut,
      streakA: formA?.streak ?? null,
      streakB: formB?.streak ?? null,
      powerA: powA?.rank ?? null,
      powerB: powB?.rank ?? null,
      recordA: formA ? `${formA.wins}-${formA.losses}${formA.ties ? `-${formA.ties}` : ''}` : null,
      recordB: formB ? `${formB.wins}-${formB.losses}${formB.ties ? `-${formB.ties}` : ''}` : null,
      formA: lastFive(formA),
      formB: lastFive(formB),
      pfA: formA?.pf ?? null,
      pfB: formB?.pf ?? null,
    }
  }
  return out
}
