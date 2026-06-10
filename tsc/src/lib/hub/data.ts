// Clubhouse data layer — site-wide aggregates that power /hub.
//
// Three cached readers, each with its own concern + cache key:
//
//   getHubCensus()  — anonymous totals across EVERY synced league (points,
//                     wins, picks, trades…) plus the derived "Network DNA".
//                     Safe to include private leagues because nothing here
//                     names a league, manager, or team.
//   getHubHall()    — site-wide record holders WITH names. Restricted to
//                     published leagues only — if a commissioner hasn't
//                     flipped their almanac public, their managers never
//                     appear on the Hall wall.
//   getHubShelves() — the Newsstand directory: recently published + most
//                     bookmarked almanacs.
//
// All three run on the admin client (full-table aggregation can't work
// under per-league RLS) and are wrapped in unstable_cache so the scans run
// at most once an hour per build, not per request. Mutating flows that
// should bust these can revalidateTag('hub-data').

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseSettings } from '@/lib/tradeDesk/settings'

const PAGE = 1000
// Hard ceiling on paginated scans so a future 10k-league TSC doesn't make
// the hourly refresh walk millions of rows. At the cap the totals become
// "at least" numbers, which is fine for a stats wall.
const MAX_ROWS = 200_000

type AdminClient = ReturnType<typeof createAdminClient>

// ── Paginated fetch helper ──────────────────────────────────────────────
// PostgREST aggregates aren't enabled on this project, so sums/maxes are
// computed in JS over paged selects. Fine at current scale; capped above.
async function fetchAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

async function countRows(admin: AdminClient, table: string): Promise<number> {
  const { count } = await admin.from(table).select('id', { count: 'exact', head: true })
  return count ?? 0
}

// `in()` filters take a finite list; chunk so a directory of hundreds of
// leagues doesn't build an over-long querystring.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ════════════════════════════════════════════════════════════════════════
// CENSUS — anonymous network totals + Network DNA
// ════════════════════════════════════════════════════════════════════════

export type HubDnaTrait = {
  key: string
  label: string
  /** Short reading, e.g. "232.6 pts / game" */
  reading: string
  /** One-line explanation of what was measured */
  detail: string
  /** 0–100 gauge position */
  pct: number
}

export type HubCensus = {
  generatedAt: string
  leagues: number
  publishedLeagues: number
  seasons: number
  managers: number
  /** Games on file with final scores */
  games: number
  playoffGames: number
  championshipGames: number
  draftPicks: number
  trades: number
  /** weekly_lineups rows — every (player, week, lineup slot) we track */
  playerWeeks: number
  championships: number
  earliestYear: number | null
  latestYear: number | null
  totalPoints: number
  totalWins: number
  totalLosses: number
  totalTies: number
  avgGameTotal: number | null
  avgMargin: number | null
  /** % of games decided by 40+ */
  blowoutPct: number | null
  /** % of games decided by under 3 */
  photoFinishPct: number | null
  /** Highest combined score of any game on file (anonymous) */
  highestGameTotal: number | null
  dna: { archetype: string; blurb: string; traits: HubDnaTrait[] }
}

