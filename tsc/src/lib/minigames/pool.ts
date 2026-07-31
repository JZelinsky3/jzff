// The squad pool behind Roster Roulette.
//
// A "squad" is one manager's one season — Nick's 2021 team — and it is the
// unit the wheel lands on. Two pools exist:
//
//   • site  — every completed season of every published league on the site.
//             Anyone can play it, signed in or not.
//   • <slug>— one league's own history. Deeper spins for the people who
//             actually lived them.
//
// Loading is deliberately split in two, because the site pool spans every
// league on the site and will only grow:
//
//   loadSquadIndex()   one small row per squad (who / which league / what
//                      year / how they finished). ~1,200 rows today, a few
//                      hundred KB, cached for a day.
//   loadSquadRosters() the actual players, fetched for the handful of
//                      squads a single game deals (9) rather than for the
//                      whole pool. ~1,100 lineup rows per call.
//
// Pulling every roster up front would mean paging ~140k weekly_lineups rows
// through PostgREST on a cold cache, which is exactly the shape of request
// that already 504s elsewhere in this codebase. Dealing first and fetching
// second keeps the cost flat as leagues are added.
//
// Roster contents mirror buildAllTimePool() in src/lib/export/pams.ts: the
// players a manager drafted that year, plus anyone they actually started at
// least one week (trades and waiver pickups — the ledger can't tell which).
// Skill positions only; the rank files don't cover K/DEF.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { containsHateSpeech } from '@/lib/contentModeration'
import {
  getRankLookup,
  normPlayerName,
  isScoringProfile,
  SITE_PROFILE,
  FIRST_RANK_YEAR,
  LAST_RANK_YEAR,
  type ScoringProfile,
} from './ranks'

export const POOL_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
export type PoolPosition = (typeof POOL_POSITIONS)[number]
const POOL_POSITION_SET = new Set<string>(POOL_POSITIONS)

// A squad with fewer than this many scorable players makes a miserable
// spin — you land on it and there's nothing to take. Mid-season joins,
// half-ingested years, and leagues whose lineup history never came across
// from the old platform all produce these.
const MIN_SQUAD_PLAYERS = 8

export type SquadRef = {
  /** Stable, URL-safe handle for one manager-season. */
  key: string
  seasonId: string
  managerId: string
  leagueSlug: string
  leagueName: string
  leagueAbbr: string | null
  profile: ScoringProfile
  year: number
  managerName: string
  teamName: string | null
  wins: number
  losses: number
  ties: number
  finalRank: number | null
  isChampion: boolean
}

export type SquadPlayer = {
  name: string
  pos: PoolPosition
  /** Season total. Shown, but not what the game is scored on. */
  fpts: number
  /** Per-game average. This is the number the lineup is graded on. */
  ppg: number
  posRank: number
  gp: number
  /** The team he played for THAT season, off the league's own records. */
  nflTeam: string | null
  /** Sleeper id, for the headshot. Null means render initials instead. */
  playerId: string | null
  /** 'draft' if this manager drafted him that year, 'pickup' otherwise. */
  source: 'draft' | 'pickup'
  draftRound: number | null
  weeksStarted: number
}

export type Squad = SquadRef & {
  players: SquadPlayer[]
  /**
   * Whether this season's weekly lineups made it into the archive.
   *
   * Roughly two in five published seasons have draft picks but no lineup
   * history at all (NFL.com and older ESPN imports bring the draft across
   * and nothing else). For those, `weeksStarted` is zero for everyone and
   * means "unknown", not "benched" — so anything reading it has to check
   * this first or it will accuse a whole league of never playing anyone.
   */
  lineupsKnown: boolean
  /**
   * Whether this season's draft made it into the archive.
   *
   * UDFA leagues skip the drafts stage at ingest entirely (see the
   * `isLeagueLocked` branch in /api/leagues/[id]/sync), so a free-tier
   * league's squads are built from started lineups alone. Without this
   * flag every player on them would be labelled "Added in-season", which
   * is true of none of them and misleading about all of them.
   */
  draftsKnown: boolean
}

function squadKey(seasonId: string, managerId: string): string {
  // Both halves are uuids; first segment is unique enough to keep the key
  // short in a URL while staying collision-free within a single deal.
  return `${seasonId.slice(0, 8)}-${managerId.slice(0, 8)}`
}

// PostgREST answers with at most 1000 rows and says nothing about the ones
// it dropped. Every read here can cross that line — the site-wide index is
// already past it, and a deal's lineup rows get there as soon as the wheel
// lands on a few deep seasons — so all of them page. A silently truncated
// read would look like working code and quietly deal half-empty rosters.
const PAGE = 1000

