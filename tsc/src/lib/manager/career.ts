// Career aggregator for the Manager Hub.
//
// Given a user's career chronicle, this flattens every linked league's archive
// into manager-level rollups: combined record, titles, finishes, cross-league
// rivalries, and signature wins/losses. It reads the SAME tables the almanac
// fills (seasons / managers / manager_seasons / matchups) — the Manager Hub is
// a different *lens* on already-ingested data, not a separate ingest path.
//
// A linked league whose archive hasn't been synced yet (or whose "me" pick
// doesn't resolve to a manager row) comes back with status 'pending' so the UI
// can prompt a sync instead of silently dropping it.

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
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  championships: number
  runnerUps: number
  bestFinish: number | null
  titleYears: number[]
  finishes: { year: number; rank: number | null; wins: number; losses: number; ties: number }[]
}

export type CareerRivalry = {
  opponent: string
  games: number
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
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

// Loads + aggregates a chronicle by slug for the given owner. Returns null if no
// chronicle with that slug is owned by the user (RLS also enforces this).
export async function loadCareerSummary(
  slug: string,
  ownerId: string,
): Promise<CareerSummary | null> {
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
    const summary = await summarizeLeague(supabase, link, trophyCase, rivalryMap, moments)
    leagues.push(summary)
  }

  // Totals across ready leagues.
  const ready = leagues.filter((l) => l.status === 'ready')
  const totals = ready.reduce(
    (acc, l) => {
      acc.seasonsPlayed += l.seasonsPlayed
      acc.wins += l.wins
      acc.losses += l.losses
      acc.ties += l.ties
      acc.pointsFor += l.pointsFor
      acc.pointsAgainst += l.pointsAgainst
      acc.championships += l.championships
      acc.runnerUps += l.runnerUps
      return acc
    },
    { seasonsPlayed: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, championships: 0, runnerUps: 0 },
  )
  const decided = totals.wins + totals.losses
  const winPct = decided > 0 ? totals.wins / decided : 0

  // Most-faced opponents across every league (the cross-league rivalry view).
  const topRivalries = [...rivalryMap.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, 8)

  const bestWins = [...moments]
    .filter((m) => m.margin > 0)
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 5)
  const worstLosses = [...moments]
    .filter((m) => m.margin < 0)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 5)

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

