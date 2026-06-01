// Career aggregator for the Manager Hub.
//
// Flattens every linked league's archive into manager-level rollups: combined
// record, titles, finishes, cross-league rivalries, and signature games. Reads
// the SAME tables the almanac fills (seasons / managers / manager_seasons /
// matchups) and — critically — applies the SAME rules the almanac uses so the
// numbers line up:
//
//   • Regular-season games (is_playoff = false) always count.
//   • A playoff game counts ONLY if it's a championship-bracket game: is_playoff
//     AND at least one participant's final_rank ≤ 4. This is the almanac's
//     `isChampionshipBracketGame` rule (pams.ts).
//   • Consolation / placement games (is_playoff but both ranks > 4 — e.g. the
//     5th-place game) are EXCLUDED entirely from records and rivalries.
//   • "Made the playoffs" = final_rank ≤ season playoff_team_count (fallback to
//     "had any playoff matchup" when the season lacks a team count).
//
// A linked league whose archive isn't synced (or whose "me" pick doesn't resolve
// to a manager) comes back status 'pending' so the UI can prompt a sync.

import { createClient } from '@/lib/supabase/server'

export type CareerLeagueSummary = {
  leagueId: string
  leagueName: string
  leagueSlug: string
  platform: string
  status: 'ready' | 'pending'
  managerName: string | null
  teamName: string | null
  avatarUrl: string | null
  seasonsPlayed: number
  firstYear: number | null
  lastYear: number | null
  // Regular-season record (matches the standings page — manager_seasons totals).
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  // Championship-bracket playoff record (consolation excluded).
  playoffWins: number
  playoffLosses: number
  playoffPointsFor: number
  playoffPointsAgainst: number
  playoffAppearances: number
  championships: number
  runnerUps: number
  bestFinish: number | null
  titleYears: number[]
  finishes: { year: number; rank: number | null; wins: number; losses: number; ties: number; madePlayoffs: boolean; champion: boolean }[]
}

export type CareerRivalry = {
  opponent: string
  games: number
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  playoffGames: number
  leagues: string[]
}

export type CareerMoment = {
  leagueName: string
  year: number
  week: number
  opponent: string
  score: number
  oppScore: number
  margin: number
  isPlayoff: boolean
}

export type CareerSummary = {
  chronicle: { id: string; slug: string; displayName: string; subtitle: string | null }
  leagues: CareerLeagueSummary[]
  totals: {
    leagues: number
    seasonsPlayed: number
    wins: number
    losses: number
    ties: number
    pointsFor: number
    pointsAgainst: number
    playoffWins: number
    playoffLosses: number
    playoffPointsFor: number
    playoffPointsAgainst: number
    playoffAppearances: number
    championships: number
    runnerUps: number
    winPct: number
  }
  trophyCase: { leagueName: string; year: number; kind: 'champion' | 'runner-up' }[]
  topRivalries: CareerRivalry[]
  bestWins: CareerMoment[]
  worstLosses: CareerMoment[]
  pendingCount: number
}

type ChronicleRow = { id: string; slug: string; display_name: string; subtitle: string | null }