async function computeCensus(): Promise<HubCensus> {
  const admin = createAdminClient()

  const [leagues, managers, draftPicks, trades, playerWeeks] = await Promise.all([
    countRows(admin, 'leagues'),
    countRows(admin, 'managers'),
    countRows(admin, 'draft_picks'),
    countRows(admin, 'trades'),
    countRows(admin, 'weekly_lineups'),
  ])

  const { count: publishedLeagues } = await admin
    .from('leagues')
    .select('id', { count: 'exact', head: true })
    .not('published_at', 'is', null)

  const seasonRows = await fetchAll<{ year: number; champion_manager_id: string | null }>(
    (from, to) => admin.from('seasons').select('year, champion_manager_id').range(from, to)
  )
  const years = seasonRows.map((s) => s.year).filter((y) => y > 1990)
  const championships = seasonRows.filter((s) => s.champion_manager_id).length

  const standingRows = await fetchAll<{ wins: number; losses: number; ties: number; points_for: number }>(
    (from, to) => admin.from('manager_seasons').select('wins, losses, ties, points_for').range(from, to)
  )
  let totalPoints = 0, totalWins = 0, totalLosses = 0, totalTies = 0
  for (const r of standingRows) {
    totalPoints += Number(r.points_for) || 0
    totalWins += r.wins || 0
    totalLosses += r.losses || 0
    totalTies += r.ties || 0
  }

  const gameRows = await fetchAll<{
    score_a: number | null; score_b: number | null; is_playoff: boolean; is_championship: boolean
  }>((from, to) =>
    admin
      .from('matchups')
      .select('score_a, score_b, is_playoff, is_championship')
      .not('score_a', 'is', null)
      .not('score_b', 'is', null)
      .range(from, to)
  )

  let games = 0, playoffGames = 0, championshipGames = 0
  let sumTotal = 0, sumMargin = 0, blowouts = 0, photoFinishes = 0
  let highestGameTotal: number | null = null
  for (const g of gameRows) {
    const a = Number(g.score_a), b = Number(g.score_b)
    // Skip 0–0 rows: scheduled-but-unplayed weeks some platforms emit
    if (!(a > 0 || b > 0)) continue
    games++
    if (g.is_playoff) playoffGames++
    if (g.is_championship) championshipGames++
    const total = a + b
    const margin = Math.abs(a - b)
    sumTotal += total
    sumMargin += margin
    if (margin >= 40) blowouts++
    if (margin > 0 && margin < 3) photoFinishes++
    if (highestGameTotal === null || total > highestGameTotal) highestGameTotal = total
  }

  const avgGameTotal = games > 0 ? sumTotal / games : null
  const avgMargin = games > 0 ? sumMargin / games : null
  const blowoutPct = games > 0 ? (blowouts / games) * 100 : null
  const photoFinishPct = games > 0 ? (photoFinishes / games) * 100 : null

  // ── Network DNA ──
  // Same idea as Manager DNA, one level up: distill the whole network's
  // tendencies into gauges + an archetype. Scales are tuned so a typical
  // PPR league sits mid-gauge.
  const gauge = (v: number, lo: number, hi: number) =>
    Math.max(2, Math.min(100, Math.round(((v - lo) / (hi - lo)) * 100)))

  const tradesPerSeason = seasonRows.length > 0 ? trades / seasonRows.length : 0
  const seasonsPerLeague = leagues > 0 ? seasonRows.length / leagues : 0

  const traits: HubDnaTrait[] = [
    {
      key: 'firepower',
      label: 'Firepower',
      reading: avgGameTotal !== null ? `${avgGameTotal.toFixed(1)} pts / game` : '—',
      detail: 'Average combined score of every game on file.',
      pct: avgGameTotal !== null ? gauge(avgGameTotal, 150, 290) : 0,
    },
    {
      key: 'carnage',
      label: 'Carnage',
      reading: blowoutPct !== null ? `${blowoutPct.toFixed(1)}% blowouts` : '—',
      detail: 'Share of games decided by 40 or more.',
      pct: blowoutPct !== null ? gauge(blowoutPct, 0, 30) : 0,
    },
    {
      key: 'drama',
      label: 'Drama',
      reading: photoFinishPct !== null ? `${photoFinishPct.toFixed(1)}% photo finishes` : '—',
      detail: 'Share of games decided by fewer than 3.',
      pct: photoFinishPct !== null ? gauge(photoFinishPct, 0, 12) : 0,
    },
    {
      key: 'churn',
      label: 'Wheeling & dealing',
      reading: `${tradesPerSeason.toFixed(1)} trades / season`,
      detail: 'Executed trades per league-season on file.',
      pct: gauge(tradesPerSeason, 0, 12),
    },
    {
      key: 'roots',
      label: 'Deep roots',
      reading: `${seasonsPerLeague.toFixed(1)} seasons / league`,
      detail: 'How far back the average archive reaches.',
      pct: gauge(seasonsPerLeague, 1, 10),
    },
  ]

  const lead = [...traits].sort((x, y) => y.pct - x.pct)[0]
  const archetypes: Record<string, { name: string; blurb: string }> = {
    firepower: { name: 'The Shootout Circuit', blurb: 'Scoreboards run hot here. Defense is a rumor.' },
    carnage: { name: 'The Hammer Network', blurb: 'Mercy is in short supply — games get decided early and loudly.' },
    drama: { name: 'The Photo-Finish Club', blurb: 'Monday nights matter here. Margins run razor thin.' },
    churn: { name: 'The Trading Floor', blurb: 'Rosters never sit still — the phones are always ringing.' },
    roots: { name: 'The Old Guard', blurb: 'These archives run deep. Grudges here have anniversaries.' },
  }
  const arch = archetypes[lead?.key ?? 'roots'] ?? archetypes.roots

  return {
    generatedAt: new Date().toISOString(),
    leagues,
    publishedLeagues: publishedLeagues ?? 0,
    seasons: seasonRows.length,
    managers,
    games,
    playoffGames,
    championshipGames,
    draftPicks,
    trades,
    playerWeeks,
    championships,
    earliestYear: years.length ? Math.min(...years) : null,
    latestYear: years.length ? Math.max(...years) : null,
    totalPoints: Math.round(totalPoints * 100) / 100,
    totalWins,
    totalLosses,
    totalTies,
    avgGameTotal,
    avgMargin,
    blowoutPct,
    photoFinishPct,
    highestGameTotal,
    dna: { archetype: arch.name, blurb: arch.blurb, traits },
  }
}