// Platform exports disagree on casing and on the handful of teams that have
// moved or been renamed (OAK/LV, SD/LAC, STL/LAR, WSH/WAS). Normalizing to
// the modern abbreviation keeps one player's chip from reading two ways
// across two seasons.
const TEAM_ALIASES: Record<string, string> = {
  OAK: 'LV', SD: 'LAC', SDG: 'LAC', STL: 'LAR', LA: 'LAR',
  WSH: 'WAS', JAC: 'JAX', KAN: 'KC', NOR: 'NO', SFO: 'SF',
  TAM: 'TB', NWE: 'NE', GNB: 'GB', ARZ: 'ARI', BLT: 'BAL',
  CLV: 'CLE', HST: 'HOU',
}

function normNflTeam(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().toUpperCase()
  if (!t || t === 'FA' || t === 'NONE' || t === 'null') return null
  return TEAM_ALIASES[t] ?? t
}

async function pageAll<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> }
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

// ============================================================
// The index
// ============================================================

type IndexScope = { kind: 'site' } | { kind: 'league'; slug: string }

type LeagueRow = {
  id: string
  slug: string
  name: string
  abbreviation: string | null
  draft_scoring_profile: string | null
  published_at: string | null
}

async function buildSquadIndex(scope: IndexScope): Promise<SquadRef[]> {
  const db = createAdminClient()

  let leagueQuery = db
    .from('leagues')
    .select('id, slug, name, abbreviation, draft_scoring_profile, published_at')
    .eq('manager_view', false)
  if (scope.kind === 'league') {
    leagueQuery = leagueQuery.eq('slug', scope.slug)
  } else {
    // Site pool: published almanacs in good standing.
    //
    // Published, because an unpublished league is still a private draft as
    // far as its commissioner is concerned and its managers never agreed to
    // appear in someone else's game.
    //
    // Good standing, meaning no grace period. UDFA (free-tier) leagues DO
    // count — they're live leagues whose owners simply haven't paid, and
    // excluding them would gut the pool. What doesn't count is a league on
    // the way out: grace_period_ends_at is set when a subscription lapses
    // and the league is scheduled for deletion, so those stop being dealt
    // the moment they expire rather than the moment they're wiped.
    // (Deleted leagues cascade out of the tables entirely.)
    leagueQuery = leagueQuery
      .not('published_at', 'is', null)
      .is('grace_period_ends_at', null)
  }
  const { data: leagueRows } = await leagueQuery
  const leagues = (leagueRows ?? []) as LeagueRow[]
  if (leagues.length === 0) return []

  const leagueById = new Map(leagues.map((l) => [l.id, l]))
  const leagueIds = leagues.map((l) => l.id)

  // Completed seasons only. Per the house rule, "completed" means a champion
  // is on the books — never is_live, which only steers the /live/ tree and
  // has wrongly hidden whole finished seasons before. The year clamp keeps
  // us inside the span the rank files actually cover.
  const seasons = await pageAll<{
    id: string
    league_id: string
    year: number
    champion_manager_id: string | null
  }>(() =>
    db
      .from('seasons')
      .select('id, league_id, year, champion_manager_id')
      .in('league_id', leagueIds)
      .not('champion_manager_id', 'is', null)
      .gte('year', FIRST_RANK_YEAR)
      .lte('year', LAST_RANK_YEAR)
      .order('id')
  )
  if (seasons.length === 0) return []

  const seasonById = new Map(seasons.map((s) => [s.id, s]))
  const seasonIds = seasons.map((s) => s.id)

  const [msRows, managerRows] = await Promise.all([
    pageAll<{
      season_id: string
      manager_id: string
      team_name: string | null
      wins: number | null
      losses: number | null
      ties: number | null
      final_rank: number | null
    }>(() =>
      db
        .from('manager_seasons')
        .select('season_id, manager_id, team_name, wins, losses, ties, final_rank')
        .in('season_id', seasonIds)
        .order('season_id')
        .order('manager_id')
    ),
    pageAll<{ id: string; display_name: string }>(() =>
      db.from('managers').select('id, display_name').in('league_id', leagueIds).order('id')
    ),
  ])

  const managerName = new Map(managerRows.map((m) => [m.id, m.display_name]))

  // Team names and manager display names come straight off the platform and
  // have never been screened — unlike league names, which are checked at
  // creation. In the site-wide pool those get shown to strangers who have no
  // connection to that league, so they're screened here.
  //
  // Masked rather than dropped: binning the squad would delete a real
  // manager-season from the game over one season's team name, and the
  // display already falls back cleanly (team name -> manager name). Ordinary
  // swearing is left alone; this only catches slurs. A league's OWN wheel is
  // left unscreened, because its members already see these names on their
  // own almanac and it isn't this game's place to censor them to each other.
  const screen = scope.kind === 'site'

  const out: SquadRef[] = []
  for (const row of msRows) {
    const season = seasonById.get(row.season_id)
    if (!season) continue
    const league = leagueById.get(season.league_id)
    if (!league) continue
    const rawName = managerName.get(row.manager_id)
    if (!rawName) continue
    const name = screen && containsHateSpeech(rawName) ? 'Manager' : rawName
    const teamName =
      screen && containsHateSpeech(row.team_name) ? null : row.team_name
    const profile = isScoringProfile(league.draft_scoring_profile)
      ? league.draft_scoring_profile
      : SITE_PROFILE
    out.push({
      key: squadKey(row.season_id, row.manager_id),
      seasonId: row.season_id,
      managerId: row.manager_id,
      leagueSlug: league.slug,
      leagueName: league.name,
      leagueAbbr: league.abbreviation,
      // Cross-league runs are only comparable if every squad is scored the
      // same way, so the site pool overrides each league's own profile.
      profile: scope.kind === 'site' ? SITE_PROFILE : profile,
      year: season.year,
      managerName: name,
      teamName,
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
      ties: row.ties ?? 0,
      finalRank: row.final_rank,
      isChampion: season.champion_manager_id === row.manager_id,
    })
  }
  return out
}