export async function loadCareerSummary(slug: string, ownerId: string): Promise<CareerSummary | null> {
  const supabase = await createClient()

  const { data: chronicle } = await supabase
    .from('career_chronicles')
    .select('id, slug, display_name, subtitle')
    .eq('slug', slug)
    .eq('owner_id', ownerId)
    .maybeSingle<ChronicleRow>()
  if (!chronicle) return null

  const { data: links } = await supabase
    .from('career_links')
    .select('id, league_id, source, manager_external_id, display_name_in_league, league:leagues!inner(id, name, slug, platform, last_synced_at)')
    .eq('chronicle_id', chronicle.id)
    .order('created_at', { ascending: true })

  type LinkRow = {
    league_id: string
    source: string
    manager_external_id: string
    display_name_in_league: string | null
    league: { id: string; name: string; slug: string; platform: string; last_synced_at: string | null }
  }
  const linkRows = (links ?? []) as unknown as LinkRow[]

  const leagues: CareerLeagueSummary[] = []
  const trophyCase: CareerSummary['trophyCase'] = []
  const rivalryMap = new Map<string, CareerRivalry>()
  const moments: CareerMoment[] = []

  for (const link of linkRows) {
    leagues.push(await summarizeLeague(supabase, link, trophyCase, rivalryMap, moments))
  }

  const ready = leagues.filter((l) => l.status === 'ready')
  const totals = ready.reduce(
    (acc, l) => {
      acc.seasonsPlayed += l.seasonsPlayed
      acc.wins += l.wins
      acc.losses += l.losses
      acc.ties += l.ties
      acc.pointsFor += l.pointsFor
      acc.pointsAgainst += l.pointsAgainst
      acc.playoffWins += l.playoffWins
      acc.playoffLosses += l.playoffLosses
      acc.playoffPointsFor += l.playoffPointsFor
      acc.playoffPointsAgainst += l.playoffPointsAgainst
      acc.playoffAppearances += l.playoffAppearances
      acc.championships += l.championships
      acc.runnerUps += l.runnerUps
      return acc
    },
    { seasonsPlayed: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, playoffWins: 0, playoffLosses: 0, playoffPointsFor: 0, playoffPointsAgainst: 0, playoffAppearances: 0, championships: 0, runnerUps: 0 },
  )
  const decided = totals.wins + totals.losses
  const winPct = decided > 0 ? totals.wins / decided : 0

  const topRivalries = [...rivalryMap.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, 10)

  const bestWins = [...moments].filter((m) => m.margin > 0).sort((a, b) => b.margin - a.margin).slice(0, 6)
  const worstLosses = [...moments].filter((m) => m.margin < 0).sort((a, b) => a.margin - b.margin).slice(0, 6)

  trophyCase.sort((a, b) => b.year - a.year)

  return {
    chronicle: {
      id: chronicle.id,
      slug: chronicle.slug,
      displayName: chronicle.display_name,
      subtitle: chronicle.subtitle,
    },
    leagues,
    totals: { leagues: ready.length, ...totals, winPct },
    trophyCase,
    topRivalries,
    bestWins,
    worstLosses,
    pendingCount: leagues.filter((l) => l.status === 'pending').length,
  }
}

type Db = Awaited<ReturnType<typeof createClient>>
type AnyLink = {
  league_id: string
  source: string
  manager_external_id: string
  display_name_in_league: string | null
  league: { id: string; name: string; slug: string; platform: string; last_synced_at: string | null }
}