export const getHubCensus = unstable_cache(computeCensus, ['hub-census-v1'], {
  revalidate: 3600,
  tags: ['hub-data'],
})

// ════════════════════════════════════════════════════════════════════════
// HALL — site-wide record holders (published leagues only)
// ════════════════════════════════════════════════════════════════════════

export type HubRecord = {
  id: string
  title: string
  /** Big display value, e.g. "218.44" */
  value: string
  /** Unit/suffix rendered small next to the value */
  unit: string
  holder: string
  team: string | null
  league: string
  leagueSlug: string
  detail: string
}

export type HubHallSplit = {
  key: string
  /** Filter dimension, e.g. 'Format' | 'Platform' | 'League size' */
  group: string
  label: string
  leagues: number
  seasons: number
  records: HubRecord[]
}

export type HubHall = {
  records: HubRecord[]
  /** One-lens-at-a-time record walls: by format, platform, league size */
  splits: HubHallSplit[]
  sourceLeagues: number
  sourceSeasons: number
  generatedAt: string
}

type SeasonMeta = { id: string; league_id: string; year: number; champion_manager_id: string | null }
type ManagerMeta = { id: string; league_id: string; display_name: string; team_name: string | null }

async function computeHall(): Promise<HubHall> {
  const admin = createAdminClient()

  const { data: leagueRows } = await admin
    .from('leagues')
    .select('id, name, slug, league_type, draft_scoring_profile, trade_desk_settings')
    .not('published_at', 'is', null)
  const leagues = leagueRows ?? []
  if (leagues.length === 0) {
    return { records: [], splits: [], sourceLeagues: 0, sourceSeasons: 0, generatedAt: new Date().toISOString() }
  }
  const leagueById = new Map(leagues.map((l) => [l.id as string, l]))
  const leagueIds = leagues.map((l) => l.id as string)

  const seasons: SeasonMeta[] = []
  const managers: ManagerMeta[] = []
  for (const ids of chunk(leagueIds, 100)) {
    seasons.push(
      ...(await fetchAll<SeasonMeta>((from, to) =>
        admin.from('seasons').select('id, league_id, year, champion_manager_id').in('league_id', ids).range(from, to)
      ))
    )
    managers.push(
      ...(await fetchAll<ManagerMeta>((from, to) =>
        admin.from('managers').select('id, league_id, display_name, team_name').in('league_id', ids).range(from, to)
      ))
    )
  }
  const seasonById = new Map(seasons.map((s) => [s.id, s]))
  const managerById = new Map(managers.map((m) => [m.id, m]))
  const seasonIds = seasons.map((s) => s.id)

  type StandingRow = {
    season_id: string; manager_id: string; team_name: string | null
    wins: number; losses: number; ties: number; points_for: number
  }
  const standings: StandingRow[] = []
  for (const ids of chunk(seasonIds, 100)) {
    standings.push(
      ...(await fetchAll<StandingRow>((from, to) =>
        admin
          .from('manager_seasons')
          .select('season_id, manager_id, team_name, wins, losses, ties, points_for')
          .in('season_id', ids)
          .range(from, to)
      ))
    )
  }

  type GameRow = {
    season_id: string; week: number
    manager_a_id: string; manager_b_id: string
    score_a: number | null; score_b: number | null
    is_playoff: boolean; is_championship: boolean
  }
  const allGames: GameRow[] = []
  for (const ids of chunk(seasonIds, 100)) {
    allGames.push(
      ...(await fetchAll<GameRow>((from, to) =>
        admin
          .from('matchups')
          .select('season_id, week, manager_a_id, manager_b_id, score_a, score_b, is_playoff, is_championship')
          .in('season_id', ids)
          .not('score_a', 'is', null)
          .not('score_b', 'is', null)
          .range(from, to)
      ))
    )
  }

  // Helpers to label a record holder. Team name preference: the team name
  // the manager used THAT season (manager_seasons), falling back to their
  // current managers.team_name.
  const seasonTeamName = new Map<string, string>()
  for (const r of standings) {
    if (r.team_name) seasonTeamName.set(`${r.season_id}:${r.manager_id}`, r.team_name)
  }
  const holderOf = (managerId: string, seasonId?: string) => {
    const m = managerById.get(managerId)
    const team = (seasonId && seasonTeamName.get(`${seasonId}:${managerId}`)) || m?.team_name || null
    return { holder: m?.display_name ?? 'Unknown manager', team }
  }
  const leagueOf = (seasonId: string) => {
    const s = seasonById.get(seasonId)
    const l = s ? leagueById.get(s.league_id) : undefined
    return { league: l?.name ?? 'Unknown league', leagueSlug: l?.slug ?? '', year: s?.year ?? 0 }
  }
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // One record-wall build, optionally restricted to a set of league ids.
  // The full Hall passes null; the split walls (1QB vs superflex, per
  // platform, per league size) pass their bucket.
  const buildRecords = (leagueFilter: Set<string> | null): HubRecord[] => {
    const inScope = (seasonId: string) => {
      if (!leagueFilter) return true
      const s = seasonById.get(seasonId)
      return !!s && leagueFilter.has(s.league_id)
    }
    const games = leagueFilter ? allGames.filter((g) => inScope(g.season_id)) : allGames
    const scopedStandings = leagueFilter ? standings.filter((r) => inScope(r.season_id)) : standings
    const scopedSeasons = leagueFilter ? seasons.filter((s) => leagueFilter.has(s.league_id)) : seasons

    const records: HubRecord[] = []

    // ── Single-game records ──
    let topWeek: { score: number; managerId: string; g: GameRow } | null = null
    let blowout: { margin: number; managerId: string; g: GameRow } | null = null
    let closest: { margin: number; managerId: string; g: GameRow } | null = null
    let shootout: { total: number; g: GameRow } | null = null
    let heartbreak: { score: number; managerId: string; g: GameRow } | null = null
    let stingiestWin: { score: number; managerId: string; g: GameRow } | null = null

    for (const g of games) {
      const a = Number(g.score_a), b = Number(g.score_b)
      if (!(a > 0 || b > 0)) continue
      const hi = Math.max(a, b), lo = Math.min(a, b)
      const hiId = a >= b ? g.manager_a_id : g.manager_b_id
      const loId = a >= b ? g.manager_b_id : g.manager_a_id
      const margin = hi - lo

      if (!topWeek || hi > topWeek.score) topWeek = { score: hi, managerId: hiId, g }
      if (margin > 0 && (!blowout || margin > blowout.margin)) blowout = { margin, managerId: hiId, g }
      if (margin > 0 && (!closest || margin < closest.margin)) closest = { margin, managerId: hiId, g }
      if (!shootout || a + b > shootout.total) shootout = { total: a + b, g }
      if (margin > 0 && lo > 0 && (!heartbreak || lo > heartbreak.score)) heartbreak = { score: lo, managerId: loId, g }
      if (margin > 0 && (!stingiestWin || hi < stingiestWin.score)) stingiestWin = { score: hi, managerId: hiId, g }
    }

    const pushGameRecord = (
      id: string, title: string, value: string, unit: string,
      managerId: string, g: GameRow, extra?: string
    ) => {
      const { holder, team } = holderOf(managerId, g.season_id)
      const { league, leagueSlug, year } = leagueOf(g.season_id)
      records.push({
        id, title, value, unit, holder, team, league, leagueSlug,
        detail: `Week ${g.week} · ${year}${extra ? ` · ${extra}` : ''}`,
      })
    }

    if (topWeek) pushGameRecord('top-week', 'Highest single week', fmt(topWeek.score), 'pts', topWeek.managerId, topWeek.g)
    if (blowout) pushGameRecord('blowout', 'Biggest blowout', fmt(blowout.margin), 'pt margin', blowout.managerId, blowout.g)
    if (closest)
      pushGameRecord('closest', 'Closest game ever', fmt(closest.margin), 'pt margin', closest.managerId, closest.g, 'survived')
    if (shootout) {
      // Shootout credits both teams; bill it under the winner's name.
      const a = Number(shootout.g.score_a), b = Number(shootout.g.score_b)
      const winnerId = a >= b ? shootout.g.manager_a_id : shootout.g.manager_b_id
      const loserId = a >= b ? shootout.g.manager_b_id : shootout.g.manager_a_id
      const w = holderOf(winnerId, shootout.g.season_id)
      const l = holderOf(loserId, shootout.g.season_id)
      const { league, leagueSlug, year } = leagueOf(shootout.g.season_id)
      records.push({
        id: 'shootout', title: 'Highest-scoring game', value: fmt(shootout.total), unit: 'combined',
        holder: `${w.holder} vs ${l.holder}`, team: null, league, leagueSlug,
        detail: `Week ${shootout.g.week} · ${year} · ${fmt(Math.max(a, b))}–${fmt(Math.min(a, b))}`,
      })
    }
    if (heartbreak)
      pushGameRecord('heartbreak', 'Most points in a loss', fmt(heartbreak.score), 'pts', heartbreak.managerId, heartbreak.g, 'still lost')
    if (stingiestWin)
      pushGameRecord('stingy', 'Lowest score to win', fmt(stingiestWin.score), 'pts', stingiestWin.managerId, stingiestWin.g, 'and it held')

    // ── Season records ──
    let bestSeason: StandingRow | null = null
    let bestSeasonPct = -1
    let pointsSeason: StandingRow | null = null
    for (const r of scopedStandings) {
      const gamesPlayed = (r.wins || 0) + (r.losses || 0) + (r.ties || 0)
      if (gamesPlayed >= 10) {
        const pct = ((r.wins || 0) + 0.5 * (r.ties || 0)) / gamesPlayed
        if (pct > bestSeasonPct || (pct === bestSeasonPct && bestSeason && (r.wins || 0) > (bestSeason.wins || 0))) {
          bestSeasonPct = pct
          bestSeason = r
        }
      }
      if (!pointsSeason || Number(r.points_for) > Number(pointsSeason.points_for)) pointsSeason = r
    }
    if (bestSeason) {
      const { holder, team } = holderOf(bestSeason.manager_id, bestSeason.season_id)
      const { league, leagueSlug, year } = leagueOf(bestSeason.season_id)
      const rec = `${bestSeason.wins}–${bestSeason.losses}${bestSeason.ties ? `–${bestSeason.ties}` : ''}`
      records.push({
        id: 'best-record', title: 'Best season record', value: rec, unit: '',
        holder, team, league, leagueSlug, detail: `${year} regular season`,
      })
    }
    if (pointsSeason) {
      const { holder, team } = holderOf(pointsSeason.manager_id, pointsSeason.season_id)
      const { league, leagueSlug, year } = leagueOf(pointsSeason.season_id)
      records.push({
        id: 'points-season', title: 'Most points, one season', value: fmt(Number(pointsSeason.points_for)), unit: 'pts',
        holder, team, league, leagueSlug, detail: `${year} season`,
      })
    }

    // ── Longest win streak ──
    // Walk every manager's games in (year, week) order within their league.
    // Playoff + regular season both count; a loss or tie snaps it.
    type StreakState = { cur: number; best: number; bestEnd?: { seasonId: string; week: number } }
    const streaks = new Map<string, StreakState>()
    const ordered = [...games].sort((x, y) => {
      const sx = seasonById.get(x.season_id), sy = seasonById.get(y.season_id)
      return (sx?.year ?? 0) - (sy?.year ?? 0) || x.week - y.week
    })
    for (const g of ordered) {
      const a = Number(g.score_a), b = Number(g.score_b)
      if (!(a > 0 || b > 0) || a === b) {
        for (const id of [g.manager_a_id, g.manager_b_id]) {
          const s = streaks.get(id)
          if (s && a === b && (a > 0 || b > 0)) s.cur = 0
        }
        continue
      }
      const winId = a > b ? g.manager_a_id : g.manager_b_id
      const loseId = a > b ? g.manager_b_id : g.manager_a_id
      const w = streaks.get(winId) ?? { cur: 0, best: 0 }
      w.cur += 1
      if (w.cur > w.best) {
        w.best = w.cur
        w.bestEnd = { seasonId: g.season_id, week: g.week }
      }
      streaks.set(winId, w)
      const l = streaks.get(loseId) ?? { cur: 0, best: 0 }
      l.cur = 0
      streaks.set(loseId, l)
    }
    let streakHolder: { managerId: string; s: StreakState } | null = null
    for (const [managerId, s] of streaks) {
      if (!streakHolder || s.best > streakHolder.s.best) streakHolder = { managerId, s }
    }
    if (streakHolder && streakHolder.s.best >= 4 && streakHolder.s.bestEnd) {
      const { holder, team } = holderOf(streakHolder.managerId, streakHolder.s.bestEnd.seasonId)
      const { league, leagueSlug, year } = leagueOf(streakHolder.s.bestEnd.seasonId)
      records.push({
        id: 'win-streak', title: 'Longest win streak', value: String(streakHolder.s.best), unit: 'straight wins',
        holder, team, league, leagueSlug, detail: `Snapped after Week ${streakHolder.s.bestEnd.week} · ${year}`,
      })
    }

    // ── Dynasty: most championships ──
    const ringCounts = new Map<string, { rings: number; years: number[] }>()
    for (const s of scopedSeasons) {
      if (!s.champion_manager_id) continue
      const c = ringCounts.get(s.champion_manager_id) ?? { rings: 0, years: [] }
      c.rings += 1
      c.years.push(s.year)
      ringCounts.set(s.champion_manager_id, c)
    }
    let dynasty: { managerId: string; rings: number; years: number[] } | null = null
    for (const [managerId, c] of ringCounts) {
      if (!dynasty || c.rings > dynasty.rings) dynasty = { managerId, rings: c.rings, years: c.years }
    }
    if (dynasty && dynasty.rings >= 2) {
      const m = managerById.get(dynasty.managerId)
      const l = m ? leagueById.get(m.league_id) : undefined
      records.push({
        id: 'dynasty', title: 'Most championships', value: String(dynasty.rings), unit: 'rings',
        holder: m?.display_name ?? 'Unknown manager', team: m?.team_name ?? null,
        league: l?.name ?? 'Unknown league', leagueSlug: l?.slug ?? '',
        detail: dynasty.years.sort((a, b) => a - b).join(' · '),
      })
    }

    return records
  }

  const records = buildRecords(null)

  // ── League classification for the split walls ──────────────────────────
  // Sources, in priority order:
  //   1. Trade Desk settings (commish-confirmed overrides: lineup type,
  //      PPR variant, flex slots, TE premium)
  //   2. draft_scoring_profile (PPR/Half × 4/6pt passing TDs — set on the
  //      draft history page; defaults to ppr_6pt)
  //   3. Lineup evidence from weekly_lineups (2+ QB starters → superflex;
  //      FLEX slot counts → flex starters)
  //   4. leagues.league_type (redraft / keeper / dynasty)

  // Lineup evidence: QB starters (superflex) + FLEX slots per lineup.
  const superflexDetected = new Set<string>()
  const flexDetected = new Map<string, number>() // league → typical FLEX starters
  {
    type SlotRow = { season_id: string; week: number; manager_id: string }
    const countLineups = async (filter: { position?: string; slot?: string }) => {
      const counts = new Map<string, number>()
      for (const ids of chunk(seasonIds, 100)) {
        const rows = await fetchAll<SlotRow>((from, to) => {
          let q = admin
            .from('weekly_lineups')
            .select('season_id, week, manager_id')
            .in('season_id', ids)
            .eq('is_starter', true)
          if (filter.position) q = q.eq('position', filter.position)
          if (filter.slot) q = q.eq('slot', filter.slot)
          return q.range(from, to)
        })
        for (const r of rows) {
          const key = `${r.season_id}:${r.week}:${r.manager_id}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
      return counts
    }

    const qbStarts = await countLineups({ position: 'QB' })
    for (const [key, n] of qbStarts) {
      if (n < 2) continue
      const season = seasonById.get(key.split(':')[0])
      if (season) superflexDetected.add(season.league_id)
    }

    // FLEX per lineup → per-league mode. Lineups with zero FLEX rows
    // don't appear in the map, so only leagues with FLEX data vote.
    const flexStarts = await countLineups({ slot: 'FLEX' })
    const flexVotes = new Map<string, Map<number, number>>()
    for (const [key, n] of flexStarts) {
      const season = seasonById.get(key.split(':')[0])
      if (!season) continue
      const votes = flexVotes.get(season.league_id) ?? new Map<number, number>()
      votes.set(n, (votes.get(n) ?? 0) + 1)
      flexVotes.set(season.league_id, votes)
    }
    for (const [leagueId, votes] of flexVotes) {
      let best = 0, bestN = 0
      for (const [n, count] of votes) {
        if (count > bestN || (count === bestN && n > best)) { best = n; bestN = count }
      }
      if (best > 0) flexDetected.set(leagueId, best)
    }
  }

  // League size: the most common roster count across the league's seasons.
  const leagueSize = new Map<string, number>()
  {
    const seasonSize = new Map<string, number>()
    for (const r of standings) {
      seasonSize.set(r.season_id, (seasonSize.get(r.season_id) ?? 0) + 1)
    }
    const sizeVotes = new Map<string, Map<number, number>>()
    for (const s of seasons) {
      const size = seasonSize.get(s.id)
      if (!size) continue
      const votes = sizeVotes.get(s.league_id) ?? new Map<number, number>()
      votes.set(size, (votes.get(size) ?? 0) + 1)
      sizeVotes.set(s.league_id, votes)
    }
    for (const [leagueId, votes] of sizeVotes) {
      let best = 0, bestN = 0
      for (const [size, n] of votes) {
        if (n > bestN || (n === bestN && size > best)) { best = size; bestN = n }
      }
      if (best > 0) leagueSize.set(leagueId, best)
    }
  }

  // Fold every signal into one classification per league.
  type LeagueClass = {
    superflex: boolean
    scoring: 'PPR' | 'HALF' | 'STANDARD'
    qbTd: 4 | 6
    flex: number | null
    tePremium: boolean
    leagueType: string
  }
  const classOf = new Map<string, LeagueClass>()
  for (const l of leagues) {
    const id = l.id as string
    const td = parseSettings(l.trade_desk_settings)
    const profile = (l.draft_scoring_profile as string | null) ?? 'ppr_6pt'
    classOf.set(id, {
      superflex: td.lineupType ? td.lineupType === 'SUPERFLEX' : superflexDetected.has(id),
      scoring: td.scoringProfile ?? (profile.startsWith('half') ? 'HALF' : 'PPR'),
      qbTd: profile.endsWith('4pt') ? 4 : 6,
      flex: td.rosterSlots?.FLEX ?? flexDetected.get(id) ?? null,
      tePremium: td.tePremium === 'MILD' || td.tePremium === 'FULL',
      leagueType: (l.league_type as string | null) ?? 'redraft',
    })
  }
  const cls = (id: string) => classOf.get(id)

  const splitDefs: { key: string; group: string; label: string; test: (id: string) => boolean }[] = [
    { key: 'fmt-1qb', group: 'Format', label: '1-QB', test: (id) => !cls(id)?.superflex },
    { key: 'fmt-sf', group: 'Format', label: 'Superflex / 2-QB', test: (id) => !!cls(id)?.superflex },
    { key: 'sc-ppr', group: 'Scoring', label: 'Full PPR', test: (id) => cls(id)?.scoring === 'PPR' },
    { key: 'sc-half', group: 'Scoring', label: 'Half PPR', test: (id) => cls(id)?.scoring === 'HALF' },
    { key: 'sc-std', group: 'Scoring', label: 'Standard', test: (id) => cls(id)?.scoring === 'STANDARD' },
    { key: 'td-4', group: 'Passing TDs', label: '4 pt', test: (id) => cls(id)?.qbTd === 4 },
    { key: 'td-6', group: 'Passing TDs', label: '6 pt', test: (id) => cls(id)?.qbTd === 6 },
    { key: 'fx-1', group: 'Flex slots', label: '1 flex', test: (id) => cls(id)?.flex === 1 },
    { key: 'fx-2', group: 'Flex slots', label: '2+ flex', test: (id) => (cls(id)?.flex ?? 0) >= 2 },
    { key: 'sz-8', group: 'League size', label: '8 or fewer', test: (id) => (leagueSize.get(id) ?? 0) > 0 && (leagueSize.get(id) ?? 0) <= 8 },
    { key: 'sz-12', group: 'League size', label: '10–12 teams', test: (id) => { const n = leagueSize.get(id) ?? 0; return n >= 9 && n <= 12 } },
    { key: 'sz-14', group: 'League size', label: '14+ teams', test: (id) => (leagueSize.get(id) ?? 0) >= 13 },
    { key: 'lt-redraft', group: 'League type', label: 'Redraft', test: (id) => cls(id)?.leagueType === 'redraft' },
    { key: 'lt-keeper', group: 'League type', label: 'Keeper', test: (id) => cls(id)?.leagueType === 'keeper' },
    { key: 'lt-dynasty', group: 'League type', label: 'Dynasty', test: (id) => cls(id)?.leagueType === 'dynasty' },
    // Only the premium bucket — "no TE premium" would just mirror the
    // full wall. Disappears automatically while no league has it set.
    { key: 'te-prem', group: 'TE premium', label: 'TE premium', test: (id) => !!cls(id)?.tePremium },
  ]

  const splits: HubHallSplit[] = []
  for (const def of splitDefs) {
    const ids = new Set(leagues.filter((l) => def.test(l.id as string)).map((l) => l.id as string))
    if (ids.size === 0) continue
    splits.push({
      key: def.key,
      group: def.group,
      label: def.label,
      leagues: ids.size,
      seasons: seasons.filter((s) => ids.has(s.league_id)).length,
      records: buildRecords(ids),
    })
  }

  return {
    records,
    splits,
    sourceLeagues: leagues.length,
    sourceSeasons: seasons.length,
    generatedAt: new Date().toISOString(),
  }
}

export const getHubHall = unstable_cache(computeHall, ['hub-hall-v3'], {
  revalidate: 3600,
  tags: ['hub-data'],
})

// ════════════════════════════════════════════════════════════════════════
// SHELVES — Newsstand directory (published almanacs)
// ════════════════════════════════════════════════════════════════════════

export type HubShelfLeague = {
  id: string
  name: string
  slug: string
  platform: string
  publishedAt: string
  seasons: number
  firstYear: number | null
  latestYear: number | null
  bookmarks: number
}

export type HubShelves = {
  recent: HubShelfLeague[]
  popular: HubShelfLeague[]
  totalPublished: number
}

async function computeShelves(): Promise<HubShelves> {
  const admin = createAdminClient()

  const { data: leagueRows } = await admin
    .from('leagues')
    .select('id, name, slug, platform, published_at')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
  const published = leagueRows ?? []
  if (published.length === 0) return { recent: [], popular: [], totalPublished: 0 }
  const leagueIds = published.map((l) => l.id as string)

  const seasonRows: { league_id: string; year: number }[] = []
  for (const ids of chunk(leagueIds, 100)) {
    seasonRows.push(
      ...(await fetchAll<{ league_id: string; year: number }>((from, to) =>
        admin.from('seasons').select('league_id, year').in('league_id', ids).range(from, to)
      ))
    )
  }
  const seasonAgg = new Map<string, { n: number; min: number; max: number }>()
  for (const s of seasonRows) {
    const a = seasonAgg.get(s.league_id) ?? { n: 0, min: Infinity, max: -Infinity }
    a.n += 1
    a.min = Math.min(a.min, s.year)
    a.max = Math.max(a.max, s.year)
    seasonAgg.set(s.league_id, a)
  }

  const bookmarkRows = await fetchAll<{ league_id: string }>((from, to) =>
    admin.from('league_bookmarks').select('league_id').range(from, to)
  )
  const bookmarkCounts = new Map<string, number>()
  for (const b of bookmarkRows) {
    bookmarkCounts.set(b.league_id, (bookmarkCounts.get(b.league_id) ?? 0) + 1)
  }

  const toShelf = (l: (typeof published)[number]): HubShelfLeague => {
    const agg = seasonAgg.get(l.id as string)
    return {
      id: l.id as string,
      name: l.name as string,
      slug: l.slug as string,
      platform: l.platform as string,
      publishedAt: l.published_at as string,
      seasons: agg?.n ?? 0,
      firstYear: agg && agg.min !== Infinity ? agg.min : null,
      latestYear: agg && agg.max !== -Infinity ? agg.max : null,
      bookmarks: bookmarkCounts.get(l.id as string) ?? 0,
    }
  }

  const all = published.map(toShelf)
  const popular = [...all]
    .filter((l) => l.bookmarks > 0)
    .sort((a, b) => b.bookmarks - a.bookmarks || b.seasons - a.seasons)
    .slice(0, 6)

  return {
    recent: all.slice(0, 8),
    popular,
    totalPublished: all.length,
  }
}

export const getHubShelves = unstable_cache(computeShelves, ['hub-shelves-v1'], {
  // Shorter window — publishing a league should show up on the Newsstand
  // reasonably fast without waiting for the hourly census.
  revalidate: 900,
  tags: ['hub-data'],
})