export function loadSquadIndex(scope: IndexScope): Promise<SquadRef[]> {
  const tag = scope.kind === 'site' ? 'site' : `league:${scope.slug}`
  // Bump the version when the index's shape or its filters change — a
  // half-day-old cache built by the previous rules would otherwise keep
  // dealing from a pool that no longer matches the code.
  return unstable_cache(async () => buildSquadIndex(scope), ['minigame-squad-index', 'v2', tag], {
    tags: ['minigame-pool'],
    revalidate: 60 * 60 * 12,
  })()
}

// ============================================================
// The rosters
// ============================================================

// Fills in the players for a specific handful of squads.
//
// Two reads, issued in parallel, and that parallelism is the whole point:
// every sequential round trip to Supabase costs 150-400ms, and this call is
// the one thing standing between a player and their next wheel.
//
// Lineups filter by exact (season, manager) pair. The obvious alternative,
// `season_id.in(...) AND manager_id.in(...)`, is a cross product that asks
// for many times the rows it keeps — and it benchmarks slower besides
// (405ms vs 162ms on a 27-pair deal).
//
// Draft picks can't be filtered that way, because a pick knows its draft and
// not its season. Rather than resolve drafts in a preceding round trip, they
// ride an inner join to drafts and get the season back inline. The
// (season, manager) cross product is safe here: managers only exist inside
// their own league, so most of the extra combinations don't exist at all,
// and the bucketing below drops any that do.
export async function loadSquadRosters(refs: SquadRef[]): Promise<Squad[]> {
  if (refs.length === 0) return []
  const db = createAdminClient()

  const seasonIds = [...new Set(refs.map((r) => r.seasonId))]
  const managerIds = [...new Set(refs.map((r) => r.managerId))]
  const wanted = new Map(refs.map((r) => [`${r.seasonId}|${r.managerId}`, r]))
  const pairFilter = refs
    .map((r) => `and(season_id.eq.${r.seasonId},manager_id.eq.${r.managerId})`)
    .join(',')

  const [pickRows, lineupRows] = await Promise.all([
    pageAll<{
      round: number | null
      manager_id: string | null
      player_name: string | null
      position: string | null
      nfl_team: string | null
      // supabase-js types an embedded relation as an array even when the
      // join is to-one; PostgREST sends back a bare object. Accept both.
      drafts: { season_id: string }[] | { season_id: string } | null
    }>(() =>
      db
        .from('draft_picks')
        .select('round, manager_id, player_name, position, nfl_team, drafts!inner(season_id)')
        .in('drafts.season_id', seasonIds)
        .in('manager_id', managerIds)
        .in('position', POOL_POSITIONS)
        .order('pick')
    ),
    pageAll<{
      season_id: string
      manager_id: string
      player_name: string | null
      position: string | null
      nfl_team: string | null
    }>(() =>
      db
        .from('weekly_lineups')
        .select('season_id, manager_id, player_name, position, nfl_team')
        .or(pairFilter)
        .eq('is_starter', true)
        .in('position', POOL_POSITIONS)
        .order('week')
    ),
  ])

  type Entry = {
    name: string
    pos: PoolPosition
    // The team he played for that season, straight off the league's own
    // records. This is the ONLY trustworthy source: the rank files carry a
    // present-day team (Aaron Rodgers reads PIT in 2012) and leave every
    // retired player blank, which is why most old rosters had no team at
    // all before. draft_picks.nfl_team is fully populated and
    // weekly_lineups.nfl_team covers ~94%, so between them almost every
    // entry resolves.
    nflTeam: string | null
    source: 'draft' | 'pickup'
    draftRound: number | null
    weeksStarted: number
  }
  // pairKey -> normalized player name -> entry
  const byPair = new Map<string, Map<string, Entry>>()
  const bucket = (seasonId: string, managerId: string): Map<string, Entry> | null => {
    const pair = `${seasonId}|${managerId}`
    if (!wanted.has(pair)) return null
    let m = byPair.get(pair)
    if (!m) {
      m = new Map()
      byPair.set(pair, m)
    }
    return m
  }

  // Drafted players first, so the round is on the entry before any start
  // rows fold into it.
  for (const pick of pickRows) {
    if (!pick.manager_id || !pick.player_name) continue
    const seasonId = Array.isArray(pick.drafts)
      ? pick.drafts[0]?.season_id
      : pick.drafts?.season_id
    if (!seasonId) continue
    const pos = (pick.position ?? '').toUpperCase()
    if (!POOL_POSITION_SET.has(pos)) continue
    const m = bucket(seasonId, pick.manager_id)
    if (!m) continue
    const key = normPlayerName(pick.player_name)
    if (!key || m.has(key)) continue
    m.set(key, {
      name: pick.player_name,
      pos: pos as PoolPosition,
      nflTeam: normNflTeam(pick.nfl_team),
      source: 'draft',
      draftRound: pick.round,
      weeksStarted: 0,
    })
  }

  // Then anyone actually started. Folds into the drafted entry when the
  // names line up (ids can't be trusted across platforms, names can),
  // otherwise records an in-season addition.
  for (const row of lineupRows) {
    if (!row.player_name) continue
    const pos = (row.position ?? '').toUpperCase()
    if (!POOL_POSITION_SET.has(pos)) continue
    const m = bucket(row.season_id, row.manager_id)
    if (!m) continue
    const key = normPlayerName(row.player_name)
    if (!key) continue
    let entry = m.get(key)
    if (!entry) {
      entry = {
        name: row.player_name,
        pos: pos as PoolPosition,
        nflTeam: null,
        source: 'pickup',
        draftRound: null,
        weeksStarted: 0,
      }
      m.set(key, entry)
    }
    // Draft rows win when they have a team (they're 100% populated); a
    // started row fills the gap for anyone added after the draft, and for
    // the handful of drafts that came across without one.
    if (!entry.nflTeam) entry.nflTeam = normNflTeam(row.nfl_team)
    entry.weeksStarted++
  }

  // Join each entry against that year's rank file for its season total and
  // positional finish. A player the rank file has never heard of (deep
  // bench, a name that never normalizes) is dropped rather than shown at
  // zero — an unpickable card on the wheel is just clutter.
  const out: Squad[] = []
  for (const ref of refs) {
    const entries = byPair.get(`${ref.seasonId}|${ref.managerId}`)
    if (!entries) continue
    const ranks = await getRankLookup(ref.profile, ref.year)
    const players: SquadPlayer[] = []
    for (const [key, e] of entries) {
      const rank = ranks.get(key)
      if (!rank || rank.fpts <= 0) continue
      players.push({
        name: e.name,
        // The rank file is the authority on position: it's the same source
        // the points came from, and platform draft exports disagree about
        // players who changed position.
        pos: (POOL_POSITION_SET.has(rank.position) ? rank.position : e.pos) as PoolPosition,
        fpts: rank.fpts,
        ppg: rank.ppg,
        posRank: rank.posRank,
        gp: rank.gp,
        nflTeam: e.nflTeam,
        playerId: rank.playerId,
        source: e.source,
        draftRound: e.draftRound,
        weeksStarted: e.weeksStarted,
      })
    }
    players.sort((a, b) => b.ppg - a.ppg)
    out.push({
      ...ref,
      players,
      lineupsKnown: players.some((p) => p.weeksStarted > 0),
      draftsKnown: players.some((p) => p.source === 'draft'),
    })
  }
  return out
}

export function isPlayableSquad(squad: Squad): boolean {
  if (squad.players.length < MIN_SQUAD_PLAYERS) return false
  // Every slot in the lineup has to be fillable from somewhere, so a squad
  // that can't field one of each skill position never goes on the wheel.
  const seen = new Set(squad.players.map((p) => p.pos))
  return POOL_POSITIONS.every((p) => seen.has(p))
}