// Awaitable Supabase client type is awkward to import cleanly; use a loose type.
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
    leagueId: lg.id,
    leagueName: lg.name,
    leagueSlug: lg.slug,
    platform: lg.platform,
    status: 'pending',
    managerName: link.display_name_in_league,
    teamName: null,
    avatarUrl: null,
    seasonsPlayed: 0,
    firstYear: null,
    lastYear: null,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    championships: 0,
    runnerUps: 0,
    bestFinish: null,
    titleYears: [],
    finishes: [],
  }

  // Resolve the "me" manager within this league.
  const { data: me } = await supabase
    .from('managers')
    .select('id, display_name, team_name, avatar_url')
    .eq('league_id', lg.id)
    .eq('external_id', link.manager_external_id)
    .maybeSingle<{ id: string; display_name: string; team_name: string | null; avatar_url: string | null }>()
  if (!me) return base // not synced yet, or pick no longer present → pending

  base.status = 'ready'
  base.managerName = me.display_name
  base.teamName = me.team_name
  base.avatarUrl = me.avatar_url
  const mid = me.id

  // League reference maps: seasons (id→year + champ/runner-up) and managers (id→name).
  const [{ data: seasonRows }, { data: managerRows }] = await Promise.all([
    supabase
      .from('seasons')
      .select('id, year, champion_manager_id, runner_up_manager_id')
      .eq('league_id', lg.id),
    supabase.from('managers').select('id, display_name').eq('league_id', lg.id),
  ])
  const seasonById = new Map(
    (seasonRows ?? []).map((s) => [s.id as string, s as { id: string; year: number; champion_manager_id: string | null; runner_up_manager_id: string | null }]),
  )
  const nameByManager = new Map((managerRows ?? []).map((m) => [m.id as string, m.display_name as string]))
  const seasonIds = [...seasonById.keys()]

  // Per-season record snapshots.
  const { data: msRows } = await supabase
    .from('manager_seasons')
    .select('season_id, wins, losses, ties, points_for, points_against, final_rank')
    .eq('manager_id', mid)
  for (const ms of msRows ?? []) {
    const season = seasonById.get(ms.season_id as string)
    if (!season) continue
    base.seasonsPlayed += 1
    base.wins += ms.wins ?? 0
    base.losses += ms.losses ?? 0
    base.ties += ms.ties ?? 0
    base.pointsFor += Number(ms.points_for ?? 0)
    base.pointsAgainst += Number(ms.points_against ?? 0)
    const rank = (ms.final_rank as number | null) ?? null
    if (rank != null && (base.bestFinish == null || rank < base.bestFinish)) base.bestFinish = rank
    base.finishes.push({ year: season.year, rank, wins: ms.wins ?? 0, losses: ms.losses ?? 0, ties: ms.ties ?? 0 })
    if (base.firstYear == null || season.year < base.firstYear) base.firstYear = season.year
    if (base.lastYear == null || season.year > base.lastYear) base.lastYear = season.year
  }
  base.finishes.sort((a, b) => a.year - b.year)

  // Titles / runner-ups from the season record.
  for (const season of seasonById.values()) {
    if (season.champion_manager_id === mid) {
      base.championships += 1
      base.titleYears.push(season.year)
      trophyCase.push({ leagueName: lg.name, year: season.year, kind: 'champion' })
    } else if (season.runner_up_manager_id === mid) {
      base.runnerUps += 1
      trophyCase.push({ leagueName: lg.name, year: season.year, kind: 'runner-up' })
    }
  }
  base.titleYears.sort((a, b) => a - b)

  // Matchups → rivalries + signature moments. Only pull this league's seasons.
  if (seasonIds.length > 0) {
    const { data: mu } = await supabase
      .from('matchups')
      .select('season_id, week, manager_a_id, manager_b_id, score_a, score_b, is_playoff')
      .in('season_id', seasonIds)
      .or(`manager_a_id.eq.${mid},manager_b_id.eq.${mid}`)
    for (const m of mu ?? []) {
      const iAmA = m.manager_a_id === mid
      const oppId = (iAmA ? m.manager_b_id : m.manager_a_id) as string
      const myScore = Number((iAmA ? m.score_a : m.score_b) ?? NaN)
      const oppScore = Number((iAmA ? m.score_b : m.score_a) ?? NaN)
      const oppName = nameByManager.get(oppId) ?? 'Unknown'
      const season = seasonById.get(m.season_id as string)

      // Rivalry tally (keyed by opponent display name — this is what lets two
      // different leagues' opponents merge into one cross-league rivalry when a
      // name repeats, and otherwise just lists every distinct opponent).
      let riv = rivalryMap.get(oppName)
      if (!riv) {
        riv = { opponent: oppName, games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, leagues: [] }
        rivalryMap.set(oppName, riv)
      }
      if (!riv.leagues.includes(lg.name)) riv.leagues.push(lg.name)
      if (Number.isFinite(myScore) && Number.isFinite(oppScore)) {
        riv.games += 1
        riv.pointsFor += myScore
        riv.pointsAgainst += oppScore
        if (myScore > oppScore) riv.wins += 1
        else if (myScore < oppScore) riv.losses += 1
        else riv.ties += 1

        if (season) {
          moments.push({
            leagueName: lg.name,
            year: season.year,
            week: m.week as number,
            opponent: oppName,
            score: myScore,
            oppScore,
            margin: myScore - oppScore,
            isPlayoff: !!m.is_playoff,
          })
        }
      }
    }
  }

  return base
}