async function summarizeLeague(
  supabase: Db,
  link: AnyLink,
  trophyCase: CareerSummary['trophyCase'],
  rivalryMap: Map<string, CareerRivalry>,
  moments: CareerMoment[],
): Promise<CareerLeagueSummary> {
  const lg = link.league
  const base: CareerLeagueSummary = {
    leagueId: lg.id, leagueName: lg.name, leagueSlug: lg.slug, platform: lg.platform,
    status: 'pending', managerName: link.display_name_in_league, teamName: null, avatarUrl: null,
    seasonsPlayed: 0, firstYear: null, lastYear: null,
    wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
    playoffWins: 0, playoffLosses: 0, playoffPointsFor: 0, playoffPointsAgainst: 0, playoffAppearances: 0,
    championships: 0, runnerUps: 0, bestFinish: null, titleYears: [], finishes: [],
  }

  const { data: me } = await supabase
    .from('managers')
    .select('id, display_name, team_name, avatar_url')
    .eq('league_id', lg.id)
    .eq('external_id', link.manager_external_id)
    .maybeSingle<{ id: string; display_name: string; team_name: string | null; avatar_url: string | null }>()
  if (!me) return base

  base.status = 'ready'
  base.managerName = me.display_name
  base.teamName = me.team_name
  base.avatarUrl = me.avatar_url
  const mid = me.id

  // Reference data for this league. Seasons first (we need their ids for the
  // manager_seasons query), then all manager_seasons (records + final_rank for
  // EVERY manager so we can classify championship-bracket vs consolation) and
  // manager names in parallel.
  const { data: seasonRows } = await supabase
    .from('seasons')
    .select('id, year, champion_manager_id, runner_up_manager_id, settings')
    .eq('league_id', lg.id)

  type SeasonMeta = { year: number; champion: string | null; runnerUp: string | null; playoffTeamCount: number | null }
  const seasonById = new Map<string, SeasonMeta>()
  for (const s of seasonRows ?? []) {
    const ptcRaw = (s.settings as { playoff_team_count?: unknown } | null)?.playoff_team_count
    const ptc = typeof ptcRaw === 'number' && ptcRaw > 0 ? ptcRaw : null
    seasonById.set(s.id as string, {
      year: s.year as number,
      champion: (s.champion_manager_id as string | null) ?? null,
      runnerUp: (s.runner_up_manager_id as string | null) ?? null,
      playoffTeamCount: ptc,
    })
  }
  const seasonIds = [...seasonById.keys()]

  const [{ data: msRows }, { data: managerRows }] = await Promise.all([
    supabase
      .from('manager_seasons')
      .select('season_id, manager_id, wins, losses, ties, points_for, points_against, final_rank')
      .in('season_id', seasonIds.length > 0 ? seasonIds : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('managers').select('id, display_name').eq('league_id', lg.id),
  ])

  const nameByManager = new Map((managerRows ?? []).map((m) => [m.id as string, m.display_name as string]))
  // final_rank for every (season, manager) — drives the consolation rule.
  const finalRankBy = new Map<string, number | null>()
  for (const ms of msRows ?? []) {
    finalRankBy.set(`${ms.season_id}|${ms.manager_id}`, (ms.final_rank as number | null) ?? null)
  }

  // My per-season records (regular-season standings totals).
  const myFinalRankBySeason = new Map<string, number | null>()
  for (const ms of msRows ?? []) {
    if (ms.manager_id !== mid) continue
    const season = seasonById.get(ms.season_id as string)
    if (!season) continue
    base.seasonsPlayed += 1
    base.wins += ms.wins ?? 0
    base.losses += ms.losses ?? 0
    base.ties += ms.ties ?? 0
    base.pointsFor += Number(ms.points_for ?? 0)
    base.pointsAgainst += Number(ms.points_against ?? 0)
    const rank = (ms.final_rank as number | null) ?? null
    myFinalRankBySeason.set(ms.season_id as string, rank)
    if (rank != null && (base.bestFinish == null || rank < base.bestFinish)) base.bestFinish = rank
    if (base.firstYear == null || season.year < base.firstYear) base.firstYear = season.year
    if (base.lastYear == null || season.year > base.lastYear) base.lastYear = season.year
  }

  // Titles / runner-ups (ingest already derives these with the same rules).
  for (const season of seasonById.values()) {
    if (season.champion === mid) {
      base.championships += 1
      base.titleYears.push(season.year)
      trophyCase.push({ leagueName: lg.name, year: season.year, kind: 'champion' })
    } else if (season.runnerUp === mid) {
      base.runnerUps += 1
      trophyCase.push({ leagueName: lg.name, year: season.year, kind: 'runner-up' })
    }
  }
  base.titleYears.sort((a, b) => a - b)

  // Classify each of my games: regular / championship-bracket / consolation.
  const classify = (m: { season_id: string; manager_a_id: string; manager_b_id: string; is_playoff: boolean | null }): 'reg' | 'champ' | 'consolation' => {
    if (!m.is_playoff) return 'reg'
    const aRank = finalRankBy.get(`${m.season_id}|${m.manager_a_id}`) ?? null
    const bRank = finalRankBy.get(`${m.season_id}|${m.manager_b_id}`) ?? null
    if ((aRank != null && aRank <= 4) || (bRank != null && bRank <= 4)) return 'champ'
    return 'consolation'
  }

  const hadPlayoffMatchupBySeason = new Set<string>()
  if (seasonIds.length > 0) {
    const { data: mu } = await supabase
      .from('matchups')
      .select('season_id, week, manager_a_id, manager_b_id, score_a, score_b, is_playoff')
      .in('season_id', seasonIds)
      .or(`manager_a_id.eq.${mid},manager_b_id.eq.${mid}`)

    for (const m of mu ?? []) {
      const cls = classify(m as { season_id: string; manager_a_id: string; manager_b_id: string; is_playoff: boolean | null })
      if (m.is_playoff) hadPlayoffMatchupBySeason.add(m.season_id as string)
      // Consolation / placement games never count toward anything.
      if (cls === 'consolation') continue

      const iAmA = m.manager_a_id === mid
      const oppId = (iAmA ? m.manager_b_id : m.manager_a_id) as string
      const myScore = Number((iAmA ? m.score_a : m.score_b) ?? NaN)
      const oppScore = Number((iAmA ? m.score_b : m.score_a) ?? NaN)
      if (!Number.isFinite(myScore) || !Number.isFinite(oppScore)) continue
      const oppName = nameByManager.get(oppId) ?? 'Unknown'
      const season = seasonById.get(m.season_id as string)
      const isPlayoff = cls === 'champ'

      if (isPlayoff) {
        base.playoffPointsFor += myScore
        base.playoffPointsAgainst += oppScore
        if (myScore > oppScore) base.playoffWins += 1
        else if (myScore < oppScore) base.playoffLosses += 1
      }

      // Rivalry tally (cross-league by opponent name).
      let riv = rivalryMap.get(oppName)
      if (!riv) {
        riv = { opponent: oppName, games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, playoffGames: 0, leagues: [] }
        rivalryMap.set(oppName, riv)
      }
      if (!riv.leagues.includes(lg.name)) riv.leagues.push(lg.name)
      riv.games += 1
      riv.pointsFor += myScore
      riv.pointsAgainst += oppScore
      if (isPlayoff) riv.playoffGames += 1
      if (myScore > oppScore) riv.wins += 1
      else if (myScore < oppScore) riv.losses += 1
      else riv.ties += 1

      if (season) {
        moments.push({
          leagueName: lg.name, year: season.year, week: m.week as number,
          opponent: oppName, score: myScore, oppScore, margin: myScore - oppScore, isPlayoff,
        })
      }
    }
  }

  // Playoff appearances + per-year finish rows (after we know hadPlayoff).
  for (const [seasonId, rank] of myFinalRankBySeason) {
    const season = seasonById.get(seasonId)
    if (!season) continue
    const made = madePlayoffs(season.playoffTeamCount, rank, hadPlayoffMatchupBySeason.has(seasonId))
    if (made) base.playoffAppearances += 1
    const myMs = (msRows ?? []).find((r) => r.season_id === seasonId && r.manager_id === mid)
    base.finishes.push({
      year: season.year, rank,
      wins: myMs?.wins ?? 0, losses: myMs?.losses ?? 0, ties: myMs?.ties ?? 0,
      madePlayoffs: made, champion: season.champion === mid,
    })
  }
  base.finishes.sort((a, b) => a.year - b.year)

  return base
}

// Almanac rule: made the playoffs if final_rank ≤ playoff_team_count; fall back
// to "had any playoff matchup" only when the season lacks a team count.
function madePlayoffs(playoffTeamCount: number | null, finalRank: number | null, hadPlayoffMatchup: boolean): boolean {
  if (playoffTeamCount != null) return finalRank != null && finalRank <= playoffTeamCount
  return hadPlayoffMatchup
}
