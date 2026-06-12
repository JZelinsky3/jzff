// Pams-shaped JSON exporter.
// Reads a league out of Supabase and produces the exact file tree that
// pams_site's HTML/JS expects under data/. Output is a flat map of
// relative path -> JSON object so callers can write to disk, return as
// a response, or compare against a fixture.

import { createAdminClient } from '@/lib/supabase/admin'
import { simulateSeason, type SimTeam } from '@/lib/powerSim'
import { resolveCurrentWeek } from '@/lib/liveSeason'

// ============================================================
// In-memory league snapshot
// ============================================================

type LeagueRow = {
  id: string
  name: string
  platform: string
  external_id: string
  abbreviation: string | null
  prize_pool: string | null
  division_count: number
  division_term: 'division' | 'conference'
  division_names: string[]
  last_synced_at: string | null
  draft_scoring_profile: 'ppr_6pt' | 'half_4pt' | 'ppr_4pt' | 'half_6pt'
}

type SeasonRow = {
  id: string
  year: number
  external_id: string | null
  champion_manager_id: string | null
  runner_up_manager_id: string | null
  regular_season_winner_id: string | null
  playoff_weeks: number[] | null
  is_live: boolean | null
  settings: Record<string, unknown> | null
}

type ManagerRow = {
  id: string
  external_id: string | null
  display_name: string
  team_name: string | null
  avatar_url: string | null
  profile_id: string | null
}

type ProfileRow = {
  id: string
  canonical_name: string
  is_alumni_override: boolean | null
  is_hidden: boolean
}

type ManagerSeasonRow = {
  season_id: string
  manager_id: string
  team_name: string | null
  avatar_url: string | null
  wins: number
  losses: number
  ties: number
  points_for: number
  points_against: number
  final_rank: number | null
  regular_rank: number | null
  division_index: number | null
}

type MatchupRow = {
  id?: string                  // matchups.id — only needed for GOTW resolution; optional to keep existing call sites lax
  season_id: string
  week: number
  manager_a_id: string
  manager_b_id: string
  score_a: number | null
  score_b: number | null
  is_playoff: boolean
  is_championship: boolean
}

type DraftRow = {
  id: string
  season_id: string
  draft_type: string
  rounds: number | null
}

type DraftPickRow = {
  draft_id: string
  round: number
  pick: number
  manager_id: string | null
  player_name: string | null
  position: string | null
  nfl_team: string | null
  player_external_id: string | null
}

type RivalryRow = {
  id: string
  name: string
  manager_a_id: string
  manager_b_id: string
  created_at: string
}

type WeeklyLineupRow = {
  season_id: string
  week: number
  manager_id: string
  player_external_id: string
  player_name: string | null
  position: string | null
  nfl_team: string | null
  slot: string
  is_starter: boolean
  points: number | null
  proj_points: number | null
}

// Trade participation row — Manager DNA only needs counts + timing + who-with,
// not the full asset payload, so we read just the join fields.
type TradeParticipationRow = {
  trade_id: string
  season_id: string
  week: number | null
  manager_id: string
}

type Snapshot = {
  league: LeagueRow
  seasons: SeasonRow[]                          // sorted by year asc
  managers: Map<string, ManagerRow>             // by manager.id
  managerByExternal: Map<string, ManagerRow>    // by external_id
  profilesById: Map<string, ProfileRow>         // by profile.id
  managerSeasonsBySeason: Map<string, ManagerSeasonRow[]>
  managerSeasonsByManager: Map<string, ManagerSeasonRow[]>
  finalRankByMgrSeason: Map<string, number | null>  // key: "season_id|manager_id"
  matchupsBySeason: Map<string, MatchupRow[]>
  matchupsByManager: Map<string, MatchupRow[]>  // every matchup the manager is in
  draftsBySeason: Map<string, DraftRow>
  picksByDraft: Map<string, DraftPickRow[]>
  rivalries: RivalryRow[]
  // Weekly per-player roster snapshot. Empty for seasons that pre-date the
  // 0029 migration or for platforms whose ingest didn't capture lineup data
  // for that week. Keyed by season_id; each manager-week's rows live together.
  weeklyLineupsBySeason: Map<string, WeeklyLineupRow[]>
  // Trade participation, one row per (trade, manager-side). Empty if the
  // league predates migration 0022 or the platform isn't Sleeper.
  tradeParticipationByManager: Map<string, TradeParticipationRow[]>
}

async function loadSnapshot(leagueId: string): Promise<Snapshot> {
  const db = createAdminClient()

  // League row: try with division columns first (migration 0003), fall back to
  // the pre-migration shape so the exporter works against either schema.
  let leagueRaw: Partial<LeagueRow> | null = null
  {
    // Try with the richest column set; fall back per missing-column error so
    // the exporter still works against pre-migration databases.
    const queries: Array<() => Promise<{ data: unknown }>> = [
      // migration 0017 (draft_scoring_profile)
      () => db.from('leagues')
        .select('id, name, platform, external_id, abbreviation, prize_pool, division_count, division_term, division_names, last_synced_at, draft_scoring_profile')
        .eq('id', leagueId)
        .single() as unknown as Promise<{ data: unknown }>,
      // migration 0007 (prize_pool)
      () => db.from('leagues')
        .select('id, name, platform, external_id, abbreviation, prize_pool, division_count, division_term, division_names, last_synced_at')
        .eq('id', leagueId)
        .single() as unknown as Promise<{ data: unknown }>,
      // migration 0004 (abbreviation)
      () => db.from('leagues')
        .select('id, name, platform, external_id, abbreviation, division_count, division_term, division_names, last_synced_at')
        .eq('id', leagueId)
        .single() as unknown as Promise<{ data: unknown }>,
      // migration 0003 (divisions)
      () => db.from('leagues')
        .select('id, name, platform, external_id, division_count, division_term, division_names, last_synced_at')
        .eq('id', leagueId)
        .single() as unknown as Promise<{ data: unknown }>,
      // pre-migration baseline
      () => db.from('leagues')
        .select('id, name, platform, external_id, last_synced_at')
        .eq('id', leagueId)
        .single() as unknown as Promise<{ data: unknown }>,
    ]
    for (const q of queries) {
      const r = await q()
      if (r.data) {
        leagueRaw = r.data as Partial<LeagueRow>
        break
      }
    }
  }
  if (!leagueRaw) throw new Error(`League not found: ${leagueId}`)
  const league: LeagueRow = {
    id: leagueRaw.id!,
    name: leagueRaw.name!,
    platform: leagueRaw.platform!,
    external_id: leagueRaw.external_id!,
    abbreviation: leagueRaw.abbreviation ?? null,
    prize_pool: leagueRaw.prize_pool ?? null,
    division_count: leagueRaw.division_count ?? 0,
    division_term: leagueRaw.division_term ?? 'division',
    division_names: leagueRaw.division_names ?? [],
    last_synced_at: leagueRaw.last_synced_at ?? null,
    draft_scoring_profile: leagueRaw.draft_scoring_profile ?? 'ppr_6pt',
  }

  // First batch: queries that have a direct league_id filter. These are
  // bounded by league size so they're safe to fire in parallel.
  const [
    { data: seasons },
    { data: managers },
  ] = await Promise.all([
    db
      .from('seasons')
      .select('id, year, external_id, champion_manager_id, runner_up_manager_id, regular_season_winner_id, playoff_weeks, is_live, settings')
      .eq('league_id', leagueId)
      .order('year', { ascending: true }),
    db
      .from('managers')
      .select('id, external_id, display_name, team_name, avatar_url, profile_id')
      .eq('league_id', leagueId)
      .then((res) => {
        if (res.error) {
          return db
            .from('managers')
            .select('id, external_id, display_name, team_name, avatar_url')
            .eq('league_id', leagueId)
            .then((r) => ({ data: r.data?.map((m) => ({ ...m, profile_id: null })) ?? null, error: r.error }))
        }
        return res
      }),
  ])

  const seasonIds = new Set((seasons ?? []).map((s) => s.id))
  const seasonIdList = Array.from(seasonIds)
  const managerIds = new Set((managers ?? []).map((m) => m.id))

  // Second batch: matchups + manager_seasons + drafts. These have no
  // league_id column, so they must be filtered by season_id. Bug-fix history:
  // we used to do `from('matchups').select(...)` with no filter and post-
  // filter client-side, but Supabase silently caps each .select() at 1000
  // rows. Once any user had >1000 matchups across all their leagues, the
  // tail of matchups (typically the most-recently-synced league) would
  // disappear entirely from exports. Filter at query time + paginate so we
  // never lose any.
  const [matchupsAll, managerSeasonsAll, draftsAll, weeklyLineupsAll] = await Promise.all([
    seasonIdList.length === 0 ? Promise.resolve([] as MatchupRow[]) : selectAllPaged<MatchupRow>(db, 'matchups',
      'id, season_id, week, manager_a_id, manager_b_id, score_a, score_b, is_playoff, is_championship',
      seasonIdList),
    seasonIdList.length === 0 ? Promise.resolve([] as ManagerSeasonRow[]) : selectManagerSeasonsPaged(db, seasonIdList),
    seasonIdList.length === 0 ? Promise.resolve([] as DraftRow[]) : selectAllPaged<DraftRow>(db, 'drafts',
      'id, season_id, draft_type, rounds',
      seasonIdList),
    seasonIdList.length === 0 ? Promise.resolve([] as WeeklyLineupRow[]) : selectAllPaged<WeeklyLineupRow>(db, 'weekly_lineups',
      'season_id, week, manager_id, player_external_id, player_name, position, nfl_team, slot, is_starter, points, proj_points',
      seasonIdList).catch(() => [] as WeeklyLineupRow[]),
  ])

  // Both queries are already filtered by season_id, but keep the manager
  // check on manager_seasons in case the seeding ever leaves orphan rows.
  const msFiltered = managerSeasonsAll.filter((r) => managerIds.has(r.manager_id))
  const mFiltered = matchupsAll
  const drafts = draftsAll

  // Page through draft_picks — Supabase caps each .select() at 1000 rows by
  // default, and a multi-year league easily exceeds that (e.g. 7 yrs × 12 mgrs
  // × 15 rounds = 1260 picks).
  const draftIds = (drafts ?? []).filter((d) => seasonIds.has(d.season_id)).map((d) => d.id)
  let picks: DraftPickRow[] = []
  if (draftIds.length > 0) {
    const PAGE = 1000
    let from = 0
    for (;;) {
      const { data: chunk } = await db
        .from('draft_picks')
        .select('draft_id, round, pick, manager_id, player_name, position, nfl_team, player_external_id')
        .in('draft_id', draftIds)
        .range(from, from + PAGE - 1)
      const rows = (chunk ?? []) as DraftPickRow[]
      picks = picks.concat(rows)
      if (rows.length < PAGE) break
      from += PAGE
    }
  }

  // Profiles (migration 0006). Pre-migration this returns an error; we degrade gracefully.
  const profilesById = new Map<string, ProfileRow>()
  {
    const { data: profiles } = await db
      .from('manager_profiles')
      .select('id, canonical_name, is_alumni_override, is_hidden')
      .eq('league_id', leagueId)
    for (const p of profiles ?? []) {
      profilesById.set(p.id, p as ProfileRow)
    }
  }

  // Index
  const managersById = new Map<string, ManagerRow>()
  const managersByExternal = new Map<string, ManagerRow>()
  for (const m of managers ?? []) {
    managersById.set(m.id, m as ManagerRow)
    if (m.external_id) managersByExternal.set(m.external_id, m as ManagerRow)
  }

  const msBySeason = groupBy(msFiltered, (r) => r.season_id)
  const msByManager = groupBy(msFiltered, (r) => r.manager_id)

  const matchupsBySeason = groupBy(mFiltered, (r) => r.season_id)
  const matchupsByManager = new Map<string, MatchupRow[]>()
  for (const m of mFiltered) {
    pushTo(matchupsByManager, m.manager_a_id, m)
    pushTo(matchupsByManager, m.manager_b_id, m)
  }

  const draftsBySeason = new Map<string, DraftRow>()
  for (const d of drafts ?? []) {
    if (seasonIds.has(d.season_id)) draftsBySeason.set(d.season_id, d)
  }
  const picksByDraft = groupBy(picks ?? [], (p) => p.draft_id)

  // Rivalries (commissioner-curated). Pre-migration leagues with no rivalries
  // table will just return error → empty array.
  const rivalriesQuery = await db
    .from('rivalries')
    .select('id, name, manager_a_id, manager_b_id, created_at')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: true })
  const rivalries: RivalryRow[] = (rivalriesQuery.data ?? []) as RivalryRow[]

  // Trade participation — join trades + trade_sides so Manager DNA can count
  // trade volume per profile. Pre-0022 leagues return error → empty.
  const tradeParticipation: TradeParticipationRow[] = await (async () => {
    const { data, error } = await db
      .from('trade_sides')
      .select('trade_id, manager_id, trades!inner(season_id, week, status, league_id)')
      .eq('trades.league_id', leagueId)
      .eq('trades.status', 'completed')
    if (error || !data) return []
    type Joined = {
      trade_id: string
      manager_id: string
      trades: { season_id: string; week: number | null } | { season_id: string; week: number | null }[]
    }
    const rows: TradeParticipationRow[] = []
    for (const r of data as Joined[]) {
      const t = Array.isArray(r.trades) ? r.trades[0] : r.trades
      if (!t || !seasonIds.has(t.season_id)) continue
      rows.push({
        trade_id: r.trade_id,
        season_id: t.season_id,
        week: t.week,
        manager_id: r.manager_id,
      })
    }
    return rows
  })()

  return {
    league: league as LeagueRow,
    seasons: (seasons ?? []) as SeasonRow[],
    managers: managersById,
    managerByExternal: managersByExternal,
    profilesById,
    managerSeasonsBySeason: msBySeason,
    managerSeasonsByManager: msByManager,
    finalRankByMgrSeason: (() => {
      const m = new Map<string, number | null>()
      for (const r of msFiltered) m.set(`${r.season_id}|${r.manager_id}`, r.final_rank ?? null)
      return m
    })(),
    matchupsBySeason,
    matchupsByManager,
    draftsBySeason,
    picksByDraft,
    rivalries,
    weeklyLineupsBySeason: groupBy(weeklyLineupsAll, (r) => r.season_id),
    tradeParticipationByManager: groupBy(tradeParticipation, (r) => r.manager_id),
  }
}

// ============================================================
// Helpers
// ============================================================

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const r of rows) pushTo(out, key(r), r)
  return out
}

// Supabase silently caps every .select() at 1000 rows by default. For tables
// that can exceed that (matchups especially, but also drafts and ms across
// the whole DB), paginate explicitly so we never lose the tail. Filter by
// season_id IN (...) so we only download rows for the league being exported.
async function selectAllPaged<T>(
  db: ReturnType<typeof createAdminClient>,
  table: 'matchups' | 'drafts' | 'weekly_lineups',
  columns: string,
  seasonIds: string[],
): Promise<T[]> {
  const out: T[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .in('season_id', seasonIds)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`${table} paged select: ${error.message}`)
    const rows = (data ?? []) as unknown as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

// manager_seasons has a fallback for pre-0003 databases without division_index.
// Keep that fallback logic but apply the season_id filter + pagination first.
async function selectManagerSeasonsPaged(
  db: ReturnType<typeof createAdminClient>,
  seasonIds: string[],
): Promise<ManagerSeasonRow[]> {
  const out: ManagerSeasonRow[] = []
  const PAGE = 1000
  const columnsWithDiv = 'season_id, manager_id, team_name, avatar_url, wins, losses, ties, points_for, points_against, final_rank, regular_rank, division_index'
  const columnsNoDiv = 'season_id, manager_id, team_name, avatar_url, wins, losses, ties, points_for, points_against, final_rank, regular_rank'
  let from = 0
  let useDivision = true
  for (;;) {
    const { data, error } = await db
      .from('manager_seasons')
      .select(useDivision ? columnsWithDiv : columnsNoDiv)
      .in('season_id', seasonIds)
      .range(from, from + PAGE - 1)
    if (error) {
      if (useDivision) {
        // First page failed — probably pre-migration DB without division_index.
        useDivision = false
        from = 0
        continue
      }
      throw new Error(`manager_seasons paged select: ${error.message}`)
    }
    const rows = (data ?? []) as unknown as Omit<ManagerSeasonRow, 'division_index'>[]
    for (const r of rows) {
      out.push(useDivision ? (r as ManagerSeasonRow) : { ...r, division_index: null } as ManagerSeasonRow)
    }
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

function pushTo<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const arr = m.get(k)
  if (arr) arr.push(v)
  else m.set(k, [v])
}

// Sleeper user IDs are snowflakes — 19 digits, larger than JS safe-int.
// Keep them as strings end-to-end so they survive JSON round-trips and URL
// paths (managers/<id>.json) without precision loss.
function userId(m: ManagerRow | undefined): string | null {
  return m?.external_id ?? null
}

function recordStr(w: number, l: number, t: number): string {
  return `${w}-${l}-${t}`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// Walk seasons newest-first and return the most recent one with at least one
// manager_seasons row. We use this — not just `s.seasons[last]` — to define
// "current members": a synced-but-empty season (e.g. NFL 2025 mid-year when
// the history page isn't populated yet) shouldn't classify everyone as alumni.
function latestSeasonWithData(s: Snapshot): SeasonRow | undefined {
  for (let i = s.seasons.length - 1; i >= 0; i--) {
    const sn = s.seasons[i]
    if ((s.managerSeasonsBySeason.get(sn.id) ?? []).length > 0) return sn
  }
  return undefined
}

function currentManagerIdSet(s: Snapshot): Set<string> {
  const sn = latestSeasonWithData(s)
  if (!sn) return new Set()
  return new Set((s.managerSeasonsBySeason.get(sn.id) ?? []).map((r) => r.manager_id))
}

// Is this a championship-bracket playoff game (vs a consolation / placement game)?
// Rule: at least one participant's final_rank must be ≤ 4 (champ/3rd-place track).
// This cleanly separates round-1, semis, final, and 3rd-place games (where the
// winner advances to top 4 / loser was a top-4 finisher) from 5th/7th-place
// games (where both participants finish 5+).
function isChampionshipBracketGame(s: Snapshot, gm: ManagerGame): boolean {
  if (!gm.is_playoff) return false
  const selfRank = s.finalRankByMgrSeason.get(`${gm.season_id}|${gm.self_id}`) ?? null
  const oppRank = s.finalRankByMgrSeason.get(`${gm.season_id}|${gm.opp_id}`) ?? null
  return (selfRank != null && selfRank <= 4) || (oppRank != null && oppRank <= 4)
}

// Did the manager make this season's playoffs? Authoritative answer: their
// final_rank is within the season's playoff_team_count. Falls back to "had
// any playoff matchup" only when the season is missing playoff_team_count
// (older Sleeper/Yahoo data) — NFL.com schedules every team in the playoff
// weeks (consolation bracket), so without the rank check everyone gets credit
// for an appearance every year.
function madePlayoffs(season: SeasonRow, finalRank: number | null, hadPlayoffMatchup: boolean): boolean {
  const ptc = season.settings?.playoff_team_count
  const teamCount = typeof ptc === 'number' && ptc > 0 ? ptc : null
  if (teamCount != null) {
    return finalRank != null && finalRank <= teamCount
  }
  return hadPlayoffMatchup
}


// ============================================================
// Profile groups — one entry per real person after merging.
// A merged profile has multiple platform identities (managers) under it; all
// their manager_seasons + matchups roll up into one career total.
// Pre-migration leagues (or managers with profile_id=null) get a 1:1 group.
// ============================================================
type ProfileGroup = {
  profile: ProfileRow | null
  primary: ManagerRow              // chosen identity for URL key + fallback display
  managers: ManagerRow[]           // every platform identity in this profile
  managerIds: Set<string>          // fast inclusion check for matchups
}

function pickPrimary(s: Snapshot, mgrs: ManagerRow[]): ManagerRow {
  // Most-recently-active identity wins; break ties by external_id alphabetical.
  let best = mgrs[0]
  let bestYear = -Infinity
  for (const m of mgrs) {
    const mss = s.managerSeasonsByManager.get(m.id) ?? []
    const yr = mss.reduce((acc, ms) => {
      const y = s.seasons.find((sn) => sn.id === ms.season_id)?.year ?? 0
      return y > acc ? y : acc
    }, 0)
    if (yr > bestYear || (yr === bestYear && (m.external_id ?? '') < (best.external_id ?? ''))) {
      bestYear = yr
      best = m
    }
  }
  return best
}

function buildProfileGroups(s: Snapshot): ProfileGroup[] {
  const byProfile = new Map<string, ManagerRow[]>()
  const orphans: ManagerRow[] = []
  for (const m of s.managers.values()) {
    if (m.profile_id) {
      const arr = byProfile.get(m.profile_id) ?? []
      arr.push(m)
      byProfile.set(m.profile_id, arr)
    } else {
      orphans.push(m)
    }
  }
  const groups: ProfileGroup[] = []
  for (const [pid, mgrs] of byProfile) {
    groups.push({
      profile: s.profilesById.get(pid) ?? null,
      primary: pickPrimary(s, mgrs),
      managers: mgrs,
      managerIds: new Set(mgrs.map((m) => m.id)),
    })
  }
  for (const m of orphans) {
    groups.push({
      profile: null,
      primary: m,
      managers: [m],
      managerIds: new Set([m.id]),
    })
  }
  return groups
}

function isGroupHidden(g: ProfileGroup): boolean {
  return g.profile?.is_hidden ?? false
}

function groupDisplayName(g: ProfileGroup): string {
  return g.profile?.canonical_name ?? g.primary.display_name
}

function isGroupCurrent(g: ProfileGroup, autoCurrent: Set<string>): boolean {
  const override = g.profile?.is_alumni_override
  if (override === true) return false
  if (override === false) return true
  for (const mid of g.managerIds) if (autoCurrent.has(mid)) return true
  return false
}

// Build a map: any manager.id → that manager's ProfileGroup. Used so opponents
// in h2h / matchup links can be resolved to the canonical profile.
function buildManagerToGroup(groups: ProfileGroup[]): Map<string, ProfileGroup> {
  const out = new Map<string, ProfileGroup>()
  for (const g of groups) {
    for (const m of g.managers) out.set(m.id, g)
  }
  return out
}

// "for" view of a matchup from manager X's perspective.
type ManagerGame = {
  season_id: string
  week: number
  is_playoff: boolean
  is_championship: boolean
  self_id: string
  opp_id: string
  self_score: number
  opp_score: number
  result: 'W' | 'L' | 'T'
  margin: number
}

function asManagerGame(m: MatchupRow, self: string): ManagerGame | null {
  if (m.score_a == null || m.score_b == null) return null
  const isA = m.manager_a_id === self
  const selfScore = isA ? Number(m.score_a) : Number(m.score_b)
  const oppScore = isA ? Number(m.score_b) : Number(m.score_a)
  const oppId = isA ? m.manager_b_id : m.manager_a_id
  let result: 'W' | 'L' | 'T' = 'T'
  if (selfScore > oppScore) result = 'W'
  else if (selfScore < oppScore) result = 'L'
  return {
    season_id: m.season_id,
    week: m.week,
    is_playoff: m.is_playoff,
    is_championship: m.is_championship,
    self_id: self,
    opp_id: oppId,
    self_score: selfScore,
    opp_score: oppScore,
    result,
    margin: round2(selfScore - oppScore),
  }
}

// ============================================================
// File builders
// ============================================================

function buildLeagueJson(s: Snapshot): unknown {
  // `years` keeps every season for founding-year + ticker date range, but
  // `completedYears` excludes the in-progress live season so counts like
  // total_seasons / "X seasons played" only reflect finished years.
  const years = s.seasons.map((r) => r.year)
  const completedYears = s.seasons.filter((r) => !r.is_live).map((r) => r.year)
  const currentSeason = years[years.length - 1] ?? 0
  const currentSeasonRow = latestSeasonWithData(s) ?? null
  // Count only games that actually count toward the record: every regular-season
  // game + every championship-bracket playoff game. Consolation/placement games
  // are still in the matchups table but excluded here so this number lines up
  // with the standings page math.
  let totalMatchups = 0
  for (const arr of s.matchupsBySeason.values()) {
    for (const m of arr) {
      if (!m.is_playoff) {
        totalMatchups++
        continue
      }
      const aRank = s.finalRankByMgrSeason.get(`${m.season_id}|${m.manager_a_id}`) ?? null
      const bRank = s.finalRankByMgrSeason.get(`${m.season_id}|${m.manager_b_id}`) ?? null
      if ((aRank != null && aRank <= 4) || (bRank != null && bRank <= 4)) totalMatchups++
    }
  }

  // Current vs former, counted by profile (so merged identities = one person).
  const autoCurrent = currentManagerIdSet(s)
  let currentMembers = 0
  let formerMembers = 0
  for (const g of buildProfileGroups(s)) {
    if (isGroupHidden(g)) continue
    if (isGroupCurrent(g, autoCurrent)) currentMembers++
    else formerMembers++
  }

  // Defending champion = most recent season that actually has a crowned
  // champion. Stays in place once that season ends, all the way through
  // the next year, until the new season's champion_manager_id is set.
  let defendingChampion: Record<string, unknown> | null = null
  let defendingRow: SeasonRow | null = null
  for (let i = s.seasons.length - 1; i >= 0; i--) {
    if (s.seasons[i].champion_manager_id) {
      defendingRow = s.seasons[i]
      break
    }
  }
  if (defendingRow?.champion_manager_id) {
    const mgr = s.managers.get(defendingRow.champion_manager_id)
    const ms = (s.managerSeasonsBySeason.get(defendingRow.id) ?? []).find((r) => r.manager_id === defendingRow!.champion_manager_id)
    const champGroup = buildManagerToGroup(buildProfileGroups(s)).get(defendingRow.champion_manager_id)
    // Career championship count for the same profile group (counts wins by
    // any merged identity, so "Mason" gets credit even if their team was
    // named differently in an earlier title year).
    let championshipCount = 0
    const champYears: number[] = []
    if (champGroup) {
      for (const sn of s.seasons) {
        if (sn.champion_manager_id && champGroup.managerIds.has(sn.champion_manager_id)) {
          championshipCount++
          champYears.push(sn.year)
        }
      }
    } else if (defendingRow.champion_manager_id) {
      for (const sn of s.seasons) {
        if (sn.champion_manager_id === defendingRow.champion_manager_id) {
          championshipCount++
          champYears.push(sn.year)
        }
      }
    }
    if (mgr && ms && !(champGroup && isGroupHidden(champGroup))) {
      // Championship-game summary: the is_championship match where this
      // manager played. Drives the "Beat X · 142-118" stat in the sidebar.
      const seasonMatches = s.matchupsBySeason.get(defendingRow.id) ?? []
      const titleGame = seasonMatches.find((m) => m.is_championship &&
        (m.manager_a_id === defendingRow!.champion_manager_id || m.manager_b_id === defendingRow!.champion_manager_id))
      let title_opponent_name: string | null = null
      let title_score_for: number | null = null
      let title_score_against: number | null = null
      if (titleGame && titleGame.score_a != null && titleGame.score_b != null) {
        const isA = titleGame.manager_a_id === defendingRow.champion_manager_id
        const oppId = isA ? titleGame.manager_b_id : titleGame.manager_a_id
        const oppMgr = s.managers.get(oppId)
        const oppGroup = buildManagerToGroup(buildProfileGroups(s)).get(oppId)
        title_opponent_name = oppGroup ? groupDisplayName(oppGroup) : (oppMgr?.display_name ?? null)
        title_score_for = round2(Number(isA ? titleGame.score_a : titleGame.score_b))
        title_score_against = round2(Number(isA ? titleGame.score_b : titleGame.score_a))
      }
      const games = ms.wins + ms.losses + ms.ties
      const pf = Number(ms.points_for)
      defendingChampion = {
        year: defendingRow.year,
        team_name: ms.team_name ?? mgr.team_name ?? mgr.display_name,
        owner_name: champGroup ? groupDisplayName(champGroup) : mgr.display_name,
        owner_user_id: userId(champGroup?.primary ?? mgr),
        record: recordStr(ms.wins, ms.losses, ms.ties),
        points_for: round2(pf),
        points_against: round2(Number(ms.points_against)),
        ppg: games > 0 ? round2(pf / games) : 0,
        regular_rank: ms.regular_rank,
        title_opponent_name,
        title_score_for,
        title_score_against,
        championship_count: championshipCount,
        championship_years: champYears.slice().sort((a, b) => a - b),
      }
    }
  }

  return {
    name: s.league.name,
    abbreviation: s.league.abbreviation?.trim() || abbreviate(s.league.name),
    prize_pool: s.league.prize_pool?.trim() || null,
    founded: years[0] ?? currentSeason,
    current_season: currentSeason,
    total_matchups: totalMatchups,
    total_seasons: completedYears.length,
    current_members_count: currentMembers,
    former_members_count: formerMembers,
    all_seasons: years,
    defending_champion: defendingChampion,
    draft_scoring_profile: s.league.draft_scoring_profile,
  }
}

function abbreviate(name: string): string {
  const initials = name
    .replace(/[^A-Za-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return initials || name.slice(0, 4).toUpperCase()
}

function buildSeasonsDirectory(s: Snapshot): unknown {
  const managerToGroup = buildManagerToGroup(buildProfileGroups(s))
  // Hide in-progress seasons from the public season archive. Two cases:
  //   • explicitly flagged is_live (set by the commish during the season)
  //   • no champion_manager_id yet (the year exists on Sleeper/ESPN because
  //     the league shell is created pre-draft, but no title's been won) —
  //     without this guard, the archive page badges that year as "Reigning
  //     Champion" since it picks the latest year present.
  return {
    seasons: s.seasons.filter((season) => !season.is_live && season.champion_manager_id != null).map((season) => {
      const champ = season.champion_manager_id ? s.managers.get(season.champion_manager_id) : null
      const champGroup = season.champion_manager_id ? managerToGroup.get(season.champion_manager_id) : undefined
      const champMs = champ
        ? (s.managerSeasonsBySeason.get(season.id) ?? []).find((r) => r.manager_id === champ.id)
        : null
      const standings = s.managerSeasonsBySeason.get(season.id) ?? []
      const champHidden = champGroup ? isGroupHidden(champGroup) : false
      const champRecord = champMs && !champHidden
        ? `${champMs.wins}-${champMs.losses}${champMs.ties ? `-${champMs.ties}` : ''}`
        : null
      const champPF = champMs && !champHidden ? round2(Number(champMs.points_for)) : null
      return {
        year: season.year,
        champion_name: champHidden ? null : (champGroup ? groupDisplayName(champGroup) : champ?.display_name ?? null),
        champion_team_name: champHidden ? null : (champMs?.team_name ?? champ?.team_name ?? null),
        champion_user_id: champHidden ? null : userId(champGroup?.primary ?? champ ?? undefined),
        champion_record: champRecord,
        champion_points_for: champPF,
        total_teams: standings.length,
        has_complete_data: standings.length > 0,
      }
    }),
  }
}

function buildDraftsDirectory(s: Snapshot): unknown {
  const out: Array<{ year: number; total_picks: number; rounds: number }> = []
  for (const season of s.seasons) {
    const draft = s.draftsBySeason.get(season.id)
    if (!draft) continue
    const picks = s.picksByDraft.get(draft.id) ?? []
    if (picks.length === 0) continue
    out.push({ year: season.year, total_picks: picks.length, rounds: draft.rounds ?? 0 })
  }
  return { drafts: out }
}

function buildSeasonFile(s: Snapshot, season: SeasonRow): unknown {
  // Resolve a manager.id to (its profile group's display name, its profile group's
  // primary external_id, hidden?). Used so links + names go through the canonical
  // profile after merges, and hidden profiles disappear from season rosters.
  const groups = buildProfileGroups(s)
  const managerToGroup = buildManagerToGroup(groups)
  const resolveByManagerId = (mid: string | null | undefined) => {
    if (!mid) return null
    const g = managerToGroup.get(mid)
    if (!g) return null
    return { group: g, primary: g.primary, name: groupDisplayName(g), hidden: isGroupHidden(g) }
  }

  const ms = (s.managerSeasonsBySeason.get(season.id) ?? []).slice()
  const standings = ms
    .map((row) => {
      const mgr = s.managers.get(row.manager_id)
      const resolved = resolveByManagerId(row.manager_id)
      if (resolved?.hidden) return null
      const total = row.wins + row.losses + row.ties
      const division =
        row.division_index != null && row.division_index < s.league.division_names.length
          ? s.league.division_names[row.division_index]
          : null
      return {
        final_rank: row.final_rank ?? null,
        reg_season_rank: row.regular_rank ?? null,
        team_name: row.team_name ?? mgr?.team_name ?? resolved?.name ?? null,
        owner_name: resolved?.name ?? mgr?.display_name ?? null,
        owner_user_id: userId(resolved?.primary ?? mgr),
        division,
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
        win_pct: total > 0 ? round4(row.wins / total) : 0,
        points_for: round2(Number(row.points_for)),
        points_against: round2(Number(row.points_against)),
      }
    })
    .filter((r): r is NonNullable<typeof r> => r != null)
    .sort((a, b) => {
      if (a.final_rank != null && b.final_rank != null) return a.final_rank - b.final_rank
      if (a.reg_season_rank != null && b.reg_season_rank != null) return a.reg_season_rank - b.reg_season_rank
      if (b.wins !== a.wins) return b.wins - a.wins
      return b.points_for - a.points_for
    })

  const champ = season.champion_manager_id ? s.managers.get(season.champion_manager_id) : null
  const champMs = champ ? ms.find((r) => r.manager_id === champ.id) : null
  const champResolved = resolveByManagerId(season.champion_manager_id)
  const runnerUp = season.runner_up_manager_id ? s.managers.get(season.runner_up_manager_id) : null
  const runnerUpMs = runnerUp ? ms.find((r) => r.manager_id === runnerUp.id) : null
  const runnerUpResolved = resolveByManagerId(season.runner_up_manager_id)
  const thirdPlace = deriveThirdPlace(s, season, resolveByManagerId)

  return {
    year: season.year,
    total_teams: standings.length,
    champion: champ && champMs && !champResolved?.hidden
      ? {
          team_name: champMs.team_name ?? champ.team_name ?? champResolved?.name ?? champ.display_name,
          owner_name: champResolved?.name ?? champ.display_name,
          owner_user_id: userId(champResolved?.primary ?? champ),
          record: recordStr(champMs.wins, champMs.losses, champMs.ties),
          points_for: round2(Number(champMs.points_for)),
        }
      : null,
    runner_up: runnerUp && runnerUpMs && !runnerUpResolved?.hidden
      ? {
          team_name: runnerUpMs.team_name ?? runnerUp.team_name ?? runnerUpResolved?.name ?? runnerUp.display_name,
          owner_name: runnerUpResolved?.name ?? runnerUp.display_name,
          owner_user_id: userId(runnerUpResolved?.primary ?? runnerUp),
        }
      : null,
    third_place: thirdPlace,
    standings,
  }
}

// Third-place game: the playoff-week matchup that is NOT the championship,
// and whose week is the same as the championship week. Winner = third place.
function deriveThirdPlace(
  s: Snapshot,
  season: SeasonRow,
  resolveByManagerId: (mid: string | null | undefined) => { primary: ManagerRow; name: string; hidden: boolean } | null,
): Record<string, unknown> | null {
  const matchups = s.matchupsBySeason.get(season.id) ?? []
  const champGame = matchups.find((m) => m.is_championship)
  if (!champGame) return null
  const thirdGame = matchups.find(
    (m) => m.week === champGame.week && m.is_playoff && !m.is_championship
  )
  if (!thirdGame || thirdGame.score_a == null || thirdGame.score_b == null) return null
  const winnerId =
    Number(thirdGame.score_a) > Number(thirdGame.score_b) ? thirdGame.manager_a_id : thirdGame.manager_b_id
  const winner = s.managers.get(winnerId)
  if (!winner) return null
  const resolved = resolveByManagerId(winnerId)
  if (resolved?.hidden) return null
  const ms = (s.managerSeasonsBySeason.get(season.id) ?? []).find((r) => r.manager_id === winnerId)
  return {
    team_name: ms?.team_name ?? winner.team_name ?? resolved?.name ?? winner.display_name,
    owner_name: resolved?.name ?? winner.display_name,
    owner_user_id: userId(resolved?.primary ?? winner),
  }
}

function buildDraftFile(s: Snapshot, season: SeasonRow): unknown | null {
  const draft = s.draftsBySeason.get(season.id)
  if (!draft) return null
  const picks = s.picksByDraft.get(draft.id) ?? []
  if (picks.length === 0) return null
  const ms = s.managerSeasonsBySeason.get(season.id) ?? []
  const teamNameByManager = new Map<string, string | null>()
  for (const r of ms) teamNameByManager.set(r.manager_id, r.team_name)
  const rounds = draft.rounds ?? Math.ceil(picks.length / Math.max(1, ms.length))

  // Resolve each pick's manager through its profile group so a renamed profile
  // (manager_profiles.canonical_name) propagates to draft history without a
  // re-sync. Without this, the old platform display_name sticks around.
  const managerToGroup = buildManagerToGroup(buildProfileGroups(s))

  // Build a final-rank map keyed by canonical manager_name so the draft
  // history page can pair "where I drafted" with "where I finished" without
  // a second fetch. Null for in-progress seasons / unranked teams.
  const finishesByName: Record<string, number | null> = {}
  for (const r of ms) {
    const mgr = s.managers.get(r.manager_id)
    if (!mgr) continue
    const group = managerToGroup.get(mgr.id)
    const key = group ? groupDisplayName(group) : mgr.display_name
    if (!key) continue
    // If two platform identities map to the same canonical group, prefer the
    // one that actually has a rank set rather than overwriting with a null.
    if (finishesByName[key] != null && r.final_rank == null) continue
    finishesByName[key] = r.final_rank ?? null
  }

  const sorted = [...picks].sort((a, b) => a.pick - b.pick)
  return {
    year: season.year,
    picks: sorted.map((p) => {
      const mgr = p.manager_id ? s.managers.get(p.manager_id) : null
      const group = mgr ? managerToGroup.get(mgr.id) : undefined
      const canonicalName = group ? groupDisplayName(group) : (mgr?.display_name ?? null)
      const teamsPerRound = Math.max(1, ms.length)
      const round_pick = ((p.pick - 1) % teamsPerRound) + 1
      return {
        overall_pick: p.pick,
        round: p.round,
        round_pick,
        player_id: p.player_external_id,
        player_name: p.player_name,
        position: p.position,
        nfl_team: p.nfl_team,
        team_name: mgr ? teamNameByManager.get(mgr.id) ?? mgr.team_name ?? canonicalName : null,
        manager_name: canonicalName,
        user_id: userId(group?.primary ?? mgr ?? undefined),
      }
    }),
    finishes: finishesByName,
    team_count: ms.length,
    _rounds: rounds, // unused by pams but handy when debugging shape diffs
  }
}

// ============================================================
// Per-manager aggregates
// ============================================================

type ManagerAggregate = {
  seasons_played: number
  total_games: number
  championships: number
  championship_seasons: number[]
  top_three_finishes: number
  playoff_appearances: number
  reg_wins: number
  reg_losses: number
  reg_ties: number
  reg_pf: number
  reg_pa: number
  playoff_wins: number
  playoff_losses: number
  playoff_ties: number
  playoff_pf: number
  playoff_pa: number
  high_score: number
  low_score: number
  total_pf_all: number
  longest_win_streak: { length: number; when: string } | null
  longest_loss_streak: { length: number; when: string } | null
}

function aggregateProfile(s: Snapshot, g: ProfileGroup): ManagerAggregate {
  // Exclude any season currently flagged is_live — career standings and
  // "seasons played" counts should only reflect COMPLETED seasons. Partial
  // 2026 wins/losses skew everything if included before the season ends.
  const liveSeasonIds = new Set(
    s.seasons.filter((sn) => sn.is_live).map((sn) => sn.id)
  )

  // Union manager_seasons across all platform identities in this profile.
  const mss: ManagerSeasonRow[] = []
  for (const mid of g.managerIds) {
    const rows = s.managerSeasonsByManager.get(mid)
    if (rows) {
      for (const r of rows) {
        if (!liveSeasonIds.has(r.season_id)) mss.push(r)
      }
    }
  }
  // Union matchups too. A single matchup row might be in multiple managerIds'
  // entries (impossible per current schema since each manager is one side),
  // so dedup by season_id+week+a+b to be safe.
  const seenMatchup = new Set<string>()
  const games: ManagerGame[] = []
  for (const mid of g.managerIds) {
    const matchups = s.matchupsByManager.get(mid) ?? []
    for (const m of matchups) {
      if (liveSeasonIds.has(m.season_id)) continue
      const key = `${m.season_id}|${m.week}|${m.manager_a_id}|${m.manager_b_id}`
      if (seenMatchup.has(key)) continue
      seenMatchup.add(key)
      const game = asManagerGame(m, mid)
      if (game) games.push(game)
    }
  }
  games.sort((a, b) => {
    const ya = s.seasons.find((sn) => sn.id === a.season_id)?.year ?? 0
    const yb = s.seasons.find((sn) => sn.id === b.season_id)?.year ?? 0
    if (ya !== yb) return ya - yb
    return a.week - b.week
  })

  // Playoff games count toward record only if part of the championship bracket
  // (anyone playing for top-4 placement). 5th/7th-place placement games are
  // tracked in matchups but excluded from the playoff record AND from career
  // PF / high / low — so avg PPG = total_pf_all / total_games stays consistent.
  let reg_wins = 0, reg_losses = 0, reg_ties = 0, reg_pf = 0, reg_pa = 0
  let playoff_wins = 0, playoff_losses = 0, playoff_ties = 0, playoff_pf = 0, playoff_pa = 0
  let high_score = -Infinity, low_score = Infinity
  let total_pf_all = 0

  for (const gm of games) {
    if (gm.is_playoff && !isChampionshipBracketGame(s, gm)) continue  // skip 5th/7th-place games
    total_pf_all += gm.self_score
    if (gm.self_score > high_score) high_score = gm.self_score
    if (gm.self_score < low_score) low_score = gm.self_score
    if (gm.is_playoff) {
      playoff_pf += gm.self_score
      playoff_pa += gm.opp_score
      if (gm.result === 'W') playoff_wins++
      else if (gm.result === 'L') playoff_losses++
      else playoff_ties++
    } else {
      reg_pf += gm.self_score
      reg_pa += gm.opp_score
      if (gm.result === 'W') reg_wins++
      else if (gm.result === 'L') reg_losses++
      else reg_ties++
    }
  }

  const championship_seasons: number[] = []
  let top_three_finishes = 0
  let playoff_appearances = 0
  for (const ms of mss) {
    const season = s.seasons.find((sn) => sn.id === ms.season_id)
    if (!season) continue
    if (season.champion_manager_id != null && g.managerIds.has(season.champion_manager_id)) {
      championship_seasons.push(season.year)
    }
    if (ms.final_rank != null && ms.final_rank <= 3) top_three_finishes++
    const hadPlayoff = (s.matchupsBySeason.get(season.id) ?? []).some(
      (m) => m.is_playoff && (g.managerIds.has(m.manager_a_id) || g.managerIds.has(m.manager_b_id))
    )
    if (madePlayoffs(season, ms.final_rank, hadPlayoff)) playoff_appearances++
  }

  const { longestWin, longestLoss } = computeStreaks(games, s)

  return {
    seasons_played: mss.length,
    total_games: games.length,
    championships: championship_seasons.length,
    championship_seasons: championship_seasons.sort((a, b) => a - b),
    top_three_finishes,
    playoff_appearances,
    reg_wins, reg_losses, reg_ties,
    reg_pf: round2(reg_pf),
    reg_pa: round2(reg_pa),
    playoff_wins, playoff_losses, playoff_ties,
    playoff_pf: round2(playoff_pf),
    playoff_pa: round2(playoff_pa),
    high_score: high_score === -Infinity ? 0 : round2(high_score),
    low_score: low_score === Infinity ? 0 : round2(low_score),
    total_pf_all: round2(total_pf_all),
    longest_win_streak: longestWin,
    longest_loss_streak: longestLoss,
  }
}

function computeStreaks(
  games: ManagerGame[],
  s: Snapshot
): { longestWin: { length: number; when: string } | null; longestLoss: { length: number; when: string } | null } {
  let bestW = 0, bestWStart = -1, bestWEnd = -1
  let bestL = 0, bestLStart = -1, bestLEnd = -1
  let curW = 0, curWStart = -1
  let curL = 0, curLStart = -1
  for (let i = 0; i < games.length; i++) {
    const g = games[i]
    if (g.result === 'W') {
      if (curW === 0) curWStart = i
      curW++
      curL = 0
      if (curW > bestW) {
        bestW = curW
        bestWStart = curWStart
        bestWEnd = i
      }
    } else if (g.result === 'L') {
      if (curL === 0) curLStart = i
      curL++
      curW = 0
      if (curL > bestL) {
        bestL = curL
        bestLStart = curLStart
        bestLEnd = i
      }
    } else {
      curW = 0
      curL = 0
    }
  }
  const fmt = (start: number, end: number): string => {
    const a = games[start], b = games[end]
    const ya = s.seasons.find((sn) => sn.id === a.season_id)?.year
    const yb = s.seasons.find((sn) => sn.id === b.season_id)?.year
    return `W${a.week} ${ya} → W${b.week} ${yb}`
  }
  return {
    longestWin: bestW > 0 ? { length: bestW, when: fmt(bestWStart, bestWEnd) } : null,
    longestLoss: bestL > 0 ? { length: bestL, when: fmt(bestLStart, bestLEnd) } : null,
  }
}

function buildManagersDirectory(s: Snapshot): unknown {
  const autoCurrent = currentManagerIdSet(s)

  // Most-recent avatar_url across a profile group's identities, newest season
  // first — same walk as the milestones builder's avatarFor.
  const directoryAvatar = (g: ProfileGroup): string => {
    for (let i = s.seasons.length - 1; i >= 0; i--) {
      const mss = s.managerSeasonsBySeason.get(s.seasons[i].id) ?? []
      for (const ms of mss) {
        if (g.managerIds.has(ms.manager_id) && ms.avatar_url) return ms.avatar_url
      }
    }
    for (const m of g.managers) if (m.avatar_url) return m.avatar_url
    return ''
  }

  const managers = buildProfileGroups(s)
    .filter((g) => !isGroupHidden(g))
    .map((g) => {
      const agg = aggregateProfile(s, g)
      const totalGames = agg.reg_wins + agg.reg_losses + agg.reg_ties + agg.playoff_wins + agg.playoff_losses + agg.playoff_ties
      const wins = agg.reg_wins + agg.playoff_wins
      const losses = agg.reg_losses + agg.playoff_losses
      const ties = agg.reg_ties + agg.playoff_ties
      // team_latest: from the most recent manager_season across all platform identities in this profile.
      const allMs: ManagerSeasonRow[] = []
      for (const mid of g.managerIds) allMs.push(...(s.managerSeasonsByManager.get(mid) ?? []))
      const lastMs = allMs
        .slice()
        .sort((a, b) => {
          const ya = s.seasons.find((sn) => sn.id === a.season_id)?.year ?? 0
          const yb = s.seasons.find((sn) => sn.id === b.season_id)?.year ?? 0
          return yb - ya
        })[0]
      // Average final finish across completed seasons that have a rank.
      const liveIds = new Set(s.seasons.filter((sn) => sn.is_live).map((sn) => sn.id))
      const ranks = allMs
        .filter((ms) => !liveIds.has(ms.season_id) && ms.final_rank != null)
        .map((ms) => ms.final_rank as number)
      const avg_finish = ranks.length
        ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10
        : null
      const name = groupDisplayName(g)
      return {
        avatar: directoryAvatar(g),
        reg_record: recordStr(agg.reg_wins, agg.reg_losses, agg.reg_ties),
        playoff_record: recordStr(agg.playoff_wins, agg.playoff_losses, agg.playoff_ties),
        reg_win_pct: (agg.reg_wins + agg.reg_losses + agg.reg_ties) > 0
          ? round4(agg.reg_wins / (agg.reg_wins + agg.reg_losses + agg.reg_ties))
          : 0,
        playoff_wins: agg.playoff_wins,
        avg_finish,
        ppg: totalGames > 0 ? Math.round((agg.total_pf_all / totalGames) * 100) / 100 : 0,
        user_id: userId(g.primary),
        name,
        nfl_display_name: g.primary.display_name,
        team_latest: lastMs?.team_name ?? g.primary.team_name ?? name,
        is_current: isGroupCurrent(g, autoCurrent),
        seasons_played: agg.seasons_played,
        wins,
        losses,
        ties,
        total_record: recordStr(wins, losses, ties),
        win_pct: totalGames > 0 ? round4(wins / totalGames) : 0,
        total_pf: agg.total_pf_all,
        championships: agg.championships,
        championship_seasons: agg.championship_seasons,
        top_three_finishes: agg.top_three_finishes,
        playoff_appearances: agg.playoff_appearances,
      }
    })
    .sort((a, b) => {
      // current first, then by wins desc, then by win_pct desc
      if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
      if (b.wins !== a.wins) return b.wins - a.wins
      return b.win_pct - a.win_pct
    })

  return { managers }
}

function buildManagerFile(s: Snapshot, g: ProfileGroup): unknown {
  const manager = g.primary
  const agg = aggregateProfile(s, g)

  // Union manager_seasons across all platform identities in the profile.
  const allMss: ManagerSeasonRow[] = []
  for (const mid of g.managerIds) allMss.push(...(s.managerSeasonsByManager.get(mid) ?? []))
  const mss = allMss.slice().sort((a, b) => {
    const ya = s.seasons.find((sn) => sn.id === a.season_id)?.year ?? 0
    const yb = s.seasons.find((sn) => sn.id === b.season_id)?.year ?? 0
    return ya - yb
  })

  const totalGames = agg.reg_wins + agg.reg_losses + agg.reg_ties + agg.playoff_wins + agg.playoff_losses + agg.playoff_ties
  const totalReg = agg.reg_wins + agg.reg_losses + agg.reg_ties
  const totalPlayoff = agg.playoff_wins + agg.playoff_losses + agg.playoff_ties

  // season_ledger: per-year breakdown — one row per manager_season row in the
  // union. If a person played as different platform identities in different
  // years, each year still shows correctly because manager_seasons is keyed by
  // (season, manager).
  const season_ledger = mss.map((ms) => {
    const season = s.seasons.find((sn) => sn.id === ms.season_id)!
    // Games for this season where any of the profile's identities played.
    const games = (s.matchupsBySeason.get(season.id) ?? [])
      .flatMap((m) => {
        for (const mid of g.managerIds) {
          if (m.manager_a_id === mid || m.manager_b_id === mid) {
            const game = asManagerGame(m, mid)
            return game ? [game] : []
          }
        }
        return []
      })
    let high = -Infinity, low = Infinity, highWeek: number | null = null
    let playoff_pf = 0, playoff_wins = 0, playoff_losses = 0, playoff_ties = 0, playoff_games = 0
    let total_pf = 0
    let counted_games = 0
    for (const g of games) {
      // Skip 5th/7th-place placement games — they exist in matchups but
      // shouldn't inflate the year's PF or avg PPG.
      if (g.is_playoff && !isChampionshipBracketGame(s, g)) continue
      total_pf += g.self_score
      counted_games++
      if (g.self_score > high) { high = g.self_score; highWeek = g.week }
      if (g.self_score < low) low = g.self_score
      if (g.is_playoff) {
        playoff_pf += g.self_score
        playoff_games++
        if (g.result === 'W') playoff_wins++
        else if (g.result === 'L') playoff_losses++
        else playoff_ties++
      }
    }
    const out: Record<string, unknown> = {
      year: season.year,
      team_name: ms.team_name ?? manager.team_name ?? manager.display_name,
      final_rank: ms.final_rank ?? null,
      reg_season_rank: ms.regular_rank ?? null,
      reg_record: recordStr(ms.wins, ms.losses, ms.ties),
      reg_pf: round2(Number(ms.points_for)),
      reg_pa: round2(Number(ms.points_against)),
      playoff_record: recordStr(playoff_wins, playoff_losses, playoff_ties),
      playoff_games,
      playoff_pf: round2(playoff_pf),
      total_pf: round2(total_pf),
      avg_ppg: counted_games > 0 ? round2(total_pf / counted_games) : 0,
      high_week_score: high === -Infinity ? 0 : round2(high),
      low_week_score: low === Infinity ? 0 : round2(low),
    }
    if (highWeek != null) out.high_week = highWeek
    return out
  })

  // h2h — keyed by opponent's profile group so merged opponents combine.
  // The key is the opponent's profile.id if it has one, else the opponent's manager.id.
  const groups = buildProfileGroups(s)
  const managerToGroup = buildManagerToGroup(groups)
  type H2HRow = {
    oppGroup: ProfileGroup
    reg_w: number; reg_l: number; reg_t: number; reg_pf: number; reg_pa: number
    pl_w: number; pl_l: number; pl_t: number; pl_pf: number; pl_pa: number
  }
  const h2hMap = new Map<string, H2HRow>()

  // Union games across all the profile's identities (matches the aggregateProfile dedup logic).
  const seenMatchup = new Set<string>()
  const allGames: ManagerGame[] = []
  for (const mid of g.managerIds) {
    for (const m of s.matchupsByManager.get(mid) ?? []) {
      const key = `${m.season_id}|${m.week}|${m.manager_a_id}|${m.manager_b_id}`
      if (seenMatchup.has(key)) continue
      seenMatchup.add(key)
      const game = asManagerGame(m, mid)
      if (game) allGames.push(game)
    }
  }
  for (const gm of allGames) {
    const oppGroup = managerToGroup.get(gm.opp_id)
    if (!oppGroup) continue
    if (isGroupHidden(oppGroup)) continue
    const key = oppGroup.profile?.id ?? oppGroup.primary.id
    let row = h2hMap.get(key)
    if (!row) {
      row = { oppGroup, reg_w: 0, reg_l: 0, reg_t: 0, reg_pf: 0, reg_pa: 0, pl_w: 0, pl_l: 0, pl_t: 0, pl_pf: 0, pl_pa: 0 }
      h2hMap.set(key, row)
    }
    if (gm.is_playoff) {
      if (!isChampionshipBracketGame(s, gm)) continue
      row.pl_pf += gm.self_score; row.pl_pa += gm.opp_score
      if (gm.result === 'W') row.pl_w++
      else if (gm.result === 'L') row.pl_l++
      else row.pl_t++
    } else {
      row.reg_pf += gm.self_score; row.reg_pa += gm.opp_score
      if (gm.result === 'W') row.reg_w++
      else if (gm.result === 'L') row.reg_l++
      else row.reg_t++
    }
  }
  const h2h = Array.from(h2hMap.values())
    .map((r) => {
      const total = r.reg_w + r.reg_l + r.reg_t + r.pl_w + r.pl_l + r.pl_t
      return {
        opp_user_id: userId(r.oppGroup.primary),
        opp_name: groupDisplayName(r.oppGroup),
        reg_record: recordStr(r.reg_w, r.reg_l, r.reg_t),
        reg_pf: round2(r.reg_pf),
        reg_pa: round2(r.reg_pa),
        playoff_record: recordStr(r.pl_w, r.pl_l, r.pl_t),
        playoff_pf: round2(r.pl_pf),
        playoff_pa: round2(r.pl_pa),
        total_record: recordStr(r.reg_w + r.pl_w, r.reg_l + r.pl_l, r.reg_t + r.pl_t),
        total_games: total,
      }
    })
    .sort((a, b) => b.total_games - a.total_games)

  const tagline = `${agg.seasons_played} season${agg.seasons_played === 1 ? '' : 's'} of league history. ${agg.championships} championship${agg.championships === 1 ? '' : 's'}.`

  return {
    user_id: userId(manager),
    name: groupDisplayName(g),
    nfl_display_name: manager.display_name,
    is_current: isGroupCurrent(g, currentManagerIdSet(s)),
    is_hidden: isGroupHidden(g),
    tagline,
    seasons_played: agg.seasons_played,
    total_games: totalGames,
    championships: agg.championships,
    championship_seasons: agg.championship_seasons,
    top_three_finishes: agg.top_three_finishes,
    playoff_appearances: agg.playoff_appearances,
    reg_record: recordStr(agg.reg_wins, agg.reg_losses, agg.reg_ties),
    reg_win_pct: totalReg > 0 ? round4(agg.reg_wins / totalReg) : 0,
    reg_pf: agg.reg_pf,
    reg_pa: agg.reg_pa,
    playoff_record: recordStr(agg.playoff_wins, agg.playoff_losses, agg.playoff_ties),
    playoff_win_pct: totalPlayoff > 0 ? round4(agg.playoff_wins / totalPlayoff) : 0,
    playoff_pf: agg.playoff_pf,
    playoff_pa: agg.playoff_pa,
    high_score: agg.high_score,
    low_score: agg.low_score,
    avg_ppg: totalGames > 0 ? round2(agg.total_pf_all / totalGames) : 0,
    longest_win_streak: agg.longest_win_streak,
    longest_loss_streak: agg.longest_loss_streak,
    season_ledger,
    h2h,
  }
}

// Rivalries: commissioner-curated head-to-head pairs. For each rivalry, compute
// h2h stats aggregated by profile (so merged identities are pooled).
function buildRivalries(s: Snapshot): unknown {
  if (!s.rivalries || s.rivalries.length === 0) return { rivalries: [] }
  const groups = buildProfileGroups(s)
  const managerToGroup = buildManagerToGroup(groups)

  const out = s.rivalries.map((rv) => {
    const groupA = managerToGroup.get(rv.manager_a_id)
    const groupB = managerToGroup.get(rv.manager_b_id)
    // If either side's profile is hidden, skip the rivalry entirely.
    if (!groupA || !groupB) return null
    if (isGroupHidden(groupA) || isGroupHidden(groupB)) return null
    if (groupA === groupB) return null  // sanity: merged into same profile

    // Collect every matchup between any identity in groupA and any in groupB.
    // Championship-bracket filter (same rule used in buildH2HMatrix +
    // buildLeagueJson's totalMatchups counter): regular season always
    // counts; playoff games only count when at least one side finished
    // top-4 that year. That excludes consolation-bracket games (5th-place,
    // 7th-place, etc.) — those aren't "real" playoff meetings and were
    // inflating rivalry stats with games neither side cared about.
    const seenKey = new Set<string>()
    type Game = {
      season_id: string
      week: number
      year: number
      is_playoff: boolean
      a_score: number
      b_score: number
    }
    const games: Game[] = []
    for (const ma of groupA.managerIds) {
      for (const mt of s.matchupsByManager.get(ma) ?? []) {
        const otherId = mt.manager_a_id === ma ? mt.manager_b_id : mt.manager_a_id
        if (!groupB.managerIds.has(otherId)) continue
        const key = `${mt.season_id}|${mt.week}`
        if (seenKey.has(key)) continue
        seenKey.add(key)
        if (mt.score_a == null || mt.score_b == null) continue
        if (mt.is_playoff) {
          const aRank = s.finalRankByMgrSeason.get(`${mt.season_id}|${mt.manager_a_id}`) ?? null
          const bRank = s.finalRankByMgrSeason.get(`${mt.season_id}|${mt.manager_b_id}`) ?? null
          const aBracket = aRank != null && aRank <= 4
          const bBracket = bRank != null && bRank <= 4
          if (!aBracket && !bBracket) continue
        }
        const aIsA = mt.manager_a_id === ma
        const aScore = aIsA ? Number(mt.score_a) : Number(mt.score_b)
        const bScore = aIsA ? Number(mt.score_b) : Number(mt.score_a)
        const year = s.seasons.find((sn) => sn.id === mt.season_id)?.year ?? 0
        games.push({
          season_id: mt.season_id,
          week: mt.week,
          year,
          is_playoff: mt.is_playoff,
          a_score: aScore,
          b_score: bScore,
        })
      }
    }
    games.sort((g1, g2) => g1.year - g2.year || g1.week - g2.week)

    if (games.length === 0) {
      // Pair has never played — still render the card with zeros.
      return {
        id: rv.id,
        name: rv.name,
        total_meetings: 0,
        first_meeting_year: null,
        last_meeting: null,
        leader_name: null,
        leader_record: null,
        is_deadlocked: true,
        manager_a: emptyRivalrySide(groupA),
        manager_b: emptyRivalrySide(groupB),
      }
    }

    let aWins = 0, bWins = 0, ties = 0
    const aReg = { w: 0, l: 0, t: 0 }, bReg = { w: 0, l: 0, t: 0 }
    const aPlayoff = { w: 0, l: 0, t: 0 }, bPlayoff = { w: 0, l: 0, t: 0 }
    let aPF = 0, bPF = 0
    // Each side's biggest single-week score in this rivalry. Walked
    // alongside the totals so we don't loop the games twice. Stored as
    // `{ score, year, week, is_playoff }` per side and shipped to the
    // detail page so the head-to-head card can show "best week vs.
    // this opponent" — a stat that doesn't exist anywhere else.
    let aHigh: Game | null = null
    let bHigh: Game | null = null
    for (const g of games) {
      aPF += g.a_score; bPF += g.b_score
      if (!aHigh || g.a_score > aHigh.a_score) aHigh = g
      if (!bHigh || g.b_score > bHigh.b_score) bHigh = g
      if (g.a_score > g.b_score) {
        aWins++
        if (g.is_playoff) { aPlayoff.w++; bPlayoff.l++ } else { aReg.w++; bReg.l++ }
      } else if (g.a_score < g.b_score) {
        bWins++
        if (g.is_playoff) { aPlayoff.l++; bPlayoff.w++ } else { aReg.l++; bReg.w++ }
      } else {
        ties++
        if (g.is_playoff) { aPlayoff.t++; bPlayoff.t++ } else { aReg.t++; bReg.t++ }
      }
    }

    const last5 = games.slice(-5).map((g) => {
      const margin = round2(g.a_score - g.b_score)
      return {
        year: g.year,
        week: g.week,
        is_playoff: g.is_playoff,
        a_result: margin > 0 ? 'W' : margin < 0 ? 'L' : 'T',
        b_result: margin > 0 ? 'L' : margin < 0 ? 'W' : 'T',
        a_score: round2(g.a_score),
        b_score: round2(g.b_score),
        margin: Math.abs(margin),
      }
    })

    const lastGame = games[games.length - 1]
    const leaderName = aWins > bWins ? groupDisplayName(groupA) : aWins < bWins ? groupDisplayName(groupB) : null

    return {
      id: rv.id,
      name: rv.name,
      total_meetings: games.length,
      first_meeting_year: games[0].year,
      last_meeting: {
        year: lastGame.year,
        week: lastGame.week,
        is_playoff: lastGame.is_playoff,
        a_score: round2(lastGame.a_score),
        b_score: round2(lastGame.b_score),
      },
      leader_name: leaderName,
      leader_record: leaderName === null ? `${aWins}–${bWins}` : leaderName === groupDisplayName(groupA) ? `${aWins}–${bWins}` : `${bWins}–${aWins}`,
      is_deadlocked: aWins === bWins,
      manager_a: {
        name: groupDisplayName(groupA),
        user_id: userId(groupA.primary),
        wins: aWins,
        avg_ppg: games.length > 0 ? round2(aPF / games.length) : 0,
        reg_record: recordStr(aReg.w, aReg.l, aReg.t),
        playoff_record: recordStr(aPlayoff.w, aPlayoff.l, aPlayoff.t),
        high_score: aHigh
          ? { score: round2(aHigh.a_score), year: aHigh.year, week: aHigh.week, is_playoff: aHigh.is_playoff }
          : null,
        last5: last5.map((g) => ({
          year: g.year, week: g.week, is_playoff: g.is_playoff,
          result: g.a_result, margin: g.margin,
        })),
      },
      manager_b: {
        name: groupDisplayName(groupB),
        user_id: userId(groupB.primary),
        wins: bWins,
        avg_ppg: games.length > 0 ? round2(bPF / games.length) : 0,
        reg_record: recordStr(bReg.w, bReg.l, bReg.t),
        playoff_record: recordStr(bPlayoff.w, bPlayoff.l, bPlayoff.t),
        high_score: bHigh
          ? { score: round2(bHigh.b_score), year: bHigh.year, week: bHigh.week, is_playoff: bHigh.is_playoff }
          : null,
        last5: last5.map((g) => ({
          year: g.year, week: g.week, is_playoff: g.is_playoff,
          result: g.b_result, margin: g.margin,
        })),
      },
      ties_count: ties,
    }
  }).filter((r): r is NonNullable<typeof r> => r != null)

  // Aggregate top-line stats for the page header.
  const total_meetings = out.reduce((acc, r) => acc + r.total_meetings, 0)
  let leaders = 0, deadlocked = 0
  for (const r of out) {
    if (r.is_deadlocked && r.total_meetings > 0) deadlocked++
    else if (r.leader_name) leaders++
  }
  return {
    rivalries: out,
    summary: {
      active_feuds: out.length,
      total_meetings,
      leaders,
      deadlocked,
    },
  }
}

function emptyRivalrySide(g: ProfileGroup) {
  return {
    name: groupDisplayName(g),
    user_id: userId(g.primary),
    wins: 0,
    avg_ppg: 0,
    reg_record: '0-0-0',
    playoff_record: '0-0-0',
    high_score: null as { score: number; year: number; week: number; is_playoff: boolean } | null,
    last5: [] as Array<{ year: number; week: number; is_playoff: boolean; result: 'W' | 'L' | 'T'; margin: number }>,
  }
}

function buildManagerHighs(s: Snapshot): unknown {
  // Top-5 single-week scores per profile (merged identities pool their scores).
  const groups = buildProfileGroups(s).filter((g) => !isGroupHidden(g))
  const managerToGroup = buildManagerToGroup(groups)
  return groups.map((g) => {
    const seen = new Set<string>()
    const games: ManagerGame[] = []
    for (const mid of g.managerIds) {
      for (const mt of s.matchupsByManager.get(mid) ?? []) {
        const key = `${mt.season_id}|${mt.week}|${mt.manager_a_id}|${mt.manager_b_id}`
        if (seen.has(key)) continue
        seen.add(key)
        const game = asManagerGame(mt, mid)
        if (!game) continue
        // Skip consolation / placement games — playoff weeks where neither
        // participant finished top-4. A week-15 score from someone who
        // finished 8th doesn't belong in their top-5 highs.
        if (game.is_playoff && !isChampionshipBracketGame(s, game)) continue
        games.push(game)
      }
    }
    games.sort((a, b) => b.self_score - a.self_score)
    const top5 = games.slice(0, 5).map((game) => {
      const season = s.seasons.find((sn) => sn.id === game.season_id)
      const oppGroup = managerToGroup.get(game.opp_id)
      const oppName = oppGroup ? groupDisplayName(oppGroup) : null
      const ms = (s.managerSeasonsBySeason.get(game.season_id) ?? []).find((r) => r.manager_id === game.self_id)
      return {
        score: round2(game.self_score),
        opp_name: oppName,
        opp_score: round2(game.opp_score),
        season: season?.year ?? null,
        week: game.week,
        result: game.result,
        team: ms?.team_name ?? g.primary.team_name ?? groupDisplayName(g),
      }
    })
    return {
      user_id: userId(g.primary),
      name: groupDisplayName(g),
      is_current: top5.length > 0,
      top5,
    }
  })
}

// ============================================================
// Record book (weekly / season / career extremes)
// ============================================================

type WeeklyExtreme = {
  season: number
  week: number
  is_playoff: boolean
  user_id: string | null
  owner: string
  team_name: string | null
  score: number
  opp_user_id: string | null
  opp_owner: string
  opp_score: number
  result: 'W' | 'L' | 'T'
  margin: number
  combined_score?: number
}

// Per-profile-group chronological career games (regular + championship-bracket
// only — same scope as the rest of buildRecordBook). Used by the milestone
// "Quickest to X" tiers in the record book.
type GroupGameLite = { year: number; week: number; result: 'W' | 'L' | 'T'; self_score: number }
function buildGroupCareerGames(s: Snapshot): {
  groupGames: Map<string, GroupGameLite[]>
  groupName: Map<string, string>
  groupUserId: Map<string, string | null>
} {
  const yearOfSeason = new Map<string, number>()
  for (const sn of s.seasons) yearOfSeason.set(sn.id, sn.year)
  const groups = buildProfileGroups(s).filter((g) => !isGroupHidden(g))
  const groupGames = new Map<string, GroupGameLite[]>()
  const groupName = new Map<string, string>()
  const groupUserId = new Map<string, string | null>()
  for (const g of groups) {
    const seenKey = new Set<string>()
    const acc: GroupGameLite[] = []
    for (const mid of g.managerIds) {
      for (const mt of s.matchupsByManager.get(mid) ?? []) {
        const k = `${mt.season_id}|${mt.week}|${mt.manager_a_id}|${mt.manager_b_id}`
        if (seenKey.has(k)) continue
        seenKey.add(k)
        const gm = asManagerGame(mt, mid)
        if (!gm) continue
        if (gm.is_playoff && !isChampionshipBracketGame(s, gm)) continue
        acc.push({
          year: yearOfSeason.get(gm.season_id) ?? 0,
          week: gm.week,
          result: gm.result,
          self_score: gm.self_score,
        })
      }
    }
    acc.sort((a, b) => a.year - b.year || a.week - b.week)
    const key = g.profile?.id ?? g.primary.id
    groupGames.set(key, acc)
    groupName.set(key, groupDisplayName(g))
    groupUserId.set(key, userId(g.primary))
  }
  return { groupGames, groupName, groupUserId }
}

// "Fastest to X" milestones — for each tier T, list the top-5 profile groups
// by fewest career games to first cross T (one win per game; PF accumulates).
// Tiers nobody has crossed are dropped so the records page never renders
// empty tabs or rows.
type MilestoneLeader = {
  holder: string
  user_id: string | null
  games: number
  year: number
  week: number
}
type TierMilestone = {
  tier: number
  leaders: MilestoneLeader[]
}
function buildMilestonesBook(s: Snapshot): {
  quickest_to_wins: TierMilestone[]
  quickest_to_points: TierMilestone[]
} {
  const { groupGames, groupName, groupUserId } = buildGroupCareerGames(s)

  // Tier ladders scale up: tighter at the low end, wider at the high end.
  // Capped at 200 wins / 100k pts — beyond that, untouchable for now.
  const winTiers = [10, 25, 50, 75, 100, 125, 150, 175, 200]
  const pointTiers = [
    2500, 5000, 10000, 15000, 20000, 25000, 30000,
    40000, 50000, 60000, 75000, 100000,
  ]
  const TOP_N = 5

  type Crossing = { gid: string; games: number; year: number; week: number }
  function leadersForWins(T: number): Crossing[] {
    const out: Crossing[] = []
    for (const [gid, games] of groupGames) {
      let cum = 0
      for (let i = 0; i < games.length; i++) {
        if (games[i].result === 'W') cum++
        if (cum >= T) {
          out.push({ gid, games: i + 1, year: games[i].year, week: games[i].week })
          break
        }
      }
    }
    return out.sort((a, b) => a.games - b.games || a.year - b.year || a.week - b.week).slice(0, TOP_N)
  }
  function leadersForPoints(T: number): Crossing[] {
    const out: Crossing[] = []
    for (const [gid, games] of groupGames) {
      let cum = 0
      for (let i = 0; i < games.length; i++) {
        cum += games[i].self_score
        if (cum >= T) {
          out.push({ gid, games: i + 1, year: games[i].year, week: games[i].week })
          break
        }
      }
    }
    return out.sort((a, b) => a.games - b.games || a.year - b.year || a.week - b.week).slice(0, TOP_N)
  }

  const toLeader = (c: Crossing): MilestoneLeader => ({
    holder: groupName.get(c.gid) ?? '',
    user_id: groupUserId.get(c.gid) ?? null,
    games: c.games,
    year: c.year,
    week: c.week,
  })

  const quickest_to_wins   = winTiers
    .map((t) => ({ tier: t, leaders: leadersForWins(t).map(toLeader) }))
    .filter((m) => m.leaders.length > 0)
  const quickest_to_points = pointTiers
    .map((t) => ({ tier: t, leaders: leadersForPoints(t).map(toLeader) }))
    .filter((m) => m.leaders.length > 0)
  return { quickest_to_wins, quickest_to_points }
}

// "The Gauntlet" — for each currently-active manager, find the moment they
// beat every other current-active manager at least N times (for N = 1..5).
// Output includes per-tier crossing games + current progress against the
// next tier so in-progress players can be shown alongside completers.
type GauntletCompletion = { tier: number; games: number; year: number; week: number }
type GauntletProgress = {
  tier: number          // tier they're currently working toward
  achieved: number      // opponents at >= tier wins
  total: number         // opponents in the active set (excluding self)
  remaining: string[]   // names of opponents still needing a win at `tier`
  career_games: number  // total career games played so far
}
type GauntletManager = {
  user_id: string | null
  name: string
  completed: GauntletCompletion[]   // tiers cleared, ascending order
  progress: GauntletProgress | null // null only if all 5 tiers are complete
}
const GAUNTLET_MAX_TIER = 5
function buildGauntletBook(s: Snapshot): { managers: GauntletManager[] } {
  // Iterate ALL profile groups (including hidden) so a member who's been
  // privacy-hidden but is still on the league roster still counts as an
  // opponent AND appears in the list. The page's "active managers" view
  // includes hidden-current members; gauntlet should match it.
  const groups = buildProfileGroups(s)
  const currentIds = currentManagerIdSet(s)
  const keyOf = (g: ProfileGroup) => g.profile?.id ?? g.primary.id

  // The "active set" is every profile group that's currently on the
  // league roster. Beating people who've left the league doesn't move
  // the gauntlet bar, matching how the page is framed.
  const activeKeys = new Set<string>()
  const groupName = new Map<string, string>()
  const groupUserId = new Map<string, string | null>()
  const managerKeyById = new Map<string, string>()
  for (const g of groups) {
    const k = keyOf(g)
    groupName.set(k, groupDisplayName(g))
    groupUserId.set(k, userId(g.primary))
    for (const mid of g.managerIds) managerKeyById.set(mid, k)
    if (isGroupCurrent(g, currentIds)) activeKeys.add(k)
  }

  const yearOfSeason = new Map<string, number>()
  for (const sn of s.seasons) yearOfSeason.set(sn.id, sn.year)

  const result: GauntletManager[] = []
  for (const g of groups) {
    if (!isGroupCurrent(g, currentIds)) continue
    const myKey = keyOf(g)

    // Opponents are every OTHER currently-active group.
    const opponentKeys = [...activeKeys].filter((k) => k !== myKey)
    const totalOpps = opponentKeys.length

    type GauntletGame = { year: number; week: number; oppKey: string | null; result: 'W' | 'L' | 'T' }
    const seenKey = new Set<string>()
    const myGames: GauntletGame[] = []
    for (const mid of g.managerIds) {
      for (const mt of s.matchupsByManager.get(mid) ?? []) {
        const k = `${mt.season_id}|${mt.week}|${mt.manager_a_id}|${mt.manager_b_id}`
        if (seenKey.has(k)) continue
        seenKey.add(k)
        const gm = asManagerGame(mt, mid)
        if (!gm) continue
        if (gm.is_playoff && !isChampionshipBracketGame(s, gm)) continue
        myGames.push({
          year: yearOfSeason.get(gm.season_id) ?? 0,
          week: gm.week,
          oppKey: managerKeyById.get(gm.opp_id) ?? null,
          result: gm.result,
        })
      }
    }
    myGames.sort((a, b) => a.year - b.year || a.week - b.week)

    const winsByOpp = new Map<string, number>()
    for (const k of opponentKeys) winsByOpp.set(k, 0)
    const completed: GauntletCompletion[] = []
    let nextTier = 1
    for (let i = 0; i < myGames.length; i++) {
      const gm = myGames[i]
      if (gm.result === 'W' && gm.oppKey && winsByOpp.has(gm.oppKey)) {
        winsByOpp.set(gm.oppKey, (winsByOpp.get(gm.oppKey) ?? 0) + 1)
      }
      // After each game, record any tier crossings the min just hit.
      while (nextTier <= GAUNTLET_MAX_TIER) {
        let minWins = Infinity
        for (const k of opponentKeys) {
          const w = winsByOpp.get(k) ?? 0
          if (w < minWins) minWins = w
        }
        if (minWins >= nextTier) {
          completed.push({ tier: nextTier, games: i + 1, year: gm.year, week: gm.week })
          nextTier++
        } else {
          break
        }
      }
    }

    // Snapshot of in-progress state at the player's most-recent game.
    let progress: GauntletProgress | null = null
    if (nextTier <= GAUNTLET_MAX_TIER) {
      const remaining: string[] = []
      let achieved = 0
      for (const k of opponentKeys) {
        const w = winsByOpp.get(k) ?? 0
        if (w >= nextTier) achieved++
        else remaining.push(groupName.get(k) ?? '')
      }
      progress = {
        tier: nextTier,
        achieved,
        total: totalOpps,
        remaining: remaining.sort((a, b) => a.localeCompare(b)),
        career_games: myGames.length,
      }
    }

    result.push({
      user_id: groupUserId.get(myKey) ?? null,
      name: groupName.get(myKey) ?? '',
      completed,
      progress,
    })
  }
  // Stable order: alphabetical so tabs read deterministically; the page
  // re-sorts per-tab anyway (completers by games asc, then in-progress).
  result.sort((a, b) => a.name.localeCompare(b.name))
  return { managers: result }
}

// "Clutch Index" — career counts of one-score wins and losses per
// profile group. Two thresholds (≤ 5 pts and ≤ 1 pt) × two flavors
// (W = clutch, L = unclutch). Active managers always appear (count 0
// if they've never had a qualifying game); former managers only show
// when they have at least one.
type ClutchEntry = {
  user_id: string | null
  name: string
  is_current: boolean
  count: number
  last_year: number | null
  last_week: number | null
  last_margin: number | null
  last_opp_name: string | null
}
function buildClutchBook(s: Snapshot): {
  clutch_5pt: ClutchEntry[]
  unclutch_5pt: ClutchEntry[]
  clutch_1pt: ClutchEntry[]
  unclutch_1pt: ClutchEntry[]
} {
  // Include hidden groups so a privacy-hidden active member still appears
  // in the leaderboards, matching the gauntlet treatment.
  const groups = buildProfileGroups(s)
  const managerToGroup = buildManagerToGroup(groups)
  const currentIds = currentManagerIdSet(s)
  const yearOfSeason = new Map<string, number>()
  for (const sn of s.seasons) yearOfSeason.set(sn.id, sn.year)
  const oppNameOf = (mid: string): string => {
    const g = managerToGroup.get(mid)
    return g ? groupDisplayName(g) : ''
  }

  type Game = { year: number; week: number; result: 'W' | 'L' | 'T'; margin: number; oppName: string }
  type Row = { user_id: string | null; name: string; is_current: boolean; games: Game[] }
  const rows: Row[] = []
  for (const g of groups) {
    const seenKey = new Set<string>()
    const games: Game[] = []
    for (const mid of g.managerIds) {
      for (const mt of s.matchupsByManager.get(mid) ?? []) {
        const k = `${mt.season_id}|${mt.week}|${mt.manager_a_id}|${mt.manager_b_id}`
        if (seenKey.has(k)) continue
        seenKey.add(k)
        const gm = asManagerGame(mt, mid)
        if (!gm) continue
        if (gm.is_playoff && !isChampionshipBracketGame(s, gm)) continue
        const m = Math.abs(gm.margin)
        if (m === 0) continue
        games.push({
          year: yearOfSeason.get(gm.season_id) ?? 0,
          week: gm.week,
          result: gm.result,
          margin: m,
          oppName: oppNameOf(gm.opp_id),
        })
      }
    }
    games.sort((a, b) => a.year - b.year || a.week - b.week)
    rows.push({
      user_id: userId(g.primary),
      name: groupDisplayName(g),
      is_current: isGroupCurrent(g, currentIds),
      games,
    })
  }

  function topFor(predicate: (g: Game) => boolean): ClutchEntry[] {
    const out: ClutchEntry[] = []
    for (const r of rows) {
      // Active-only leaderboard. Alumni don't appear at all (this
      // section is framed around the current roster's clutch reps).
      if (!r.is_current) continue
      const matching = r.games.filter(predicate)
      const last = matching.length > 0 ? matching[matching.length - 1] : null
      out.push({
        user_id: r.user_id,
        name: r.name,
        is_current: r.is_current,
        count: matching.length,
        last_year: last ? last.year : null,
        last_week: last ? last.week : null,
        last_margin: last ? round2(last.margin) : null,
        last_opp_name: last ? last.oppName : null,
      })
    }
    return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }

  return {
    clutch_5pt:   topFor((g) => g.result === 'W' && g.margin <= 5),
    unclutch_5pt: topFor((g) => g.result === 'L' && g.margin <= 5),
    clutch_1pt:   topFor((g) => g.result === 'W' && g.margin <= 1),
    unclutch_1pt: topFor((g) => g.result === 'L' && g.margin <= 1),
  }
}

// "Boom or Bust" — career counts of explosive weeks (≥ threshold) and
// dud weeks (≤ threshold) per active manager. Same shape as Clutch:
// every active manager appears even with count 0 so the leaderboard
// is the full roster; alumni are excluded. Three tiers per side.
type BoomEntry = {
  user_id: string | null
  name: string
  is_current: boolean
  count: number
  last_year: number | null
  last_week: number | null
  last_score: number | null
  last_opp_name: string | null
}
function buildBoomBustBook(s: Snapshot): {
  boom_150: BoomEntry[]; boom_175: BoomEntry[]; boom_200: BoomEntry[]
  bust_80:  BoomEntry[]; bust_70:  BoomEntry[]; bust_60:  BoomEntry[]
} {
  const groups = buildProfileGroups(s)
  const managerToGroup = buildManagerToGroup(groups)
  const currentIds = currentManagerIdSet(s)
  const yearOfSeason = new Map<string, number>()
  for (const sn of s.seasons) yearOfSeason.set(sn.id, sn.year)
  const oppNameOf = (mid: string): string => {
    const g = managerToGroup.get(mid)
    return g ? groupDisplayName(g) : ''
  }

  type Game = { year: number; week: number; score: number; oppName: string }
  type Row = { user_id: string | null; name: string; is_current: boolean; games: Game[] }
  const rows: Row[] = []
  for (const g of groups) {
    const seenKey = new Set<string>()
    const games: Game[] = []
    for (const mid of g.managerIds) {
      for (const mt of s.matchupsByManager.get(mid) ?? []) {
        const k = `${mt.season_id}|${mt.week}|${mt.manager_a_id}|${mt.manager_b_id}`
        if (seenKey.has(k)) continue
        seenKey.add(k)
        const gm = asManagerGame(mt, mid)
        if (!gm) continue
        if (gm.is_playoff && !isChampionshipBracketGame(s, gm)) continue
        games.push({
          year: yearOfSeason.get(gm.season_id) ?? 0,
          week: gm.week,
          score: gm.self_score,
          oppName: oppNameOf(gm.opp_id),
        })
      }
    }
    games.sort((a, b) => a.year - b.year || a.week - b.week)
    rows.push({
      user_id: userId(g.primary),
      name: groupDisplayName(g),
      is_current: isGroupCurrent(g, currentIds),
      games,
    })
  }

  function topFor(predicate: (g: Game) => boolean): BoomEntry[] {
    const out: BoomEntry[] = []
    for (const r of rows) {
      if (!r.is_current) continue
      const matching = r.games.filter(predicate)
      const last = matching.length > 0 ? matching[matching.length - 1] : null
      out.push({
        user_id: r.user_id,
        name: r.name,
        is_current: r.is_current,
        count: matching.length,
        last_year: last ? last.year : null,
        last_week: last ? last.week : null,
        last_score: last ? round2(last.score) : null,
        last_opp_name: last ? last.oppName : null,
      })
    }
    return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }

  return {
    boom_150: topFor((g) => g.score >= 150),
    boom_175: topFor((g) => g.score >= 175),
    boom_200: topFor((g) => g.score >= 200),
    bust_80:  topFor((g) => g.score <= 80),
    bust_70:  topFor((g) => g.score <= 70),
    bust_60:  topFor((g) => g.score <= 60),
  }
}

function buildRecordBook(s: Snapshot): unknown {
  // Resolve every manager.id → its profile group's canonical name so renaming
  // a profile (manager_profiles.canonical_name) propagates to every line of the
  // record book without re-sync.
  const managerToGroup = buildManagerToGroup(buildProfileGroups(s))
  const ownerName = (mgr: ManagerRow | undefined): string => {
    if (!mgr) return ''
    const g = managerToGroup.get(mgr.id)
    return g ? groupDisplayName(g) : mgr.display_name
  }

  // Flatten every (manager, week) result, then sort/slice for each category.
  const flat: WeeklyExtreme[] = []
  for (const m of s.managers.values()) {
    const games = (s.matchupsByManager.get(m.id) ?? [])
      .map((mt) => asManagerGame(mt, m.id))
      .filter((g): g is ManagerGame => g != null)
    for (const g of games) {
      const season = s.seasons.find((sn) => sn.id === g.season_id)
      if (!season) continue
      // Skip consolation / placement games — same rule as buildManagerHighs.
      if (g.is_playoff && !isChampionshipBracketGame(s, g)) continue
      const opp = s.managers.get(g.opp_id)
      const ms = (s.managerSeasonsBySeason.get(g.season_id) ?? []).find((r) => r.manager_id === m.id)
      const selfName = ownerName(m)
      flat.push({
        season: season.year,
        week: g.week,
        is_playoff: g.is_playoff,
        user_id: userId(m),
        owner: selfName,
        team_name: ms?.team_name ?? m.team_name ?? selfName,
        score: round2(g.self_score),
        opp_user_id: userId(opp ?? undefined),
        opp_owner: ownerName(opp),
        opp_score: round2(g.opp_score),
        result: g.result,
        margin: g.margin,
        combined_score: round2(g.self_score + g.opp_score),
      })
    }
  }

  const N = 10
  const highest_single_week_score = [...flat].sort((a, b) => b.score - a.score).slice(0, N).map(stripCombined)
  const lowest_single_week_score = [...flat].sort((a, b) => a.score - b.score).slice(0, N).map(stripCombined)
  const biggest_blowouts = [...flat].filter((g) => g.result === 'W').sort((a, b) => b.margin - a.margin).slice(0, N)
  const closest_games = dedupePairs(flat).filter((g) => g.result === 'W').sort((a, b) => a.margin - b.margin).slice(0, N)
  const unluckiest_losses = [...flat].filter((g) => g.result === 'L').sort((a, b) => b.score - a.score).slice(0, N).map(stripCombined)
  const luckiest_wins = [...flat].filter((g) => g.result === 'W').sort((a, b) => a.score - b.score).slice(0, N).map(stripCombined)
  const highest_combined_score = dedupePairs(flat).sort((a, b) => (b.combined_score ?? 0) - (a.combined_score ?? 0)).slice(0, N)
  const lowest_combined_score = dedupePairs(flat).sort((a, b) => (a.combined_score ?? 0) - (b.combined_score ?? 0)).slice(0, N)

  // Season aggregates from season_ledger-equivalent
  type SeasonExtreme = {
    season: number
    user_id: string | null
    owner: string
    team_name: string | null
    final_rank: number | null
    reg_season_rank: number | null
    reg_record: string
    reg_win_pct: number
    reg_pf: number
    reg_pa: number
    playoff_record: string
    playoff_games: number
    playoff_pf: number
    total_record: string
    total_pf: number
    avg_ppg: number
    high_week_score: number
    high_week_when: string
    low_week_score: number
    low_week_when: string
  }
  const seasonRows: SeasonExtreme[] = []
  for (const m of s.managers.values()) {
    const mss = s.managerSeasonsByManager.get(m.id) ?? []
    for (const ms of mss) {
      const season = s.seasons.find((sn) => sn.id === ms.season_id)
      if (!season) continue
      const games = (s.matchupsBySeason.get(season.id) ?? [])
        .map((mt) => asManagerGame(mt, m.id))
        .filter((g): g is ManagerGame => g != null && g.self_id === m.id)
      if (games.length === 0) continue
      let high = -Infinity, highWeek = 0, highOpp = ''
      let low = Infinity, lowWeek = 0, lowOpp = ''
      let pl_w = 0, pl_l = 0, pl_t = 0, pl_pf = 0, pl_games = 0, total_pf = 0
      for (const g of games) {
        total_pf += g.self_score
        const opp = s.managers.get(g.opp_id)
        const oppName = ownerName(opp)
        if (g.self_score > high) { high = g.self_score; highWeek = g.week; highOpp = oppName }
        if (g.self_score < low) { low = g.self_score; lowWeek = g.week; lowOpp = oppName }
        if (g.is_playoff) {
          pl_games++; pl_pf += g.self_score
          if (g.result === 'W') pl_w++
          else if (g.result === 'L') pl_l++
          else pl_t++
        }
      }
      const totalReg = ms.wins + ms.losses + ms.ties
      const selfName = ownerName(m)
      seasonRows.push({
        season: season.year,
        user_id: userId(m),
        owner: selfName,
        team_name: ms.team_name ?? m.team_name ?? selfName,
        final_rank: ms.final_rank ?? null,
        reg_season_rank: ms.regular_rank ?? null,
        reg_record: recordStr(ms.wins, ms.losses, ms.ties),
        reg_win_pct: totalReg > 0 ? round4(ms.wins / totalReg) : 0,
        reg_pf: round2(Number(ms.points_for)),
        reg_pa: round2(Number(ms.points_against)),
        playoff_record: recordStr(pl_w, pl_l, pl_t),
        playoff_games: pl_games,
        playoff_pf: round2(pl_pf),
        total_record: recordStr(ms.wins + pl_w, ms.losses + pl_l, ms.ties + pl_t),
        total_pf: round2(total_pf),
        avg_ppg: games.length > 0 ? round2(total_pf / games.length) : 0,
        high_week_score: round2(high),
        high_week_when: `W${highWeek} vs ${highOpp}`,
        low_week_score: round2(low),
        low_week_when: `W${lowWeek} vs ${lowOpp}`,
      })
    }
  }
  const highest_season_pf = [...seasonRows].sort((a, b) => b.total_pf - a.total_pf).slice(0, N)
  const lowest_season_pf = [...seasonRows].sort((a, b) => a.total_pf - b.total_pf).slice(0, N)
  const best_reg_season_records = [...seasonRows].sort((a, b) => b.reg_win_pct - a.reg_win_pct || b.reg_pf - a.reg_pf).slice(0, N)
  const highest_ppg = [...seasonRows].sort((a, b) => b.avg_ppg - a.avg_ppg).slice(0, N)
  const highest_single_week_in_season = [...seasonRows].sort((a, b) => b.high_week_score - a.high_week_score).slice(0, N)
  const lowest_single_week_in_season = [...seasonRows].sort((a, b) => a.low_week_score - b.low_week_score).slice(0, N)

  // Career
  type Streak = {
    type: 'win' | 'loss'
    length: number
    start_season: number
    start_week: number
    end_season: number
    end_week: number
    total_pf: number
    total_pa: number
    user_id: string | null
    owner: string
  }
  const winStreaks: Streak[] = []
  const lossStreaks: Streak[] = []
  for (const m of s.managers.values()) {
    const games = (s.matchupsByManager.get(m.id) ?? [])
      .map((mt) => asManagerGame(mt, m.id))
      .filter((g): g is ManagerGame => g != null)
      .sort((a, b) => {
        const ya = s.seasons.find((sn) => sn.id === a.season_id)?.year ?? 0
        const yb = s.seasons.find((sn) => sn.id === b.season_id)?.year ?? 0
        if (ya !== yb) return ya - yb
        return a.week - b.week
      })
    // Find every maximal W-run and L-run
    let i = 0
    while (i < games.length) {
      const result = games[i].result
      if (result !== 'W' && result !== 'L') { i++; continue }
      let j = i
      let pf = 0, pa = 0
      while (j < games.length && games[j].result === result) {
        pf += games[j].self_score
        pa += games[j].opp_score
        j++
      }
      const a = games[i], b = games[j - 1]
      const ya = s.seasons.find((sn) => sn.id === a.season_id)?.year ?? 0
      const yb = s.seasons.find((sn) => sn.id === b.season_id)?.year ?? 0
      const streak: Streak = {
        type: result === 'W' ? 'win' : 'loss',
        length: j - i,
        start_season: ya,
        start_week: a.week,
        end_season: yb,
        end_week: b.week,
        total_pf: round2(pf),
        total_pa: round2(pa),
        user_id: userId(m),
        owner: ownerName(m),
      }
      if (result === 'W') winStreaks.push(streak)
      else lossStreaks.push(streak)
      i = j
    }
  }
  const longest_win_streaks = winStreaks.sort((a, b) => b.length - a.length).slice(0, N)
  const longest_loss_streaks = lossStreaks.sort((a, b) => b.length - a.length).slice(0, N)

  // Career summary rows per manager (used by several leaderboards)
  type CareerRow = {
    user_id: string | null
    owner: string
    is_current_member: boolean
    seasons_played: number
    championship_appearances: number
    top_3_finishes: number
    playoff_appearances: number
    perfect_reg_seasons: string
    winless_reg_seasons: string
    avg_final_rank: number
    best_finish: number
    worst_finish: number
    longest_win_streak: number
    longest_win_streak_when: string
    longest_loss_streak: number
    longest_loss_streak_when: string
  }
  const autoCurrentRecords = currentManagerIdSet(s)
  const careerRows: CareerRow[] = buildProfileGroups(s)
    .filter((g) => !isGroupHidden(g))
    .map((g) => {
    // Union manager_seasons across all platform identities in this profile.
    const mss: ManagerSeasonRow[] = []
    for (const mid of g.managerIds) mss.push(...(s.managerSeasonsByManager.get(mid) ?? []))
    const ranks = mss.map((r) => r.final_rank).filter((r): r is number => r != null)
    const championshipAppearances = mss.filter((r) => {
      const season = s.seasons.find((sn) => sn.id === r.season_id)
      if (!season) return false
      return (season.champion_manager_id != null && g.managerIds.has(season.champion_manager_id))
          || (season.runner_up_manager_id != null && g.managerIds.has(season.runner_up_manager_id))
    }).length
    const top3 = mss.filter((r) => r.final_rank != null && r.final_rank <= 3).length
    let playoffAppearances = 0
    const perfectYears: number[] = []
    const winlessYears: number[] = []
    for (const r of mss) {
      const season = s.seasons.find((sn) => sn.id === r.season_id)
      if (!season) continue
      const had = (s.matchupsBySeason.get(season.id) ?? []).some(
        (mt) => mt.is_playoff && (g.managerIds.has(mt.manager_a_id) || g.managerIds.has(mt.manager_b_id))
      )
      if (madePlayoffs(season, r.final_rank, had)) playoffAppearances++
      const games = r.wins + r.losses + r.ties
      if (games > 0 && r.losses === 0 && r.ties === 0) perfectYears.push(season.year)
      if (games > 0 && r.wins === 0 && r.ties === 0) winlessYears.push(season.year)
    }
    // buildRecordBook now stamps each streak's `owner` with the profile group's
    // canonical name, so every identity in a merged group already shares one
    // owner string — match on it directly. Renames flow through without re-sync.
    const canonical = groupDisplayName(g)
    const myWin = winStreaks.filter((str) => str.owner === canonical).sort((a, b) => b.length - a.length)[0]
    const myLoss = lossStreaks.filter((str) => str.owner === canonical).sort((a, b) => b.length - a.length)[0]
    return {
      user_id: userId(g.primary),
      owner: groupDisplayName(g),
      is_current_member: isGroupCurrent(g, autoCurrentRecords),
      seasons_played: mss.length,
      championship_appearances: championshipAppearances,
      top_3_finishes: top3,
      playoff_appearances: playoffAppearances,
      perfect_reg_seasons: perfectYears.join(', '),
      winless_reg_seasons: winlessYears.join(', '),
      avg_final_rank: ranks.length > 0 ? round2(ranks.reduce((a, b) => a + b, 0) / ranks.length) : 0,
      best_finish: ranks.length > 0 ? Math.min(...ranks) : 0,
      worst_finish: ranks.length > 0 ? Math.max(...ranks) : 0,
      longest_win_streak: myWin?.length ?? 0,
      longest_win_streak_when: myWin ? `W${myWin.start_week} ${myWin.start_season} → W${myWin.end_week} ${myWin.end_season}` : '',
      longest_loss_streak: myLoss?.length ?? 0,
      longest_loss_streak_when: myLoss ? `W${myLoss.start_week} ${myLoss.start_season} → W${myLoss.end_week} ${myLoss.end_season}` : '',
    }
  })
  const most_top_3_finishes = [...careerRows].sort((a, b) => b.top_3_finishes - a.top_3_finishes).slice(0, N)
  const best_avg_finish = [...careerRows].filter((r) => r.avg_final_rank > 0).sort((a, b) => a.avg_final_rank - b.avg_final_rank).slice(0, N)
  const most_playoff_appearances = [...careerRows].sort((a, b) => b.playoff_appearances - a.playoff_appearances).slice(0, N)
  const most_championship_appearances = [...careerRows].sort((a, b) => b.championship_appearances - a.championship_appearances).slice(0, N)

  const hub_records = buildHubRecords({
    highest_single_week_score, biggest_blowouts, longest_win_streaks, longest_loss_streaks,
    highest_season_pf, closest_games, unluckiest_losses, highest_combined_score,
  })

  return {
    hub_records,
    full_book: {
      weekly: {
        highest_single_week_score,
        lowest_single_week_score,
        biggest_blowouts,
        closest_games,
        unluckiest_losses,
        luckiest_wins,
        highest_combined_score,
        lowest_combined_score,
      },
      season: {
        highest_season_pf,
        lowest_season_pf,
        best_reg_season_records,
        highest_ppg,
        highest_single_week_in_season,
        lowest_single_week_in_season,
      },
      career: {
        longest_win_streaks,
        longest_loss_streaks,
        most_top_3_finishes,
        best_avg_finish,
        most_playoff_appearances,
        most_championship_appearances,
      },
      milestones: buildMilestonesBook(s),
      gauntlet: buildGauntletBook(s),
      clutch: buildClutchBook(s),
      boom_bust: buildBoomBustBook(s),
    },
  }
}

function stripCombined<T extends { combined_score?: number }>(g: T): T {
  const out = { ...g }
  delete (out as { combined_score?: number }).combined_score
  return out
}

// Each weekly extreme is duplicated once per side (the matchup appears twice
// in `flat`, once from each manager's POV). For closest-games / combined-score
// rankings we want one row per matchup.
function dedupePairs(flat: WeeklyExtreme[]): WeeklyExtreme[] {
  const seen = new Set<string>()
  const out: WeeklyExtreme[] = []
  for (const g of flat) {
    const key = `${g.season}-${g.week}-${[g.user_id, g.opp_user_id].sort().join(':')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(g)
  }
  return out
}

function buildHubRecords(top: {
  highest_single_week_score: WeeklyExtreme[]
  biggest_blowouts: WeeklyExtreme[]
  longest_win_streaks: Array<{ length: number; owner: string; start_season: number; start_week: number; end_season: number; end_week: number }>
  longest_loss_streaks: Array<{ length: number; owner: string; start_season: number; start_week: number; end_season: number; end_week: number }>
  highest_season_pf: Array<{ owner: string; team_name: string | null; season: number; total_pf: number; avg_ppg: number }>
  closest_games: WeeklyExtreme[]
  unluckiest_losses: WeeklyExtreme[]
  highest_combined_score: WeeklyExtreme[]
}): unknown[] {
  const hub: Array<Record<string, unknown>> = []
  const h = top.highest_single_week_score[0]
  if (h) hub.push({
    label: 'Highest Single-Week Score',
    value: h.score.toString(),
    name: `<em>${h.owner}</em>, untouchable`,
    detail: `${h.season} · W${h.week} · vs ${h.opp_owner}`,
    prose: `<strong>${h.owner}</strong> dropped ${h.score} on ${h.opp_owner} in week ${h.week} of the ${h.season} season — the high-water mark.`,
    gameContext: `${h.season} · Week ${h.week} · ${h.score}—${h.opp_score}`,
  })
  const b = top.biggest_blowouts[0]
  if (b) hub.push({
    label: 'Biggest Blowout',
    value: b.margin.toString(),
    name: `<em>${b.owner}</em> over ${b.opp_owner}`,
    detail: `${b.season} · W${b.week} · ${b.score}—${b.opp_score}`,
    prose: `<strong>${b.owner}</strong> hung ${b.score} on ${b.opp_owner} in week ${b.week} of ${b.season}, ${b.margin} points clear — the most lopsided beating in league history.`,
    gameContext: `${b.season} · Week ${b.week} · ${b.score}—${b.opp_score}`,
  })
  const w = top.longest_win_streaks[0]
  if (w) hub.push({
    label: 'Longest Win Streak',
    value: w.length.toString(),
    name: `<em>${w.owner}</em> — ${w.start_season} run`,
    detail: `Weeks ${w.start_week} through ${w.end_week}, undefeated`,
    prose: `<strong>${w.owner}</strong> ran the table for ${w.length} straight, weeks ${w.start_week} ${w.start_season} through ${w.end_week} ${w.end_season} — the longest unbroken stretch any manager has put together.`,
    gameContext: `${w.start_season} · W${w.start_week} → W${w.end_week} · ${w.length} straight wins`,
  })
  const sp = top.highest_season_pf[0]
  if (sp) hub.push({
    label: 'Highest Season Total',
    value: Math.round(sp.total_pf).toLocaleString(),
    name: `<em>${sp.owner}</em> — "${sp.team_name ?? ''}"`,
    detail: `${sp.season} · ${sp.avg_ppg} ppg avg`,
    prose: `<strong>${sp.owner}</strong>'s ${sp.season} "${sp.team_name ?? ''}" squad piled up ${Math.round(sp.total_pf).toLocaleString()} points across the year, averaging ${Math.round(sp.avg_ppg)} a game — the highest single-season output in league history.`,
    gameContext: `${sp.season} Season · ${Math.round(sp.total_pf).toLocaleString()} PF · ${sp.avg_ppg} ppg`,
  })
  const c = top.closest_games[0]
  if (c) hub.push({
    label: 'Closest Game Ever',
    value: c.margin.toString(),
    name: `<em>${c.owner}</em> over ${c.opp_owner}`,
    detail: `${c.season} · W${c.week} · ${c.score}—${c.opp_score}`,
    prose: `<strong>${c.owner}</strong> edged ${c.opp_owner} by ${c.margin} in week ${c.week} of ${c.season} — the smallest margin in league history.`,
    gameContext: `${c.season} · Week ${c.week} · ${c.score}—${c.opp_score}`,
  })
  const u = top.unluckiest_losses[0]
  if (u) hub.push({
    label: 'Unluckiest Loss',
    value: u.score.toString(),
    name: `<em>${u.owner}</em>, defeated`,
    detail: `${u.season} · W${u.week} · Lost to ${u.opp_owner} (${u.opp_score})`,
    prose: `<strong>${u.owner}</strong> put up ${u.score} points in week ${u.week} of ${u.season} and still lost to ${u.opp_owner}, who somehow scored ${u.opp_score}.`,
    gameContext: `${u.season} · Week ${u.week} · ${u.score}—${u.opp_score} L`,
  })
  const co = top.highest_combined_score[0]
  if (co) hub.push({
    label: 'Shootout (Highest Combined)',
    value: (co.combined_score ?? 0).toString(),
    name: `<em>${co.owner}</em> vs ${co.opp_owner}`,
    detail: `${co.season} · W${co.week} · ${co.score}—${co.opp_score}`,
    prose: `<strong>${co.owner}</strong> and <strong>${co.opp_owner}</strong> combined for ${co.combined_score} points in week ${co.week} of ${co.season} — the highest-scoring matchup ever played in the league.`,
    gameContext: `${co.season} · Week ${co.week} · ${co.score}—${co.opp_score}`,
  })
  const l = top.longest_loss_streaks[0]
  if (l) hub.push({
    label: 'Longest Losing Streak',
    value: l.length.toString(),
    name: `<em>${l.owner}</em>'s nightmare`,
    detail: `W${l.start_week} ${l.start_season} → W${l.end_week} ${l.end_season}`,
    prose: `<strong>${l.owner}</strong> went on a brutal ${l.length}-game losing slide — the longest cold stretch any manager has endured.`,
    gameContext: `${l.start_season}–${l.end_season} · ${l.length} straight losses`,
  })
  return hub
}

// ============================================================
// Public entry point
// ============================================================

export type ExportBundle = Record<string, unknown>

export async function exportLeague(
  leagueId: string,
  opts: { slug?: string } = {},
): Promise<ExportBundle> {
  const s = await loadSnapshot(leagueId)
  const out: ExportBundle = {}

  out['league.json'] = buildLeagueJson(s)
  out['seasons_directory.json'] = buildSeasonsDirectory(s)
  out['managers_directory.json'] = buildManagersDirectory(s)
  out['drafts/drafts_directory.json'] = buildDraftsDirectory(s)
  out['manager_highs.json'] = buildManagerHighs(s)
  out['record_book.json'] = buildRecordBook(s)
  out['rivalries.json'] = buildRivalries(s)
  // Phase-2 live-season feeds: h2h_matrix is always present (all-time
  // data). current_form returns null when no season is is_live — the
  // route handler still serves the JSON; the client treats null as
  // "no current season" and hides the form sheet.
  out['h2h_matrix.json'] = buildH2HMatrix(s)
  out['current_form.json'] = buildCurrentForm(s)
  out['matchup_preview.json'] = buildMatchupPreview(s)
  out['best_coach.json'] = buildBestCoach(s)
  out['manager_dna.json'] = buildManagerDna(s)

  for (const season of s.seasons) {
    out[`seasons/${season.year}.json`] = buildSeasonFile(s, season)
    const draftFile = buildDraftFile(s, season)
    if (draftFile) out[`drafts/${season.year}.json`] = draftFile
  }
  // One manager file per profile group. Merged profiles produce one file under
  // their primary identity's external_id; hidden profiles emit nothing.
  const groups = buildProfileGroups(s)
  for (const g of groups) {
    if (isGroupHidden(g)) continue
    const uid = userId(g.primary)
    if (uid != null) out[`managers/${uid}.json`] = buildManagerFile(s, g)
  }

  // records_watch.json + milestones.json — emitted for every league.
  //
  // jake stays pinned to (2025, W10) as a regression fixture so template
  // iteration has a known-good snapshot to compare against; every other
  // league derives (year, throughWeek) from its actual state:
  //
  //   • is_live season with completed games  → year = live year,
  //                                            throughWeek = latest fully-
  //                                            played week
  //   • is_live season but no games yet      → year = live year, week = 0
  //                                            (preseason horizon)
  //   • no is_live season but seasons exist  → year = max(year) + 1, week 0
  //                                            (off-season → milestone
  //                                            horizon framing for the
  //                                            upcoming year)
  //   • no seasons at all                    → skip (nothing to surface)
  //
  // playoff_odds.json is only emitted once there's enough completed data
  // for the Monte Carlo sim to mean anything (is_live + ≥4 weeks played);
  // jake keeps its frozen W10/2025 snapshot.
  if (opts.slug === 'jake') {
    const previews = buildLiveSeasonPreviews(s, 2025, 10)
    out['records_watch.json'] = previews.records_watch
    out['milestones.json'] = previews.milestones
    const odds = buildPlayoffOddsPreview(s, 2025, 10)
    if (odds) out['playoff_odds.json'] = odds
  } else {
    const ls = resolveLiveSnapshotPoint(s)
    if (ls) {
      const previews = buildLiveSeasonPreviews(s, ls.year, ls.throughWeek)
      out['records_watch.json'] = previews.records_watch
      out['milestones.json'] = previews.milestones
      if (ls.isLive && ls.throughWeek >= 4) {
        const odds = buildPlayoffOddsPreview(s, ls.year, ls.throughWeek)
        if (odds) out['playoff_odds.json'] = odds
      }
    }
  }

  return out
}

// Pick the (year, throughWeek) pair that drives a league's records_watch +
// milestones snapshot. Backward-looking: throughWeek is the latest week
// whose matchups have final scores, so the watch page never advances ahead
// of the data. Falls through to preseason-horizon mode when no live season
// is flagged. Returns null only when the league has no seasons at all.
function resolveLiveSnapshotPoint(
  s: Snapshot,
): { year: number; throughWeek: number; isLive: boolean } | null {
  const liveSeason = s.seasons.find((sn) => sn.is_live)
  if (liveSeason) {
    const matchups = s.matchupsBySeason.get(liveSeason.id) ?? []
    let latestCompleted = 0
    for (const m of matchups) {
      if (m.score_a == null || m.score_b == null) continue
      if (m.week > latestCompleted) latestCompleted = m.week
    }
    return { year: liveSeason.year, throughWeek: latestCompleted, isLive: true }
  }
  if (s.seasons.length === 0) return null
  const lastYear = s.seasons.reduce((acc, sn) => (sn.year > acc ? sn.year : acc), 0)
  return { year: lastYear + 1, throughWeek: 0, isLive: false }
}

// ============================================================
// h2h_matrix.json — all-time head-to-head between every pair of
// profile groups. Drives the "Mileage Matrix" widget on the
// live-season hub: a vintage road-atlas grid of pairwise W-L
// records and PF. Only regular-season + championship-bracket
// games count (matches buildLeagueJson's totalMatchups rule).
// ============================================================
function buildH2HMatrix(s: Snapshot): unknown {
  // Cells include every all-time pairwise matchup so an alumni vs current
  // game still counts in the active manager's row total — but the visible
  // grid only shows currently-active groups. Alumni get filtered out at
  // the manager-directory layer below.
  const groups = buildProfileGroups(s).filter((g) => !isGroupHidden(g))
  const managerToGroup = buildManagerToGroup(groups)
  const autoCurrent = currentManagerIdSet(s)

  // Column-header tag from the manager's display name. Most managers use
  // platform usernames (not real "First Last" names), so first-letter
  // initials read as gibberish — "JZ18" → "J1" tells you nothing. Take
  // the first 4 letters of the name instead, uppercased. Punctuation /
  // digits stripped so e.g. "Joey_Z18" → "JOEY".
  function abbrFor(name: string): string {
    const clean = String(name).replace(/[^A-Za-z]/g, '')
    if (!clean) return '—'
    return clean.slice(0, 4).toUpperCase()
  }

  // Build manager directory entries, ordered by total wins desc so the
  // matrix's row/col order makes intuitive sense (best at the top).
  type MgrEntry = {
    user_id: string
    name: string
    team_latest: string
    abbr: string
    wins: number
  }
  const mgrEntries: MgrEntry[] = []
  for (const g of groups) {
    if (!isGroupCurrent(g, autoCurrent)) continue
    const uid = userId(g.primary)
    if (uid == null) continue
    const agg = aggregateProfile(s, g)
    const wins = agg.reg_wins + agg.playoff_wins
    // Most recent team_latest: scan most recent manager_season across
    // every identity in the group.
    const allMs: ManagerSeasonRow[] = []
    for (const mid of g.managerIds) allMs.push(...(s.managerSeasonsByManager.get(mid) ?? []))
    const lastMs = allMs
      .slice()
      .sort((a, b) => {
        const ya = s.seasons.find((sn) => sn.id === a.season_id)?.year ?? 0
        const yb = s.seasons.find((sn) => sn.id === b.season_id)?.year ?? 0
        return yb - ya
      })[0]
    const name = groupDisplayName(g)
    const teamLatest = lastMs?.team_name ?? g.primary.team_name ?? name
    mgrEntries.push({
      user_id: uid,
      name,
      team_latest: teamLatest,
      abbr: abbrFor(name),
      wins,
    })
  }
  mgrEntries.sort((a, b) => b.wins - a.wins)

  // Walk every matchup once; aggregate into cells keyed by sorted uid pair.
  // `a` in the key is the lexicographically-smaller uid; `wins_a` is its
  // wins. Client orients display from there.
  type Cell = {
    wins_a: number
    wins_b: number
    ties: number
    pf_a: number
    pf_b: number
    meetings: number
    first_year: number | null
    last_year: number | null
  }
  const cells: Record<string, Cell> = {}

  for (const arr of s.matchupsBySeason.values()) {
    for (const m of arr) {
      if (m.score_a == null || m.score_b == null) continue
      // Championship-bracket filter: regular season always counts; playoff
      // games count only when either side finished top-4 that year.
      if (m.is_playoff) {
        const aRank = s.finalRankByMgrSeason.get(`${m.season_id}|${m.manager_a_id}`) ?? null
        const bRank = s.finalRankByMgrSeason.get(`${m.season_id}|${m.manager_b_id}`) ?? null
        const aBracket = aRank != null && aRank <= 4
        const bBracket = bRank != null && bRank <= 4
        if (!aBracket && !bBracket) continue
      }
      const groupA = managerToGroup.get(m.manager_a_id)
      const groupB = managerToGroup.get(m.manager_b_id)
      if (!groupA || !groupB) continue
      if (isGroupHidden(groupA) || isGroupHidden(groupB)) continue
      // Active-only matrix: alumni columns aren't rendered, so cells
      // involving them would never be looked up. Skipping here keeps
      // the JSON tight.
      if (!isGroupCurrent(groupA, autoCurrent) || !isGroupCurrent(groupB, autoCurrent)) continue
      if (groupA === groupB) continue
      const uidA = userId(groupA.primary)
      const uidB = userId(groupB.primary)
      if (uidA == null || uidB == null) continue

      const year = s.seasons.find((sn) => sn.id === m.season_id)?.year ?? 0
      // Sort uids for stable key. `aIsLeft` tracks whether matchup.score_a
      // belongs to the key's first side.
      const aIsLeft = uidA < uidB
      const keyA = aIsLeft ? uidA : uidB
      const keyB = aIsLeft ? uidB : uidA
      const key = `${keyA}|${keyB}`

      let cell = cells[key]
      if (!cell) {
        cell = { wins_a: 0, wins_b: 0, ties: 0, pf_a: 0, pf_b: 0, meetings: 0, first_year: null, last_year: null }
        cells[key] = cell
      }

      const scoreLeft = aIsLeft ? Number(m.score_a) : Number(m.score_b)
      const scoreRight = aIsLeft ? Number(m.score_b) : Number(m.score_a)

      cell.pf_a += scoreLeft
      cell.pf_b += scoreRight
      cell.meetings++
      if (scoreLeft > scoreRight) cell.wins_a++
      else if (scoreLeft < scoreRight) cell.wins_b++
      else cell.ties++
      if (year > 0) {
        if (cell.first_year == null || year < cell.first_year) cell.first_year = year
        if (cell.last_year == null || year > cell.last_year) cell.last_year = year
      }
    }
  }

  // Round PF to 2 dp for readability + smaller payload.
  for (const k of Object.keys(cells)) {
    cells[k]!.pf_a = round2(cells[k]!.pf_a)
    cells[k]!.pf_b = round2(cells[k]!.pf_b)
  }

  return {
    managers: mgrEntries.map((m) => ({
      user_id: m.user_id,
      name: m.name,
      team_latest: m.team_latest,
      abbr: m.abbr,
    })),
    cells,
  }
}

// ============================================================
// current_form.json — standings + last-5 form per manager + week-
// over-week deltas. Drives the "Form Sheet" widget on the live-
// season hub.
//
// Source-season selection (in order):
//   1. is_live season with at least one completed matchup → live mode
//      (is_final: false). The default in-season case.
//   2. otherwise, most recent season with completed matchups → final
//      mode (is_final: true). Lets the off-season view still show a
//      meaningful standings tower — last year's final table.
//   3. nothing scored anywhere → null. Client hides the section.
// ============================================================
function buildCurrentForm(s: Snapshot): unknown {
  const groups = buildProfileGroups(s).filter((g) => !isGroupHidden(g))

  // Find the season to render. Prefer is_live; fall back to the most
  // recent season that has scored matchups.
  function pickFormSeason(): { season: SeasonRow; matchups: MatchupRow[]; isFinal: boolean } | null {
    const liveSeason = s.seasons.find((sn) => sn.is_live)
    const matchupsScored = (sn: SeasonRow) =>
      (s.matchupsBySeason.get(sn.id) ?? []).filter((m) => m.score_a != null && m.score_b != null)
    if (liveSeason) {
      const ms = matchupsScored(liveSeason)
      if (ms.length > 0) return { season: liveSeason, matchups: ms, isFinal: false }
    }
    // Off-season / live-but-no-games: walk seasons newest-first for
    // anything with scored matchups.
    for (let i = s.seasons.length - 1; i >= 0; i--) {
      const sn = s.seasons[i]
      if (liveSeason && sn.id === liveSeason.id) continue
      const ms = matchupsScored(sn)
      if (ms.length > 0) return { season: sn, matchups: ms, isFinal: true }
    }
    return null
  }
  const picked = pickFormSeason()
  if (!picked) return null
  const { season: formSeason, matchups: scoredMatchups, isFinal } = picked

  // In final (off-season) mode, anchor on the regular-season slate so the
  // standings tower reads as the canonical end-of-year table. Including
  // playoff wins would credit the top-4 with extra W and inflate their
  // PF gaps relative to non-playoff teams, which isn't how an almanac
  // frames a "Final · W{N}" view. Live mode keeps all scored games (the
  // standingsThrough function already filters consolation games on its
  // own, so championship-bracket games still flow through).
  const allMatchups = scoredMatchups
    .slice()
    .filter((m) => !(isFinal && m.is_playoff))
    .sort((a, b) => a.week - b.week)
  if (allMatchups.length === 0) return null
  const latestWeek = allMatchups[allMatchups.length - 1]!.week

  // Compute standings as of through a specific week (inclusive). Returns
  // rows keyed by manager.id, with wins/losses/ties + total PF.
  type StandRow = { wins: number; losses: number; ties: number; pf: number; pa: number; weekly_pf: Map<number, number> }
  function standingsThrough(week: number): Map<string, StandRow> {
    const out = new Map<string, StandRow>()
    function row(mid: string): StandRow {
      let r = out.get(mid)
      if (!r) { r = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, weekly_pf: new Map() }; out.set(mid, r) }
      return r
    }
    for (const m of allMatchups) {
      if (m.week > week) continue
      // Skip playoff placement games (consolation) — same as buildSeasonFile.
      if (m.is_playoff) {
        const aRank = s.finalRankByMgrSeason.get(`${m.season_id}|${m.manager_a_id}`) ?? null
        const bRank = s.finalRankByMgrSeason.get(`${m.season_id}|${m.manager_b_id}`) ?? null
        if (!((aRank != null && aRank <= 4) || (bRank != null && bRank <= 4))) continue
      }
      const sa = Number(m.score_a); const sb = Number(m.score_b)
      const rA = row(m.manager_a_id); const rB = row(m.manager_b_id)
      rA.pf += sa; rA.pa += sb; rA.weekly_pf.set(m.week, (rA.weekly_pf.get(m.week) ?? 0) + sa)
      rB.pf += sb; rB.pa += sa; rB.weekly_pf.set(m.week, (rB.weekly_pf.get(m.week) ?? 0) + sb)
      if (sa > sb) { rA.wins++; rB.losses++ }
      else if (sa < sb) { rA.losses++; rB.wins++ }
      else { rA.ties++; rB.ties++ }
    }
    return out
  }

  const now = standingsThrough(latestWeek)
  const prev = latestWeek > 1 ? standingsThrough(latestWeek - 1) : new Map<string, StandRow>()

  // Rank rows by wins desc, then PF desc (standard fantasy tiebreaker).
  function rankFor(stand: Map<string, StandRow>): Map<string, number> {
    const ranked = [...stand.entries()].sort(([, a], [, b]) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      return b.pf - a.pf
    })
    const map = new Map<string, number>()
    ranked.forEach(([mid], i) => map.set(mid, i + 1))
    return map
  }
  const nowRank = rankFor(now)
  const prevRank = rankFor(prev)

  // Last-5 form per manager, walking matchups from latest week backward.
  // Filters out consolation playoff games same as standings above.
  // Returns the W/L array + matching self/opp score arrays so PPG +
  // point differential can be computed over the same window.
  function last5For(mid: string): { form: Array<'W' | 'L' | 'T'>; pf: number[]; pa: number[] } {
    const form: Array<'W' | 'L' | 'T'> = []
    const pf: number[] = []
    const pa: number[] = []
    for (let i = allMatchups.length - 1; i >= 0 && form.length < 5; i--) {
      const m = allMatchups[i]!
      if (m.manager_a_id !== mid && m.manager_b_id !== mid) continue
      if (m.is_playoff) {
        const aRank = s.finalRankByMgrSeason.get(`${m.season_id}|${m.manager_a_id}`) ?? null
        const bRank = s.finalRankByMgrSeason.get(`${m.season_id}|${m.manager_b_id}`) ?? null
        if (!((aRank != null && aRank <= 4) || (bRank != null && bRank <= 4))) continue
      }
      const isA = m.manager_a_id === mid
      const self = isA ? Number(m.score_a) : Number(m.score_b)
      const opp = isA ? Number(m.score_b) : Number(m.score_a)
      form.push(self > opp ? 'W' : self < opp ? 'L' : 'T')
      pf.push(self)
      pa.push(opp)
    }
    return { form, pf, pa }
  }

  // Build one row per profile group (merged identities = one row).
  const rows: Array<Record<string, unknown>> = []
  for (const g of groups) {
    const uid = userId(g.primary)
    if (uid == null) continue
    // Union the group's identities — sum stats across all of them so a
    // mid-season platform switch doesn't split the row.
    let wins = 0, losses = 0, ties = 0, pf = 0
    let nowPosBest = Infinity
    let prevPosBest = Infinity
    for (const mid of g.managerIds) {
      const r = now.get(mid)
      if (r) { wins += r.wins; losses += r.losses; ties += r.ties; pf += r.pf }
      const np = nowRank.get(mid); if (np != null && np < nowPosBest) nowPosBest = np
      const pp = prevRank.get(mid); if (pp != null && pp < prevPosBest) prevPosBest = pp
    }
    if (nowPosBest === Infinity) continue
    // Last-5 is computed from any of the group's identities; pick the one
    // with the most rows. (Single-identity groups are the common case.)
    let form: Array<'W' | 'L' | 'T'> = []
    let last5Pf: number[] = []
    let last5Pa: number[] = []
    for (const mid of g.managerIds) {
      const { form: f, pf: p, pa: ag } = last5For(mid)
      if (f.length > form.length) { form = f; last5Pf = p; last5Pa = ag }
    }
    const ppg5 = last5Pf.length > 0
      ? round2(last5Pf.reduce((a, b) => a + b, 0) / last5Pf.length)
      : 0
    // Point differential over the last-5 window (PF − PA). Reads as
    // "are you outscoring opponents lately, or scraping by". Positive
    // = beating opponents on the scoreboard, negative = getting outscored.
    const pt_diff_5 = last5Pf.length > 0
      ? round2(
          last5Pf.reduce((a, b) => a + b, 0) -
          last5Pa.reduce((a, b) => a + b, 0)
        )
      : 0
    // Most-recent team name across the group.
    const allMs: ManagerSeasonRow[] = []
    for (const mid of g.managerIds) allMs.push(...(s.managerSeasonsByManager.get(mid) ?? []))
    const lastMs = allMs
      .slice()
      .sort((a, b) => {
        const ya = s.seasons.find((sn) => sn.id === a.season_id)?.year ?? 0
        const yb = s.seasons.find((sn) => sn.id === b.season_id)?.year ?? 0
        return yb - ya
      })[0]
    rows.push({
      pos: nowPosBest,
      pos_change: prevPosBest === Infinity ? 0 : prevPosBest - nowPosBest,
      user_id: uid,
      name: groupDisplayName(g),
      team: lastMs?.team_name ?? g.primary.team_name ?? groupDisplayName(g),
      wins, losses, ties,
      record: recordStr(wins, losses, ties),
      form,
      pts: round2(pf),
      ppg5,        // avg points per game over the last 5
      pt_diff_5,   // PF − PA over the last 5
    })
  }
  rows.sort((a, b) => Number(a.pos) - Number(b.pos))

  // GB = games-back from the playoff cutoff seed. Standard baseball
  // formula: ((cutoff.wins − row.wins) + (row.losses − cutoff.losses)) / 2.
  // Negative means "this team is above the line" (e.g. the 1-seed at 10-2
  // vs a 6-team cutoff at 8-4 reads −2.0 GB); positive means "this team
  // is below the line and needs to make up ground" (e.g. an 8-seed at
  // 6-6 reads +2.0 GB). The cutoff row itself is 0.0. When fewer rows
  // exist than playoff slots, the cutoff degrades to the last row and
  // every team reads negative-or-zero, which still reads sensibly.
  const liveSettings = (formSeason.settings ?? {}) as Record<string, unknown>
  const teamCount = rows.length
  const playoffTeams =
    (typeof liveSettings.playoff_team_count === 'number'
      ? (liveSettings.playoff_team_count as number)
      : null) ??
    (teamCount >= 10 ? 6 : Math.max(2, Math.round(teamCount / 2)))
  const cutoffIdx = Math.min(playoffTeams, rows.length) - 1
  const cutoff = cutoffIdx >= 0 ? rows[cutoffIdx] : null
  for (const r of rows) {
    if (!cutoff) { r.gb = 0; continue }
    const gb = ((Number(cutoff.wins) - Number(r.wins)) +
                (Number(r.losses) - Number(cutoff.losses))) / 2
    r.gb = round2(gb)
  }

  return {
    week: latestWeek,
    year: formSeason.year,
    // Final mode (off-season fallback) signals the client to swap the
    // mast title from "Standings · Week N" to "{year} Final · W{N}" and
    // drop the live-dot. pos_change still computes vs week-1 of the same
    // season so end-of-year trajectory remains visible.
    is_final: isFinal,
    rows,
  }
}

// ============================================================
// matchup_preview.json — Departures board for the upcoming week
// plus per-manager preview cards. Drives the Matchup Preview hub
// on the live-season subtree.
//
// Source-week selection (in order):
//   1. is_live season + a `current_week` pin in settings → that week.
//      The pin is how commissioners override the auto-advance, and
//      it's also how a frozen historical season (jake's 2025 W10
//      fixture) renders a preview even though every game is scored.
//      In pinned mode, records/form are computed through week N-1,
//      so the page reads as a true pre-game preview regardless of
//      whether the matchup rows have scores.
//   2. is_live season with at least one unplayed matchup → the
//      smallest-week unplayed slate ("next week"). Common case.
//   3. is_live season, no pin, every scheduled week played → null
//      (season is functionally over, nothing to preview).
//   4. no is_live season → null (off-season).
//
// Each matchup ships everything the page needs without secondary
// fetches: both managers' name/team/record/form/ppg, all-time
// H2H summary + up-to-3 most recent meetings, and a naive
// projection (avg of each side's last-5 PPG window).
// ============================================================
function buildMatchupPreview(s: Snapshot): unknown {
  const liveSeason = s.seasons.find((sn) => sn.is_live)
  if (!liveSeason) return null
  const allSeasonMatchups = s.matchupsBySeason.get(liveSeason.id) ?? []
  if (allSeasonMatchups.length === 0) return null

  // Pinned week (commissioner override / jake test fixture) wins over
  // auto-derived "next unplayed" so a finished historical season can
  // still drive the preview.
  const pinnedWeek = resolveCurrentWeek(liveSeason.settings ?? null)
  let upcomingWeek: number | null = null
  let pinnedMode = false

  if (pinnedWeek != null) {
    const hasPair = allSeasonMatchups.some(
      (m) => m.week === pinnedWeek && !m.is_playoff,
    )
    if (hasPair) {
      upcomingWeek = pinnedWeek
      pinnedMode = true
    }
  }

  if (upcomingWeek == null) {
    // Auto mode: smallest unplayed regular-season week.
    for (const m of allSeasonMatchups) {
      if (m.score_a != null || m.score_b != null) continue
      if (m.is_playoff) continue
      if (upcomingWeek == null || m.week < upcomingWeek) upcomingWeek = m.week
    }
  }
  if (upcomingWeek == null) return null

  const groups = buildProfileGroups(s).filter((g) => !isGroupHidden(g))
  const managerToGroup = buildManagerToGroup(groups)

  // ── Helpers ──────────────────────────────────────────────────
  // Most-recent team name for a group across the live season (preferred)
  // or the latest season it appears in.
  function teamLatest(g: ProfileGroup): string {
    let latestYear = -Infinity
    let latestTeam: string | null = null
    for (const mid of g.managerIds) {
      for (const ms of s.managerSeasonsByManager.get(mid) ?? []) {
        const yr = s.seasons.find((sn) => sn.id === ms.season_id)?.year ?? 0
        if (yr > latestYear && ms.team_name) {
          latestYear = yr
          latestTeam = ms.team_name
        }
      }
    }
    return latestTeam ?? g.primary.team_name ?? groupDisplayName(g)
  }

  function abbrFor(name: string): string {
    const clean = String(name).replace(/[^A-Za-z]/g, '')
    if (!clean) return '—'
    return clean.slice(0, 4).toUpperCase()
  }

  // Walk the live season's scored matchups in week order to compute
  // a per-group record + last-5 form + ppg5 + streak + season-high
  // going into upcomingWeek. fullForm tracks every result this season
  // (needed for the streak counter, which can run longer than 5).
  type GroupForm = {
    wins: number
    losses: number
    ties: number
    pf: number
    pa: number
    games: number
    // most-recent results first (W/L/T)
    form: Array<'W' | 'L' | 'T'>        // capped at 5 for the form pills
    fullForm: Array<'W' | 'L' | 'T'>    // every game this season, newest-first (for streak)
    last5Pf: number[]
    last5Pa: number[]
    // Best scoring week of the season so far: { week, pts }
    seasonHigh: { week: number; pts: number } | null
  }
  function blank(): GroupForm {
    return {
      wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, games: 0,
      form: [], fullForm: [], last5Pf: [], last5Pa: [],
      seasonHigh: null,
    }
  }
  const groupForm = new Map<ProfileGroup, GroupForm>()
  const scoredAsc = allSeasonMatchups
    .filter((m) => m.score_a != null && m.score_b != null && m.week < upcomingWeek!)
    .sort((a, b) => a.week - b.week)
  for (const m of scoredAsc) {
    const ga = managerToGroup.get(m.manager_a_id)
    const gb = managerToGroup.get(m.manager_b_id)
    if (!ga || !gb) continue
    const sa = Number(m.score_a); const sb = Number(m.score_b)
    const fa = groupForm.get(ga) ?? blank()
    const fb = groupForm.get(gb) ?? blank()
    fa.pf += sa; fa.pa += sb; fa.games++
    fb.pf += sb; fb.pa += sa; fb.games++
    let resA: 'W' | 'L' | 'T', resB: 'W' | 'L' | 'T'
    if (sa > sb) { fa.wins++; fb.losses++; resA = 'W'; resB = 'L' }
    else if (sa < sb) { fa.losses++; fb.wins++; resA = 'L'; resB = 'W' }
    else { fa.ties++; fb.ties++; resA = 'T'; resB = 'T' }
    fa.form.unshift(resA); fb.form.unshift(resB)
    fa.fullForm.unshift(resA); fb.fullForm.unshift(resB)
    fa.last5Pf.unshift(sa); fa.last5Pa.unshift(sb)
    fb.last5Pf.unshift(sb); fb.last5Pa.unshift(sa)
    fa.form = fa.form.slice(0, 5); fa.last5Pf = fa.last5Pf.slice(0, 5); fa.last5Pa = fa.last5Pa.slice(0, 5)
    fb.form = fb.form.slice(0, 5); fb.last5Pf = fb.last5Pf.slice(0, 5); fb.last5Pa = fb.last5Pa.slice(0, 5)
    if (fa.seasonHigh == null || sa > fa.seasonHigh.pts) fa.seasonHigh = { week: m.week, pts: round2(sa) }
    if (fb.seasonHigh == null || sb > fb.seasonHigh.pts) fb.seasonHigh = { week: m.week, pts: round2(sb) }
    groupForm.set(ga, fa); groupForm.set(gb, fb)
  }

  // Current win/loss streak from a newest-first fullForm.
  // Returns { kind: 'W' | 'L' | 'T' | null, count }.
  function streakFrom(fullForm: Array<'W' | 'L' | 'T'>): { kind: 'W' | 'L' | 'T' | null; count: number } {
    if (fullForm.length === 0) return { kind: null, count: 0 }
    const kind = fullForm[0]
    let count = 0
    for (const r of fullForm) {
      if (r === kind) count++
      else break
    }
    return { kind, count }
  }
  // Longest WIN streak this season — scan-and-track. Returns 0 when there
  // are no scored games OR the side has never won.
  function longestWinStreakFrom(fullForm: Array<'W' | 'L' | 'T'>): number {
    let best = 0
    let cur = 0
    for (const r of fullForm) {
      if (r === 'W') { cur++; if (cur > best) best = cur }
      else cur = 0
    }
    return best
  }

  // All-time H2H lookup between two groups. Counts every scored
  // regular-season game + championship-bracket playoff games (same
  // rule as buildH2HMatrix).
  type H2HSummary = {
    meetings: number
    winsA: number
    winsB: number
    ties: number
    pfA: number
    pfB: number
    firstYear: number | null
    lastYear: number | null
    recent: Array<{ year: number; week: number; scoreA: number; scoreB: number; winner: 'a' | 'b' | 't' }>
  }
  function h2hBetween(ga: ProfileGroup, gb: ProfileGroup): H2HSummary {
    const sum: H2HSummary = {
      meetings: 0, winsA: 0, winsB: 0, ties: 0, pfA: 0, pfB: 0,
      firstYear: null, lastYear: null, recent: [],
    }
    const meetings: Array<{ year: number; week: number; scoreA: number; scoreB: number; winner: 'a' | 'b' | 't' }> = []
    for (const arr of s.matchupsBySeason.values()) {
      for (const m of arr) {
        if (m.score_a == null || m.score_b == null) continue
        if (m.is_playoff) {
          const aRank = s.finalRankByMgrSeason.get(`${m.season_id}|${m.manager_a_id}`) ?? null
          const bRank = s.finalRankByMgrSeason.get(`${m.season_id}|${m.manager_b_id}`) ?? null
          if (!((aRank != null && aRank <= 4) || (bRank != null && bRank <= 4))) continue
        }
        const mA = managerToGroup.get(m.manager_a_id)
        const mB = managerToGroup.get(m.manager_b_id)
        if (!mA || !mB) continue
        // Orient to ga = "a side", gb = "b side"
        let aScore: number; let bScore: number
        if (mA === ga && mB === gb) { aScore = Number(m.score_a); bScore = Number(m.score_b) }
        else if (mA === gb && mB === ga) { aScore = Number(m.score_b); bScore = Number(m.score_a) }
        else continue
        const year = s.seasons.find((sn) => sn.id === m.season_id)?.year ?? 0
        sum.meetings++
        sum.pfA += aScore; sum.pfB += bScore
        const winner: 'a' | 'b' | 't' = aScore > bScore ? 'a' : aScore < bScore ? 'b' : 't'
        if (winner === 'a') sum.winsA++
        else if (winner === 'b') sum.winsB++
        else sum.ties++
        if (year > 0) {
          if (sum.firstYear == null || year < sum.firstYear) sum.firstYear = year
          if (sum.lastYear == null || year > sum.lastYear) sum.lastYear = year
        }
        meetings.push({ year, week: m.week, scoreA: round2(aScore), scoreB: round2(bScore), winner })
      }
    }
    // Sort meetings newest-first; keep up to 3 for the "recent" strip.
    meetings.sort((x, y) => (y.year - x.year) || (y.week - x.week))
    sum.recent = meetings.slice(0, 3)
    sum.pfA = round2(sum.pfA); sum.pfB = round2(sum.pfB)
    return sum
  }

  // Build the matchup cards for upcomingWeek.
  type Card = {
    train: string
    plat: string
    a: Record<string, unknown>
    b: Record<string, unknown>
    h2h: H2HSummary
    projected: { a: number; b: number; spread: number; favorite: 'a' | 'b' | 'pp' }
    gotw: boolean
  }
  const week = upcomingWeek
  // In auto mode we require null scores (it's a true upcoming slate).
  // In pinned mode we take whatever rows exist for that week — they may
  // already be scored (jake's frozen 2025 W10 fixture) but the preview
  // is still meaningful as a "what would have looked like, going in" view.
  const upcomingPairs = allSeasonMatchups
    .filter((m) => {
      if (m.week !== week || m.is_playoff) return false
      if (pinnedMode) return true
      return m.score_a == null && m.score_b == null
    })
    // Stable order: by manager_a_id so re-renders don't shuffle.
    .sort((a, b) => a.manager_a_id.localeCompare(b.manager_a_id))

  // GOTW: settings.gotw is { [week]: matchupId } — pull the ID for this week.
  const gotwMap = ((liveSeason.settings ?? {}) as Record<string, unknown>).gotw as
    | Record<string, string>
    | undefined
  const gotwMatchupId = gotwMap?.[String(week)] ?? null

  const cards: Card[] = []
  let gotwIdx: number | null = null
  upcomingPairs.forEach((m, i) => {
    const ga = managerToGroup.get(m.manager_a_id)
    const gb = managerToGroup.get(m.manager_b_id)
    if (!ga || !gb) return
    const fa = groupForm.get(ga) ?? blank()
    const fb = groupForm.get(gb) ?? blank()
    const ppgA = fa.last5Pf.length
      ? round2(fa.last5Pf.reduce((x, y) => x + y, 0) / fa.last5Pf.length)
      : 0
    const ppgB = fb.last5Pf.length
      ? round2(fb.last5Pf.reduce((x, y) => x + y, 0) / fb.last5Pf.length)
      : 0
    const nameA = groupDisplayName(ga)
    const nameB = groupDisplayName(gb)
    function sideJson(g: ProfileGroup, f: GroupForm, name: string, ppg: number): Record<string, unknown> {
      const sk = streakFrom(f.fullForm)
      const lws = longestWinStreakFrom(f.fullForm)
      const ppgSeason = f.games > 0 ? round2(f.pf / f.games) : 0
      return {
        uid: userId(g.primary),
        name,
        team: teamLatest(g),
        abbr: abbrFor(name),
        record: recordStr(f.wins, f.losses, f.ties),
        form: f.form,                         // last-5, newest-first
        ppg5: ppg,                            // last-5 avg
        ppgSeason,                            // season-long avg (for the board column)
        pf: round2(f.pf),
        pa: round2(f.pa),
        streak: sk.kind ? { kind: sk.kind, count: sk.count } : null,
        longestWinStreak: lws,                // best consecutive W run this season (0 if none)
        seasonHigh: f.seasonHigh,             // { week, pts } or null
      }
    }
    const h2h = h2hBetween(ga, gb)
    const spread = round2(ppgA - ppgB)
    const fav: 'a' | 'b' | 'pp' = ppgA === 0 && ppgB === 0
      ? 'pp'                  // preseason / no data yet → pick'em
      : spread > 0 ? 'a' : spread < 0 ? 'b' : 'pp'
    const isGotw = !!(gotwMatchupId && m.id && m.id === gotwMatchupId)
    if (isGotw) gotwIdx = i
    cards.push({
      // Train number: "WW.NN" (week.matchup index). NN is 01-based.
      train: `${week}.${String(i + 1).padStart(2, '0')}`,
      // Platform: roman numeral matchup index.
      plat: toRomanLite(i + 1),
      a: sideJson(ga, fa, nameA, ppgA),
      b: sideJson(gb, fb, nameB, ppgB),
      h2h,
      projected: { a: ppgA, b: ppgB, spread: Math.abs(spread), favorite: fav },
      gotw: isGotw,
    })
  })

  if (cards.length === 0) return null

  // Manager directory for the picker dropdown — every active group that
  // shows up in an upcoming matchup, sorted alphabetically.
  type DirEntry = { uid: string; name: string; team: string; matchupIdx: number }
  const directory: DirEntry[] = []
  cards.forEach((c, idx) => {
    for (const side of [c.a, c.b]) {
      const uid = side.uid as string | null
      if (!uid) continue
      directory.push({
        uid,
        name: side.name as string,
        team: side.team as string,
        matchupIdx: idx,
      })
    }
  })
  directory.sort((x, y) => x.name.localeCompare(y.name))

  return {
    year: liveSeason.year,
    week,
    weekRoman: toRomanLite(week),
    pinned: pinnedMode,   // true when commissioner override / test fixture is driving the week
    gotwIdx,              // index into matchups[] of the featured Game of the Week, or null
    matchups: cards,
    managers: directory,
  }
}

// Tiny roman-numeral helper local to live-season feeds. The main route
// handler already exports one for tokens; we keep a local copy so this
// builder stays self-contained inside the export bundle pipeline.
function toRomanLite(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  const numerals: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  let v = Math.floor(n)
  for (const [val, sym] of numerals) {
    while (v >= val) { out += sym; v -= val }
  }
  return out
}

// ============================================================
// Live-season previews: records_watch + milestones snapshots
// Frozen at end of regular-season week N for a chosen year so
// the live-season templates can be evaluated against real data.
// Currently used only when slug === 'jake' (see exportLeague).
// ============================================================

// ============================================================
// playoff_odds.json (frozen jake-only preview) — Monte Carlo
// projection from end-of-week N for a given historical season.
// Mirrors the live powerrank route's sim setup against snapshot
// data so the trackboard's Odds tab can show real numbers in the
// off-season without the league being flagged is_live.
// ============================================================
function buildPlayoffOddsPreview(
  s: Snapshot,
  year: number,
  throughWeek: number,
): unknown | null {
  const season = s.seasons.find((sn) => sn.year === year)
  if (!season) return null
  const matchups = s.matchupsBySeason.get(season.id) ?? []
  const mss = s.managerSeasonsBySeason.get(season.id) ?? []
  if (matchups.length === 0 || mss.length === 0) return null

  // Walk every regular-season game up to and including throughWeek to
  // assemble each team's W/L/PF and the league-wide score distribution.
  const teamWins = new Map<string, number>()
  const teamLosses = new Map<string, number>()
  const teamPf = new Map<string, number>()
  const teamGames = new Map<string, number>()
  const scores: number[] = []

  for (const m of matchups) {
    if (m.is_playoff) continue
    if (m.week > throughWeek) continue
    if (m.score_a == null || m.score_b == null) continue
    const sa = Number(m.score_a)
    const sb = Number(m.score_b)
    scores.push(sa, sb)
    teamPf.set(m.manager_a_id, (teamPf.get(m.manager_a_id) ?? 0) + sa)
    teamPf.set(m.manager_b_id, (teamPf.get(m.manager_b_id) ?? 0) + sb)
    teamGames.set(m.manager_a_id, (teamGames.get(m.manager_a_id) ?? 0) + 1)
    teamGames.set(m.manager_b_id, (teamGames.get(m.manager_b_id) ?? 0) + 1)
    if (sa > sb) {
      teamWins.set(m.manager_a_id, (teamWins.get(m.manager_a_id) ?? 0) + 1)
      teamLosses.set(m.manager_b_id, (teamLosses.get(m.manager_b_id) ?? 0) + 1)
    } else if (sb > sa) {
      teamWins.set(m.manager_b_id, (teamWins.get(m.manager_b_id) ?? 0) + 1)
      teamLosses.set(m.manager_a_id, (teamLosses.get(m.manager_a_id) ?? 0) + 1)
    }
  }
  if (scores.length < 4) return null

  // Remaining: matchups after throughWeek but before the playoff bracket
  // starts. Treat them as unplayed regardless of whether the DB happens to
  // hold their final scores (this is a frozen W-N snapshot, not "now").
  const playoffWeeks = season.playoff_weeks ?? []
  const playoffStart = playoffWeeks.length > 0 ? Math.min(...playoffWeeks) : 15
  const remaining = matchups
    .filter((m) => !m.is_playoff && m.week > throughWeek && m.week < playoffStart)
    .map((m) => ({ a: m.manager_a_id, b: m.manager_b_id }))
  if (remaining.length === 0) return null

  // Score SD across every completed regular-season point total.
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const scoreSd = Math.sqrt(
    scores.reduce((a, v) => a + (v - mean) ** 2, 0) / scores.length,
  )

  // Per-team PPG (fall back to league avg for any team with no completed
  // games — shouldn't happen at W10 but guard anyway).
  const ppgVals: number[] = []
  for (const ms of mss) {
    const gp = teamGames.get(ms.manager_id) ?? 0
    if (gp > 0) ppgVals.push((teamPf.get(ms.manager_id) ?? 0) / gp)
  }
  const leagueAvgPpg = ppgVals.length > 0 ? ppgVals.reduce((a, b) => a + b, 0) / ppgVals.length : 105

  // Playoff structure — same defaults the live route uses when settings
  // don't expose a playoff_team_count.
  const teamCount = mss.length
  const playoffTeams = teamCount >= 10 ? 6 : Math.max(2, Math.round(teamCount / 2))
  const byeTeams = playoffTeams === 6 ? 2 : 0

  const simTeams: SimTeam[] = mss.map((ms) => {
    const gp = teamGames.get(ms.manager_id) ?? 0
    const pf = teamPf.get(ms.manager_id) ?? 0
    return {
      teamId: ms.manager_id,
      division: ms.division_index ?? null,
      ppg: gp > 0 ? pf / gp : leagueAvgPpg,
      startWins: teamWins.get(ms.manager_id) ?? 0,
      startLosses: teamLosses.get(ms.manager_id) ?? 0,
      startPf: pf,
    }
  })

  const projections = simulateSeason(simTeams, remaining, {
    scoreSd, playoffTeams, byeTeams, runs: 8000,
  })

  const teams = simTeams.map((t) => {
    const mgr = s.managers.get(t.teamId)
    const ms = mss.find((x) => x.manager_id === t.teamId)
    const p = projections.get(t.teamId)
    const wins = teamWins.get(t.teamId) ?? 0
    const losses = teamLosses.get(t.teamId) ?? 0
    const games = teamGames.get(t.teamId) ?? 0
    const pf = teamPf.get(t.teamId) ?? 0
    return {
      manager_id: t.teamId,
      team_name: ms?.team_name ?? mgr?.team_name ?? mgr?.display_name ?? '—',
      manager: mgr?.display_name ?? '—',
      wins,
      losses,
      pf: round2(pf),
      ppg: games > 0 ? round2(pf / games) : 0,
      proj_wins: p?.proj_wins ?? 0,
      proj_losses: p?.proj_losses ?? 0,
      playoff_pct: p?.playoff_pct ?? 0,
      bye_pct: p?.bye_pct ?? 0,
    }
  }).sort((a, b) => b.playoff_pct - a.playoff_pct)

  return {
    year,
    through_week: throughWeek,
    playoff_teams: playoffTeams,
    bye_teams: byeTeams,
    teams,
  }
}

function buildLiveSeasonPreviews(
  s: Snapshot,
  year: number,
  throughWeek: number,
): { records_watch: unknown; milestones: unknown } {
  // Preseason mode: when no DB row exists for `year` (e.g. year = lastYear+1
  // before the upcoming season has been ingested), or when throughWeek is 0
  // with no completed games yet, the in-season slice is empty. The function
  // still produces useful milestone "horizon" / "imminent" output because
  // those are computed from all-time career totals + the active streak that
  // carries over from the prior season. Records_watch will be mostly empty
  // (no current-season pace items, no in-season weekly extremes) — that's
  // intentional, the watch page reads as "nothing on the brink yet".

  // Resolve manager.id → canonical display name (profile-group aware).
  const groups = buildProfileGroups(s)
  const managerToGroup = buildManagerToGroup(groups)
  const nameOf = (mid: string): string => {
    const m = s.managers.get(mid)
    if (!m) return ''
    const g = managerToGroup.get(m.id)
    return g ? groupDisplayName(g) : m.display_name
  }

  // Career H2H between two profile groups, as of (asOfYear, asOfWeek).
  // Returns "W-L" string (e.g. "3-2"). Inclusive of the as-of game so the
  // milestone game itself is counted in the running total. Returns '' if
  // either id has no profile group (orphans without games).
  function h2hThrough(myMid: string, oppMid: string, asOfYear: number, asOfWeek: number): string {
    const myG = managerToGroup.get(myMid)
    const oppG = managerToGroup.get(oppMid)
    if (!myG || !oppG) return ''
    let w = 0, l = 0
    for (const mid of myG.managerIds) {
      const games = gamesByManager.get(mid)
      if (!games) continue
      for (const gm of games) {
        if (!oppG.managerIds.has(gm.opp_id)) continue
        if (gm.year > asOfYear || (gm.year === asOfYear && gm.week > asOfWeek)) continue
        if (gm.result === 'W') w++
        else if (gm.result === 'L') l++
      }
    }
    return `${w}-${l}`
  }

  type TaggedGame = ManagerGame & { year: number }
  const yearOfSeason = new Map<string, number>()
  for (const sn of s.seasons) yearOfSeason.set(sn.id, sn.year)

  // Per-manager chronological games, regular + championship-bracket only
  // (consolation/placement games are excluded, matching buildRecordBook).
  const gamesByManager = new Map<string, TaggedGame[]>()
  for (const m of s.managers.values()) {
    const raw = (s.matchupsByManager.get(m.id) ?? [])
      .map((mt) => asManagerGame(mt, m.id))
      .filter((g): g is ManagerGame => g != null)
    const inScope = raw.filter((g) => !g.is_playoff || isChampionshipBracketGame(s, g))
    const tagged: TaggedGame[] = inScope.map((g) => ({ ...g, year: yearOfSeason.get(g.season_id) ?? 0 }))
    tagged.sort((a, b) => a.year - b.year || a.week - b.week)
    gamesByManager.set(m.id, tagged)
  }

  // ── ALL-TIME (pre-{year}) weekly extremes — the marks 2025 chases.
  type Extreme = { val: number; mid: string; year: number; week: number; opp: string; self: number; oppScore: number }
  const seed: Extreme = { val: -Infinity, mid: '', year: 0, week: 0, opp: '', self: 0, oppScore: 0 }
  let allHigh: Extreme = { ...seed }
  let allLow: Extreme = { ...seed, val: Infinity }
  let allBlowout: Extreme = { ...seed }
  let allCombined: Extreme = { ...seed }
  for (const [mid, games] of gamesByManager) {
    for (const g of games) {
      if (g.year >= year) continue
      if (g.self_score > allHigh.val) allHigh = { val: g.self_score, mid, year: g.year, week: g.week, opp: nameOf(g.opp_id), self: g.self_score, oppScore: g.opp_score }
      if (g.self_score < allLow.val)  allLow  = { val: g.self_score, mid, year: g.year, week: g.week, opp: nameOf(g.opp_id), self: g.self_score, oppScore: g.opp_score }
      if (g.result === 'W' && g.margin > allBlowout.val) allBlowout = { val: g.margin, mid, year: g.year, week: g.week, opp: nameOf(g.opp_id), self: g.self_score, oppScore: g.opp_score }
      const combined = g.self_score + g.opp_score
      if (combined > allCombined.val) allCombined = { val: combined, mid, year: g.year, week: g.week, opp: nameOf(g.opp_id), self: g.self_score, oppScore: g.opp_score }
    }
  }

  // ── ALL-TIME (pre-{year}) longest streak + its holder, now with the
  // start + end games so the brink card can stamp the date range.
  type StreakInfo = {
    len: number; mid: string;
    startYear: number; startWeek: number;
    endYear:   number; endWeek:   number;
  }
  let allWinStreak: StreakInfo = { len: 0, mid: '', startYear: 0, startWeek: 0, endYear: 0, endWeek: 0 }
  let allLossStreak: StreakInfo = { len: 0, mid: '', startYear: 0, startWeek: 0, endYear: 0, endWeek: 0 }
  for (const [mid, games] of gamesByManager) {
    let runLen = 0
    let runStart: TaggedGame | null = null
    let runType: 'W' | 'L' | null = null
    for (const g of games) {
      if (g.year >= year) break
      if (g.result === 'W' || g.result === 'L') {
        if (g.result === runType) {
          runLen++
        } else {
          runType = g.result
          runStart = g
          runLen = 1
        }
        if (runType === 'W' && runLen > allWinStreak.len) {
          allWinStreak = { len: runLen, mid,
            startYear: runStart!.year, startWeek: runStart!.week,
            endYear: g.year, endWeek: g.week,
          }
        }
        if (runType === 'L' && runLen > allLossStreak.len) {
          allLossStreak = { len: runLen, mid,
            startYear: runStart!.year, startWeek: runStart!.week,
            endYear: g.year, endWeek: g.week,
          }
        }
      } else {
        runType = null; runStart = null; runLen = 0
      }
    }
  }
  // Helper to format a streak's date range as the holder_when string.
  function streakSpan(s: StreakInfo): string {
    if (s.startYear === s.endYear) return `W${s.startWeek} – W${s.endWeek} · ${s.startYear}`
    return `W${s.startWeek} '${String(s.startYear).slice(-2)} – W${s.endWeek} '${String(s.endYear).slice(-2)}`
  }

  // ── PER-MANAGER {year}-through-W{throughWeek} stats.
  type SeasonStats = {
    mid: string
    name: string
    games: TaggedGame[]
    bestWeek?: TaggedGame
    worstWeek?: TaggedGame
    bestBlowout?: TaggedGame
    bestCombined?: TaggedGame
    activeStreak: { type: 'W' | 'L' | 'T'; len: number; lastWeek: number }
    wins: number
    losses: number
    pf: number
  }
  const seasonByMgr: SeasonStats[] = []
  for (const [mid, games] of gamesByManager) {
    const slice = games.filter((g) => g.year === year && g.week <= throughWeek)
    if (slice.length === 0) continue
    const stats: SeasonStats = {
      mid,
      name: nameOf(mid),
      games: slice,
      activeStreak: { type: 'T', len: 0, lastWeek: 0 },
      wins: 0, losses: 0, pf: 0,
    }
    for (const g of slice) {
      stats.pf += g.self_score
      if (g.result === 'W') stats.wins++
      else if (g.result === 'L') stats.losses++
      if (!stats.bestWeek || g.self_score > stats.bestWeek.self_score) stats.bestWeek = g
      if (!stats.worstWeek || g.self_score < stats.worstWeek.self_score) stats.worstWeek = g
      if (g.result === 'W' && (!stats.bestBlowout || g.margin > stats.bestBlowout.margin)) stats.bestBlowout = g
      const cs = g.self_score + g.opp_score
      const prevCs = stats.bestCombined ? stats.bestCombined.self_score + stats.bestCombined.opp_score : -Infinity
      if (cs > prevCs) stats.bestCombined = g
    }
    // Active streak: walk back across ALL-TIME games while the result matches
    // the most recent one. A streak that began at end of {year-1} carries over.
    const last = slice[slice.length - 1]
    if (last.result === 'W' || last.result === 'L') {
      stats.activeStreak = { type: last.result, len: 0, lastWeek: last.week }
      for (let i = games.length - 1; i >= 0; i--) {
        const g = games[i]
        if (g.year > year || (g.year === year && g.week > throughWeek)) continue
        if (g.result === last.result) stats.activeStreak.len++
        else break
      }
    }
    seasonByMgr.push(stats)
  }

  // ── Estimate regular-season length from most-recent completed season.
  // Used to project current-pace records out to full-season totals.
  const regSeasonLen = estimateRegSeasonLength(s, year)

  // ── ALL-TIME (pre-{year}) best season-level marks from manager_seasons.
  // manager_seasons.{wins,losses,points_for} are regular-season totals, so
  // they line up cleanly with current-season pace projections.
  let bestSeasonPF = { val: 0, mid: '', year: 0 }
  let mostRegWins  = { val: 0, mid: '', year: 0 }
  let mostRegLoss  = { val: 0, mid: '', year: 0 }
  let bestSeasonPPG = { val: 0, mid: '', year: 0 }
  for (const sn of s.seasons) {
    if (sn.year >= year) continue
    const mss = s.managerSeasonsBySeason.get(sn.id) ?? []
    for (const ms of mss) {
      const pf = Number(ms.points_for)
      const games = ms.wins + ms.losses + ms.ties
      if (pf > bestSeasonPF.val)    bestSeasonPF   = { val: pf, mid: ms.manager_id, year: sn.year }
      if (ms.wins   > mostRegWins.val) mostRegWins   = { val: ms.wins, mid: ms.manager_id, year: sn.year }
      if (ms.losses > mostRegLoss.val) mostRegLoss   = { val: ms.losses, mid: ms.manager_id, year: sn.year }
      const ppg = games > 0 ? pf / games : 0
      if (ppg > bestSeasonPPG.val)   bestSeasonPPG  = { val: ppg, mid: ms.manager_id, year: sn.year }
    }
  }

  // ── Build the two record buckets.
  //
  // accumItems → records that build up across the season (PF, wins,
  // losses, active streaks). These bucket into brink / chase / broken
  // because the curve is monotone — once you're 85% there, it's real.
  //
  // justMissedItems → records that swing wildly week-to-week (single-
  // week high/low, biggest blowout, highest combined). These don't
  // belong in "brink" — a 240-pt week doesn't mean the next one will
  // be 250. We surface the closest 2025 attempts that just missed.
  type WatchItem = {
    category: string
    pct: number
    flag: string
    title_html: string
    holder: string
    record_value: string
    holder_when: string
    chaser: string
    chaser_value: string
    chaser_when: string
    gap: string
    // realized=true means the record has ACTUALLY been crossed (a
    // single-week high already happened, an active streak already
    // exceeds the all-time mark, a Quickest-to-X already crossed in
    // fewer games). realized=false means the comparison is a
    // projection — the season isn't over so it hasn't "happened" yet.
    // Used for bucketing into Broken (§01) vs On Pace (§02).
    realized?: boolean
    readout_sub?: string
    // Projection text rendered as the sub-line on On-Pace cards.
    // Keeps the projected end-of-season value separate from
    // chaser_when (which now carries just the as-of date).
    chaser_projection?: string
    // Optional sub-line under the chaser name on Brink + On-Pace
    // cards. Used by Quickest-to-X to show the chaser's career
    // W-L record (e.g. "50-25") so the games-played bar label
    // still has context.
    chaser_sub?: string
    // Numeric triple for the brink meter "projection past mark"
    // layout. When projection_numeric > record_numeric, the bar
    // track represents 0 → projection, the mark line slides inward
    // to (record / projection) × 100%, and the right-edge label
    // becomes the projected value. Streaks + Quickest leave these
    // undefined so they keep the old (mark @ right edge) layout.
    current_numeric?: number
    record_numeric?: number
    projection_numeric?: number
    projection_short?: string
    copy_html?: string
    when?: string
    previous?: string
  }
  const accumItems: WatchItem[] = []
  const justMissedItems: WatchItem[] = []

  // ── Season PF pace (proj = current PF / games × regSeasonLen)
  const pfPaceTop = seasonByMgr
    .filter((m) => m.games.length > 0)
    .map((m) => ({ m, proj: (m.pf / m.games.length) * regSeasonLen }))
    .sort((a, b) => b.proj - a.proj)[0]
  if (pfPaceTop && bestSeasonPF.val > 0) {
    // pct reads as CURRENT progress vs the record (so a chaser with
    // half the record's PF sits at 50%) — not the projection, which
    // would put any mid-season pace at well above 100%. Projection
    // info stays in chaser_when + gap below.
    const v = pfPaceTop.m.pf, r = bestSeasonPF.val, pct = (v / r) * 100
    const gap = Math.round(pfPaceTop.proj - r)
    const projInt = Math.round(pfPaceTop.proj)
    // Holder's PPG: find their game count from manager_seasons for that year
    let holderPPG = 0
    const holderMs = (s.managerSeasonsBySeason.get(s.seasons.find((sn) => sn.year === bestSeasonPF.year)?.id ?? '') ?? [])
      .find((ms) => ms.manager_id === bestSeasonPF.mid)
    if (holderMs) {
      const holderGames = holderMs.wins + holderMs.losses + holderMs.ties
      if (holderGames > 0) holderPPG = bestSeasonPF.val / holderGames
    }
    const chaserPPG = pfPaceTop.m.pf / pfPaceTop.m.games.length
    accumItems.push({
      category: 'Season Points-For Pace',
      pct,
      // Strict > so a tie sits in Brink (visual: bar fills to 100%
      // right at the mark line). Once they actually go past, realized
      // flips true and they move to Broken.
      realized: v > r,
      flag: flagFor(pct, 'WILL BREAK IT', 'PROJECTING PAST', 'ON PACE', 'TRENDING UP'),
      title_html: `${Math.round(r)} pts <em>· highest reg-season PF</em>`,
      holder: nameOf(bestSeasonPF.mid),
      record_value: holderPPG > 0 ? `${Math.round(r)} pts · ${holderPPG.toFixed(1)} PPG` : `${Math.round(r)} pts`,
      holder_when: `${bestSeasonPF.year}`,
      chaser: pfPaceTop.m.name,
      chaser_value: `${Math.round(pfPaceTop.m.pf)} pts through ${pfPaceTop.m.games.length} Games`,
      chaser_when: `W${throughWeek} · ${year}`,
      chaser_projection: `pace ${projInt} pts · ${chaserPPG.toFixed(1)} PPG`,
      current_numeric: pfPaceTop.m.pf,
      record_numeric: r,
      projection_numeric: pfPaceTop.proj,
      projection_short: `${projInt} pts`,
      gap: gap >= 0 ? `+${gap} pts on pace` : `${Math.abs(gap)} pts short on pace`,
      copy_html: `<em>${escTxt(pfPaceTop.m.name)}</em> · pace ${projInt} pts (${chaserPPG.toFixed(1)} PPG)`,
      when: `W${throughWeek} · ${year}`,
      previous: `${Math.round(r)} pts · ${nameOf(bestSeasonPF.mid)}, ${bestSeasonPF.year}`,
    })
  }

  // PPG pace dropped — that record can only be settled at end of season
  // and would otherwise leak into Broken mid-season. The PF pace card
  // already shows the holder's PPG as a sub on record_value, and the
  // chaser's PPG rides on chaser_projection below, so PPG is still in
  // view without a dedicated section.

  // ── Regular-season WINS pace (only meaningful past midweek; gate at W5)
  if (throughWeek >= 5) {
    const winsPaceTop = seasonByMgr
      .filter((m) => m.games.length > 0)
      .map((m) => ({ m, proj: (m.wins / m.games.length) * regSeasonLen }))
      .sort((a, b) => b.proj - a.proj)[0]
    if (winsPaceTop && mostRegWins.val > 0) {
      // pct = current wins vs record so 4-of-9 reads as 44% (On Pace),
      // not "on pace for 11" which would read as 122% (Brink). Projection
      // info still flows through chaser_when + gap.
      const v = winsPaceTop.m.wins, r = mostRegWins.val, pct = (v / r) * 100
      const projInt = Math.round(winsPaceTop.proj)
      const gap = Math.round(winsPaceTop.proj - r)
      accumItems.push({
        category: 'Reg-Season Wins Pace',
        pct,
        realized: v > r,
        flag: flagFor(pct, 'WILL MATCH OR PASS', 'ON PACE TO TIE', 'BIG W-PACE', 'STRONG START'),
        title_html: `${r} wins <em>· most reg-season wins</em>`,
        holder: nameOf(mostRegWins.mid), record_value: `${r} wins`,
        holder_when: `${mostRegWins.year}`,
        chaser: winsPaceTop.m.name,
        chaser_value: `${winsPaceTop.m.wins}-${winsPaceTop.m.losses} through ${winsPaceTop.m.games.length} Games`,
        chaser_when: `W${throughWeek} · ${year}`,
        chaser_projection: `pace ${projInt} wins`,
        current_numeric: winsPaceTop.m.wins,
        record_numeric: r,
        projection_numeric: winsPaceTop.proj,
        projection_short: `${projInt} wins`,
        gap: gap >= 0 ? `+${gap} wins on pace` : `${Math.abs(gap)} wins short on pace`,
        copy_html: `<em>${escTxt(winsPaceTop.m.name)}</em> · pace ${projInt} wins (${winsPaceTop.m.wins}-${winsPaceTop.m.losses})`,
        when: `W${throughWeek} · ${year}`,
        previous: `${r} wins · ${nameOf(mostRegWins.mid)}, ${mostRegWins.year}`,
      })
    }

    // ── Regular-season LOSSES pace
    const lossPaceTop = seasonByMgr
      .filter((m) => m.games.length > 0)
      .map((m) => ({ m, proj: (m.losses / m.games.length) * regSeasonLen }))
      .sort((a, b) => b.proj - a.proj)[0]
    if (lossPaceTop && mostRegLoss.val > 0) {
      // Same current-based pct rule as wins pace — projection info
      // stays in chaser_when + gap.
      const v = lossPaceTop.m.losses, r = mostRegLoss.val, pct = (v / r) * 100
      const projInt = Math.round(lossPaceTop.proj)
      const gap = Math.round(lossPaceTop.proj - r)
      accumItems.push({
        category: 'Reg-Season Losses Pace',
        pct,
        realized: v > r,
        flag: flagFor(pct, 'WORST SEASON INCOMING', 'TANK PACE', 'STRUGGLING', 'ROUGH RUN'),
        title_html: `${r} losses <em>· most reg-season losses</em>`,
        holder: nameOf(mostRegLoss.mid), record_value: `${r} losses`,
        holder_when: `${mostRegLoss.year}`,
        chaser: lossPaceTop.m.name,
        chaser_value: `${lossPaceTop.m.wins}-${lossPaceTop.m.losses} through ${lossPaceTop.m.games.length} Games`,
        chaser_when: `W${throughWeek} · ${year}`,
        chaser_projection: `pace ${projInt} losses`,
        current_numeric: lossPaceTop.m.losses,
        record_numeric: r,
        projection_numeric: lossPaceTop.proj,
        projection_short: `${projInt} losses`,
        gap: gap >= 0 ? `+${gap} losses on pace` : `${Math.abs(gap)} losses short on pace`,
        copy_html: `<em>${escTxt(lossPaceTop.m.name)}</em> · pace ${projInt} losses (${lossPaceTop.m.wins}-${lossPaceTop.m.losses})`,
        when: `W${throughWeek} · ${year}`,
        previous: `${r} losses · ${nameOf(mostRegLoss.mid)}, ${mostRegLoss.year}`,
      })
    }
  }

  // ── Active win streak vs all-time longest
  const liveWin = seasonByMgr.filter((m) => m.activeStreak.type === 'W' && m.activeStreak.len > 0)
    .sort((a, b) => b.activeStreak.len - a.activeStreak.len)[0]
  if (liveWin && allWinStreak.len > 0) {
    const v = liveWin.activeStreak.len, r = allWinStreak.len, pct = (v / r) * 100
    accumItems.push({
      category: 'Longest Win Streak',
      pct,
      realized: v > r,
      flag: flagFor(pct, 'TIED OR SURPASSED', 'ONE FROM HISTORY', 'ON THE BRINK', 'HEATING UP'),
      title_html: `${r} wins <em>· longest streak ever</em>`,
      holder: nameOf(allWinStreak.mid), record_value: `${r} wins in a row`,
      holder_when: streakSpan(allWinStreak),
      chaser: liveWin.name, chaser_value: `${v} wins active`,
      chaser_when: `W${throughWeek} · ${year}`,
      gap: pct >= 100 ? `+${v - r} wins past the line` : `${r - v} wins to tie`,
      copy_html: `<em>${escTxt(liveWin.name)}</em> on a ${v}-game win streak`,
      when: `W${throughWeek} · ${year}`,
      previous: `${r} wins · ${nameOf(allWinStreak.mid)}`,
    })
  }

  // ── Active loss streak vs all-time longest
  const liveLoss = seasonByMgr.filter((m) => m.activeStreak.type === 'L' && m.activeStreak.len > 0)
    .sort((a, b) => b.activeStreak.len - a.activeStreak.len)[0]
  if (liveLoss && allLossStreak.len > 0) {
    const v = liveLoss.activeStreak.len, r = allLossStreak.len, pct = (v / r) * 100
    accumItems.push({
      category: 'Longest Losing Skid',
      pct,
      realized: v > r,
      flag: flagFor(pct, 'NEW SKID HIGH', 'COLD AS ICE', 'STRUGGLING', 'ROUGH PATCH'),
      title_html: `${r} losses <em>· longest skid ever</em>`,
      holder: nameOf(allLossStreak.mid), record_value: `${r} losses in a row`,
      holder_when: streakSpan(allLossStreak),
      chaser: liveLoss.name, chaser_value: `${v} losses active`,
      chaser_when: `W${throughWeek} · ${year}`,
      gap: pct >= 100 ? `+${v - r} losses past` : `${r - v} losses to tie`,
      copy_html: `<em>${escTxt(liveLoss.name)}</em> has dropped ${v} straight`,
      when: `W${throughWeek} · ${year}`,
      previous: `${r} losses · ${nameOf(allLossStreak.mid)}`,
    })
  }

  // ── QUICKEST TO X: career milestone-crossing speed records.
  //
  // For each tier T (win count or PF total), the record holder is the
  // manager who reached T in the FEWEST career games. Active chasers in
  // {year} who haven't crossed T yet get projected forward — if their
  // pace would put them at T in fewer games than the current record,
  // they're brink/broken-bound. Same WatchItem shape as everything else
  // so the existing template renders them.
  {
    // Build per-group career walks: chronological game order, with
    // running totals. We need this for crossing-detection.
    type Walk = {
      mid: string         // group primary id
      name: string
      games: TaggedGame[] // all-time games (pre-{year} + {year} W1..throughWeek)
    }
    const walks: Walk[] = []
    for (const g of groups) {
      if (isGroupHidden(g)) continue
      const acc: TaggedGame[] = []
      for (const mid of g.managerIds) {
        const arr = gamesByManager.get(mid) ?? []
        for (const gm of arr) {
          if (gm.year < year) acc.push(gm)
          else if (gm.year === year && gm.week <= throughWeek) acc.push(gm)
        }
      }
      acc.sort((a, b) => a.year - b.year || a.week - b.week)
      walks.push({ mid: g.primary.id, name: groupDisplayName(g), games: acc })
    }

    // Detect tier crossings. For wins: cumulative wins crossing T. For PF:
    // cumulative PF crossing T. Returns { gamesToTier, year, week } at the
    // crossing game, or null if not yet crossed.
    type Crossing = { games: number; year: number; week: number }
    function crossingForWins(w: Walk, T: number): Crossing | null {
      let cumW = 0
      for (let i = 0; i < w.games.length; i++) {
        const g = w.games[i]
        if (g.result === 'W') cumW++
        if (cumW >= T) return { games: i + 1, year: g.year, week: g.week }
      }
      return null
    }
    function crossingForPF(w: Walk, T: number): Crossing | null {
      let cumPF = 0
      for (let i = 0; i < w.games.length; i++) {
        cumPF += w.games[i].self_score
        if (cumPF >= T) return { games: i + 1, year: w.games[i].year, week: w.games[i].week }
      }
      return null
    }

    type TierCfg = {
      kind: 'wins' | 'points'
      values: number[]
      label: (t: number) => string
      fmtT: (t: number) => string
      fmtGames: (n: number) => string
    }
    const tierCfgs: TierCfg[] = [
      {
        kind: 'wins',
        values: [10, 25, 50, 75, 100, 125, 150],
        label: (t) => `Quickest to ${t} Wins`,
        fmtT: (t) => `${t} wins`,
        fmtGames: (n) => `${n} games`,
      },
      {
        kind: 'points',
        values: [2500, 5000, 7500, 10000, 12500, 15000, 17500, 20000],
        label: (t) => `Quickest to ${t.toLocaleString()} Pts`,
        fmtT: (t) => `${t.toLocaleString()} pts`,
        fmtGames: (n) => `${n} games`,
      },
    ]

    for (const cfg of tierCfgs) {
      for (const T of cfg.values) {
        // Find the all-time record (pre-{year}-or-earlier) — fastest games-to-T
        // among walks that already crossed T before {year}.
        let recordHolder: { walk: Walk; games: number; year: number } | null = null
        // Track each walk's crossing if any; reused for chase detection below.
        const crossings: Array<{
          walk: Walk; cross: Crossing | null;
          currentVal: number; gamesPlayed: number;
          cumWins: number; cumLosses: number;
          perGame: number;
        }> = []
        for (const w of walks) {
          const cross = cfg.kind === 'wins' ? crossingForWins(w, T) : crossingForPF(w, T);
          let currentVal = 0
          let cumWins = 0
          let cumLosses = 0
          let gamesPlayed = w.games.length
          for (const g of w.games) {
            if (g.result === 'W') cumWins++
            else if (g.result === 'L') cumLosses++
            if (cfg.kind === 'wins' && g.result === 'W') currentVal++
            if (cfg.kind === 'points') currentVal += g.self_score
          }
          // Per-game rate, using only {year} games so the projection
          // reflects current-season form, not lifetime average.
          let seasonVal = 0, seasonGames = 0
          for (const g of w.games) {
            if (g.year === year && g.week <= throughWeek) {
              seasonGames++
              if (cfg.kind === 'wins' && g.result === 'W') seasonVal++
              if (cfg.kind === 'points') seasonVal += g.self_score
            }
          }
          const perGame = seasonGames > 0 ? seasonVal / seasonGames : 0
          crossings.push({ walk: w, cross, currentVal, gamesPlayed, cumWins, cumLosses, perGame })

          if (cross && cross.year < year) {
            // crossed pre-{year} → eligible to set the record
            if (!recordHolder || cross.games < recordHolder.games) {
              recordHolder = { walk: w, games: cross.games, year: cross.year }
            }
          }
        }
        if (!recordHolder) continue
        const r = recordHolder

        // Find the best 2025 chaser — either crossed in {year} already
        // (potential broken record) OR projecting to cross in fewer games
        // than the record. Carries currentVal so the bar can fill based
        // on actual progress toward the tier.
        type Chaser = {
          walk: Walk; projGames: number; broke: boolean;
          currentVal: number; gamesPlayed: number;
          cumWins: number; cumLosses: number;
          crossingDesc?: string
        }
        let bestChaser: Chaser | null = null
        for (const c of crossings) {
          if (c.walk === r.walk) continue
          if (c.cross && c.cross.year === year) {
            // Crossed during {year}. Only surface if they actually beat
            // the record holder's games-count — ties don't matter for an
            // alerting page.
            if (c.cross.games >= r.games) continue
            const cand: Chaser = {
              walk: c.walk,
              projGames: c.cross.games,
              broke: true,
              currentVal: c.currentVal,
              gamesPlayed: c.gamesPlayed,
              cumWins: c.cumWins,
              cumLosses: c.cumLosses,
              crossingDesc: `W${c.cross.week} · ${year}`,
            }
            if (!bestChaser || cand.projGames < bestChaser.projGames) bestChaser = cand
          } else if (!c.cross && c.currentVal > 0 && c.perGame > 0 && c.currentVal < T) {
            // Hasn't crossed; project at {year}-pace.
            const needed = T - c.currentVal
            const moreGames = needed / c.perGame
            const proj = Math.round(c.gamesPlayed + moreGames)

            // For wins-bounded tiers (max 1 win per game), check the
            // absolute-best-case minimum games-to-T. If the chaser can
            // only TIE the record at best (minGames === r.games) or be
            // slower (>), drop them — they can no longer break it no
            // matter how the rest of the season plays out. Points are
            // unbounded per game so this check doesn't apply there.
            if (cfg.kind === 'wins') {
              const minGames = c.gamesPlayed + (T - c.currentVal)
              if (minGames >= r.games) continue
            }

            // Only surface if their projection is meaningful relative to the
            // record (within ~30% to bound chase candidates).
            if (proj <= r.games * 1.3) {
              const cand: Chaser = {
                walk: c.walk, projGames: proj, broke: false,
                currentVal: c.currentVal, gamesPlayed: c.gamesPlayed,
                cumWins: c.cumWins, cumLosses: c.cumLosses,
              }
              if (!bestChaser || cand.projGames < bestChaser.projGames) bestChaser = cand
            }
          }
        }
        if (!bestChaser) continue

        // pct = chaser's current progress through the tier T, so the bar
        // visualizes how close they actually are to crossing the milestone
        // (matching the current-based pct used by pace items). The
        // "are they on pace to BEAT the record" info lives in gap +
        // chaser_when below.
        const pct = (bestChaser.currentVal / T) * 100
        const projGames = bestChaser.projGames
        const gap = r.games - projGames  // positive = on pace to break (faster)
        const broke = bestChaser.broke
        // Display strings:
        //   gamesDisplay — chaser's current games played, used as the
        //     bar label so the eye reads "X Games" right above the fill.
        //     Quickest-to-X is fundamentally a games-count race; the bar
        //     shows progress toward the tier (cum / T), the label shows
        //     how many games it took to get there.
        //   recordDisplay — chaser's career W-L through current games.
        //     Rides on chaser_sub so the brink/on-pace cards print it
        //     just below the manager name.
        const gamesDisplay = `${bestChaser.gamesPlayed} Games`
        const recordDisplay = `${bestChaser.cumWins}-${bestChaser.cumLosses}`

        accumItems.push({
          category: cfg.label(T),
          pct,
          realized: broke,
          flag: broke
            ? 'NEW QUICKEST'
            : flagFor(pct, 'WILL BREAK IT', 'PROJECTING PAST', 'ON PACE', 'PURSUING'),
          title_html: `${r.games} games <em>· quickest to ${cfg.fmtT(T)}</em>`,
          holder: r.walk.name,
          record_value: cfg.fmtGames(r.games),
          holder_when: `${r.year}`,
          chaser: bestChaser.walk.name,
          // chaser_value leads with the bare number + unit so the LCD
          // readout shows "16" big with "games" as the unit caption.
          // The "pace" / "crossed" qualifier rides in readout_sub.
          // Broken cards lead with the achievement (games-to-tier).
          // Non-broken cards also lead with games — the metric being
          // chased is "fewest games to T" so games is the operative
          // unit. The chaser's current W-L record rides on
          // chaser_sub for context.
          chaser_value: broke ? `${projGames} games` : gamesDisplay,
          chaser_sub: recordDisplay,
          // Numeric triple — for Quickest the brink meter switches to a
          // games-axis so the gold projection line can land BEFORE the
          // mark (since fewer games is faster). Template treats Quickest
          // as overshoot when projection_numeric < record_numeric.
          current_numeric: bestChaser.gamesPlayed,
          record_numeric: r.games,
          projection_numeric: projGames,
          projection_short: `${projGames} Games`,
          readout_sub: broke ? `crossed ${bestChaser.crossingDesc || ''}` : 'pace',
          chaser_when: broke
            ? bestChaser.crossingDesc || `W${throughWeek} · ${year}`
            : `W${throughWeek} · ${year}`,
          chaser_projection: broke ? undefined : `pace ${projGames} Games to ${cfg.fmtT(T)}`,
          gap: gap > 0
            ? `${gap} games faster on pace`
            : gap < 0 ? `${Math.abs(gap)} games slower on pace` : 'matching pace',
          copy_html: `<em>${escTxt(bestChaser.walk.name)}</em> · ${broke ? 'crossed' : 'pace'} ${projGames} games to ${cfg.fmtT(T)}`,
          when: `W${throughWeek} · ${year}`,
          previous: `${cfg.fmtGames(r.games)} · ${r.walk.name}, ${r.year}`,
        })
      }
    }
  }

  // ── JUST MISSED: week-to-week records that don't build over the season.
  // Single-week high
  const topHigh = seasonByMgr.filter((m) => m.bestWeek)
    .sort((a, b) => b.bestWeek!.self_score - a.bestWeek!.self_score)[0]
  if (topHigh && allHigh.val !== -Infinity) {
    const v = topHigh.bestWeek!.self_score, r = allHigh.val, pct = (v / r) * 100
    justMissedItems.push({
      category: 'Single-Week High',
      pct,
      realized: pct >= 100,
      flag: pct >= 100 ? 'BROKEN' : pct >= 95 ? 'NEARLY' : pct >= 85 ? 'BIG WEEK' : 'NOTABLE',
      title_html: `${r.toFixed(1)} <em>· single-week high</em>`,
      holder: nameOf(allHigh.mid), record_value: `${r.toFixed(1)} pts`,
      holder_when: `W${allHigh.week} · ${allHigh.year}`,
      chaser: topHigh.name, chaser_value: `${v.toFixed(1)} pts`,
      chaser_when: `W${topHigh.bestWeek!.week} · ${year} vs ${nameOf(topHigh.bestWeek!.opp_id)}`,
      gap: pct >= 100 ? `+${(v - r).toFixed(1)} past` : `${(r - v).toFixed(1)} short`,
      copy_html: `<em>${escTxt(topHigh.name)}</em> posted the all-time single-week high — ${v.toFixed(1)} pts (vs ${escTxt(nameOf(topHigh.bestWeek!.opp_id))})`,
      when: `W${topHigh.bestWeek!.week} · ${year}`,
      previous: `${r.toFixed(1)} · ${nameOf(allHigh.mid)}, ${allHigh.year}`,
    })
  }

  // Single-week low (anti-record — lower beats it)
  const topLow = seasonByMgr.filter((m) => m.worstWeek)
    .sort((a, b) => a.worstWeek!.self_score - b.worstWeek!.self_score)[0]
  if (topLow && allLow.val !== Infinity) {
    const v = topLow.worstWeek!.self_score, r = allLow.val
    const pct = (r / Math.max(v, 0.1)) * 100
    justMissedItems.push({
      category: 'Single-Week Low',
      pct,
      realized: pct >= 100,
      flag: pct >= 100 ? 'NEW LOW' : pct >= 95 ? 'NEARLY' : pct >= 85 ? 'COLD WEEK' : 'NOTABLE',
      title_html: `${r.toFixed(1)} <em>· single-week low</em>`,
      holder: nameOf(allLow.mid), record_value: `${r.toFixed(1)} pts`,
      holder_when: `W${allLow.week} · ${allLow.year}`,
      chaser: topLow.name, chaser_value: `${v.toFixed(1)} pts`,
      chaser_when: `W${topLow.worstWeek!.week} · ${year}`,
      gap: pct >= 100 ? `${(r - v).toFixed(1)} under` : `${(v - r).toFixed(1)} above`,
      copy_html: `<em>${escTxt(topLow.name)}</em> bottomed out at ${v.toFixed(1)} pts — the all-time single-week low (${v.toFixed(1)} vs ${topLow.worstWeek!.opp_score.toFixed(1)} ${escTxt(nameOf(topLow.worstWeek!.opp_id))})`,
      when: `W${topLow.worstWeek!.week} · ${year}`,
      previous: `${r.toFixed(1)} · ${nameOf(allLow.mid)}, ${allLow.year}`,
    })
  }

  // Biggest single-week blowout
  const topBlow = seasonByMgr.filter((m) => m.bestBlowout)
    .sort((a, b) => b.bestBlowout!.margin - a.bestBlowout!.margin)[0]
  if (topBlow && allBlowout.val !== -Infinity) {
    const v = topBlow.bestBlowout!.margin, r = allBlowout.val, pct = (v / r) * 100
    justMissedItems.push({
      category: 'Biggest Blowout',
      pct,
      realized: pct >= 100,
      flag: pct >= 100 ? 'NEW BLOWOUT' : pct >= 95 ? 'NEARLY' : pct >= 85 ? 'BRUTAL' : 'BIG MARGIN',
      title_html: `+${r.toFixed(1)} <em>· margin record</em>`,
      holder: nameOf(allBlowout.mid), record_value: `+${r.toFixed(1)}`,
      holder_when: `W${allBlowout.week} · ${allBlowout.year}`,
      chaser: topBlow.name, chaser_value: `+${v.toFixed(1)}`,
      chaser_when: `W${topBlow.bestBlowout!.week} · ${year} vs ${nameOf(topBlow.bestBlowout!.opp_id)}`,
      gap: pct >= 100 ? `+${(v - r).toFixed(1)} past` : `${(r - v).toFixed(1)} short`,
      copy_html: `<em>${escTxt(topBlow.name)}</em> ran the all-time biggest blowout — won by ${v.toFixed(1)} (${topBlow.bestBlowout!.self_score.toFixed(1)} vs ${topBlow.bestBlowout!.opp_score.toFixed(1)} ${escTxt(nameOf(topBlow.bestBlowout!.opp_id))})`,
      when: `W${topBlow.bestBlowout!.week} · ${year}`,
      previous: `+${r.toFixed(1)} · ${nameOf(allBlowout.mid)}, ${allBlowout.year}`,
    })
  }

  // Highest combined-score game
  const topCombo = seasonByMgr.filter((m) => m.bestCombined)
    .sort((a, b) => (b.bestCombined!.self_score + b.bestCombined!.opp_score) - (a.bestCombined!.self_score + a.bestCombined!.opp_score))[0]
  if (topCombo && allCombined.val !== -Infinity) {
    const v = topCombo.bestCombined!.self_score + topCombo.bestCombined!.opp_score
    const r = allCombined.val, pct = (v / r) * 100
    justMissedItems.push({
      category: 'Highest Combined',
      pct,
      realized: pct >= 100,
      flag: pct >= 100 ? 'NEW SHOOTOUT' : pct >= 95 ? 'NEARLY' : pct >= 85 ? 'SHOOTOUT' : 'HIGH SCORING',
      title_html: `${r.toFixed(1)} <em>· highest combined game</em>`,
      holder: `${nameOf(allCombined.mid)} v ${allCombined.opp}`,
      record_value: `${r.toFixed(1)} combined`,
      holder_when: `W${allCombined.week} · ${allCombined.year}`,
      chaser: `${topCombo.name} v ${nameOf(topCombo.bestCombined!.opp_id)}`,
      chaser_value: `${v.toFixed(1)} combined`,
      chaser_when: `W${topCombo.bestCombined!.week} · ${year}`,
      gap: pct >= 100 ? `+${(v - r).toFixed(1)} past` : `${(r - v).toFixed(1)} short`,
      copy_html: `<em>${escTxt(topCombo.name)}</em> & ${escTxt(nameOf(topCombo.bestCombined!.opp_id))} ran the all-time highest-scoring shootout — ${v.toFixed(1)} combined (${topCombo.bestCombined!.self_score.toFixed(1)} vs ${topCombo.bestCombined!.opp_score.toFixed(1)})`,
      when: `W${topCombo.bestCombined!.week} · ${year}`,
      previous: `${r.toFixed(1)} · ${allCombined.year}`,
    })
  }

  // Bucket items into four sections:
  //
  //   broken    — realized crossings (record actually been beaten this
  //               season: weekly extremes pct>=100, active streak that
  //               passed the all-time, Quickest-to-X with broke:true).
  //   on_pace   — projected past the mark but season isn't over yet
  //               (PF/PPG/wins/losses pace, Quickest-to-X with projected
  //               game count below record).
  //   brink     — close but not past (50-99% of the mark) — combines
  //               the old brink + chase buckets so the page has one
  //               coherent "pursuit" section instead of two.
  //   just_missed — week-to-week extremes that came close but didn't
  //                 break the mark. Anything pct<100.
  const broken: WatchItem[] = []
  const onPace: WatchItem[] = []
  const brink:  WatchItem[] = []
  const justMissed: WatchItem[] = []

  // Threshold sliders. For jake testing we drop brink to 50% so the
  // page has data to show; for real deployment lift to 65-75%.
  // On-pace sits in the band just below brink — items that are
  // building toward the record but aren't close enough to warrant the
  // bar-plot treatment yet.
  const BRINK_THRESHOLD  = 65  // ≥ this with no overshoot → Brink (with meter)
  const ONPACE_THRESHOLD = 40  // ≥ this and < brink → On Pace (stats only)

  for (const it of accumItems) {
    if (it.pct >= 100 && it.realized) broken.push(it)
    else if (it.pct >= BRINK_THRESHOLD) brink.push(it)
    else if (it.pct >= ONPACE_THRESHOLD) onPace.push(it)
  }
  for (const it of justMissedItems) {
    if (it.realized) {
      // Weekly extremes that actually broke the mark belong with the
      // rest of the realized breaks, not in Just Missed.
      broken.push(it)
    } else if (it.pct >= 90) {
      // Within 10% of the all-time mark — surface in Just Missed.
      // Anything further out is just a "notable week," not a near-miss,
      // so we drop it so the section reads as actually-close calls.
      justMissed.push(it)
    }
  }

  broken.sort((a, b) => b.pct - a.pct)
  onPace.sort((a, b) => b.pct - a.pct)
  brink.sort((a, b) => b.pct - a.pct)
  justMissed.sort((a, b) => b.pct - a.pct)

  const records_watch = {
    meter: {
      broken: broken.length,
      on_pace: onPace.length,
      brink: brink.length,
      just_missed: justMissed.length,
      through: throughLabel(year, throughWeek),
    },
    broken: broken.slice(0, 6),
    on_pace: onPace.slice(0, 6),
    brink: brink.slice(0, 6),
    just_missed: justMissed.slice(0, 6),
  }

  // ── MILESTONES (per profile group so merged identities aggregate properly)
  type Career = {
    name: string
    // Primary manager id (group.primary.id) — used to seed h2hThrough(),
    // which then resolves back to the full profile group internally.
    primaryMid: string
    avatar: string  // most-recent avatar_url across the group's identities
    winsBefore: number; lossesBefore: number; gamesBefore: number; pfBefore: number
    winsAfter:  number; lossesAfter:  number; gamesAfter:  number; pfAfter:  number
    seasonGames: TaggedGame[]
    seasonsThrough: number
    activeStreak: { type: 'W' | 'L' | 'T'; len: number }
    // Career-longest win streak BEFORE this season's active run starts.
    // Used as the personal-best the active 2025 streak chases against —
    // shared league-wide tiers (5/7/10W) don't reflect individual histories
    // in a league where everyone started together.
    careerLongestWinStreak: number
  }

  // Most-recent avatar_url across all of a profile group's identities, walking
  // newest season → oldest. Falls back to managers.avatar_url then empty.
  function avatarFor(g: ProfileGroup): string {
    for (let i = s.seasons.length - 1; i >= 0; i--) {
      const sn = s.seasons[i]
      const mss = s.managerSeasonsBySeason.get(sn.id) ?? []
      for (const ms of mss) {
        if (g.managerIds.has(ms.manager_id) && ms.avatar_url) return ms.avatar_url
      }
    }
    for (const m of g.managers) if (m.avatar_url) return m.avatar_url
    return ''
  }

  // Alumni filter: skip retired managers entirely so they don't keep showing
  // up in milestone feeds. They can't earn new milestones, and stale alumni
  // entries clutter the "Just Achieved" + "Imminent" rails.
  const milestonesAutoCurrent = currentManagerIdSet(s)
  const careers: Career[] = []
  for (const g of groups) {
    if (isGroupHidden(g)) continue
    if (!isGroupCurrent(g, milestonesAutoCurrent)) continue
    const career: Career = {
      name: groupDisplayName(g),
      primaryMid: g.primary.id,
      avatar: avatarFor(g),
      winsBefore: 0, lossesBefore: 0, gamesBefore: 0, pfBefore: 0,
      winsAfter:  0, lossesAfter:  0, gamesAfter:  0, pfAfter:  0,
      seasonGames: [],
      seasonsThrough: 0,
      activeStreak: { type: 'T', len: 0 },
      careerLongestWinStreak: 0,
    }
    const seenSeasons = new Set<number>()
    const allMyGames: TaggedGame[] = []
    for (const mid of g.managerIds) {
      const games = gamesByManager.get(mid) ?? []
      for (const gm of games) {
        if (gm.year < year) {
          career.winsBefore   += gm.result === 'W' ? 1 : 0
          career.lossesBefore += gm.result === 'L' ? 1 : 0
          career.gamesBefore  += 1
          career.pfBefore     += gm.self_score
          seenSeasons.add(gm.year)
          allMyGames.push(gm)
        } else if (gm.year === year && gm.week <= throughWeek) {
          career.seasonGames.push(gm)
          seenSeasons.add(gm.year)
          allMyGames.push(gm)
        }
      }
    }
    // Stable ordering across merged identities
    career.seasonGames.sort((a, b) => a.week - b.week)
    allMyGames.sort((a, b) => a.year - b.year || a.week - b.week)
    career.winsAfter   = career.winsBefore + career.seasonGames.filter((g) => g.result === 'W').length
    career.lossesAfter = career.lossesBefore + career.seasonGames.filter((g) => g.result === 'L').length
    career.gamesAfter  = career.gamesBefore + career.seasonGames.length
    career.pfAfter     = career.pfBefore + career.seasonGames.reduce((a, g) => a + g.self_score, 0)
    career.seasonsThrough = seenSeasons.size
    // Active streak across all identities, walking back from latest game
    const last = allMyGames[allMyGames.length - 1]
    if (last && (last.result === 'W' || last.result === 'L')) {
      let len = 0
      for (let i = allMyGames.length - 1; i >= 0; i--) {
        if (allMyGames[i].result === last.result) len++
        else break
      }
      career.activeStreak = { type: last.result, len }
    }
    // Personal-best win streak BEFORE the active 2025 run started.
    // We find the longest pure-W run in pre-{year} games. If the active 2025
    // streak began at the very tail of {year-1}, its pre-year portion is
    // already counted into this number — that's intentional, because the
    // personal best should reflect the longest historical run regardless of
    // calendar boundary.
    {
      let bestRun = 0, curRun = 0
      for (const gm of allMyGames) {
        if (gm.year >= year) break
        if (gm.result === 'W') { curRun++; if (curRun > bestRun) bestRun = curRun }
        else curRun = 0
      }
      career.careerLongestWinStreak = bestRun
    }
    careers.push(career)
  }

  // Tier ladders. Wider gaps for younger leagues; medium density for jake.
  // Loyalty/seasons-in-league removed — most jake managers started together so
  // they'd all hit the same anniversary at once, which isn't useful signal.
  const winTiers    = [10, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300]
  // gamesTiers dropped — see CAREER STARTS comment in the per-career loop below.
  const pfTiers     = [2500, 5000, 7500, 10000, 12500, 15000, 17500, 20000, 25000, 30000]

  type Category = 'wins' | 'points' | 'streak'

  // stats_html: short factual line shown under the milestone copy. Format
  // depends on the milestone category so wins items show a record while
  // points items show career totals + games + PPG.
  function statsFor(c: Career, cat: Category): string {
    const record = `<strong>${c.winsAfter}-${c.lossesAfter}</strong>`
    const pf = Math.round(c.pfAfter).toLocaleString()
    const ppg = c.gamesAfter > 0 ? (c.pfAfter / c.gamesAfter).toFixed(1) : '—'
    if (cat === 'wins') {
      return `Career · ${record} · ${c.gamesAfter}G`
    }
    if (cat === 'points') {
      return `Career · <strong>${pf}</strong> pts · ${c.gamesAfter}G · <strong>${ppg}</strong> PPG`
    }
    // streak
    const tag = c.activeStreak.type === 'W' ? `${c.activeStreak.len}W active`
              : c.activeStreak.type === 'L' ? `${c.activeStreak.len}L active` : 'idle'
    const pb = c.careerLongestWinStreak > 0 ? ` · PB ${c.careerLongestWinStreak}W` : ''
    return `Career · ${record} · ${tag}${pb}`
  }

  type Crossed = {
    glyph: string; tier: string; category: Category; name: string; avatar: string
    achievement_html: string; stats_html: string
    // Single-line bottom-of-card meta. Replaces the old when+context split
    // (which used space-between and wrapped awkwardly on long opponent
    // names). Format varies by category but always leads with W{week}.
    meta_html: string
    when: string  // kept for the meter "this week" filter
    sort: number
  }
  type Approach = {
    glyph: string; category: Category; name: string; avatar: string
    copy_html: string; stats_html: string; eta: string; eta_unit: string
    sort: number
  }
  const crossed: Crossed[] = []
  const imminent: Record<Category, Approach[]> = { wins: [], points: [], streak: [] }
  const horizon:  Record<Category, Approach[]> = { wins: [], points: [], streak: [] }

  for (const c of careers) {
    if (c.gamesAfter === 0) continue

    // Helper: build the meta line for a crossed milestone.
    //
    // Wins / games milestones: "W{week} vs Opp · {score} pts" — vs+opp
    // sits right after the week, score trails behind the dot.
    // Points milestones: "W{week} · {score} pts vs Opp" — score leads
    // (it's the milestone-defining metric), opp trails after vs.
    // Streak milestones: "W{week} · prior best NW".
    //
    // H2H badge floats right when there's a career record vs that opp.
    function metaWins(mid: string, week: number, score: number, oppMid: string): string {
      const opp = escTxt(nameOf(oppMid))
      const h2h = h2hThrough(mid, oppMid, year, week)
      return `<span class="meta-main"><strong>W${week}</strong> vs ${opp} · ${score.toFixed(1)} pts</span>` +
             (h2h ? `<span class="h2h">${h2h} H2H</span>` : '')
    }
    function metaPoints(mid: string, week: number, score: number, oppMid: string): string {
      const opp = escTxt(nameOf(oppMid))
      const h2h = h2hThrough(mid, oppMid, year, week)
      return `<span class="meta-main"><strong>W${week}</strong> · ${score.toFixed(1)} pts vs ${opp}</span>` +
             (h2h ? `<span class="h2h">${h2h} H2H</span>` : '')
    }
    // Any id from the group works since h2hThrough resolves back via the
    // profile group internally.
    const seedMid = c.primaryMid

    // ── Crossed: career wins
    const wTier = nextTierCrossed(c.winsBefore, c.winsAfter, winTiers)
    if (wTier != null) {
      let running = c.winsBefore
      let crossingWeek = 0
      for (const g of c.seasonGames) {
        if (g.result === 'W') {
          running++
          if (running === wTier) { crossingWeek = g.week; break }
        }
      }
      const gm = c.seasonGames.find((g) => g.week === crossingWeek)
      crossed.push({
        glyph: '✦', tier: 'CAREER WINS', category: 'wins', name: c.name, avatar: c.avatar,
        achievement_html: `<strong>${ordinal(wTier)}</strong> career win`,
        stats_html: statsFor(c, 'wins'),
        meta_html: gm ? metaWins(seedMid, gm.week, gm.self_score, gm.opp_id) : '',
        when: crossingWeek ? `W${crossingWeek}` : '',
        sort: (crossingWeek * 100) + wTier,
      })
    }

    // Career-starts milestones (50th / 100th / etc. career game) were
    // dropped — in a league where most members joined together, every
    // manager hits the same starts milestone the same week, which just
    // crowded the Just Achieved feed with low-signal entries.

    // ── Crossed: career PF
    const pTier = nextTierCrossed(c.pfBefore, c.pfAfter, pfTiers)
    if (pTier != null) {
      let running = c.pfBefore
      let week = 0
      for (const g of c.seasonGames) {
        running += g.self_score
        if (running >= pTier) { week = g.week; break }
      }
      const gm = c.seasonGames.find((g) => g.week === week)
      crossed.push({
        glyph: '★', tier: 'CAREER POINTS', category: 'points', name: c.name, avatar: c.avatar,
        achievement_html: `crossed <strong>${pTier.toLocaleString()}</strong> lifetime points`,
        stats_html: statsFor(c, 'points'),
        meta_html: gm ? metaPoints(seedMid, gm.week, gm.self_score, gm.opp_id) : '',
        when: week ? `W${week}` : '',
        sort: (week * 100) + 2,
      })
    }

    // ── Crossed: active win streak broke the manager's career personal best
    if (c.activeStreak.type === 'W' && c.careerLongestWinStreak > 0 && c.activeStreak.len > c.careerLongestWinStreak) {
      crossed.push({
        glyph: '✺', tier: 'WIN STREAK', category: 'streak', name: c.name, avatar: c.avatar,
        achievement_html: `new personal-best <strong>${c.activeStreak.len}-game win</strong> streak`,
        stats_html: statsFor(c, 'streak'),
        meta_html: `<span class="meta-main"><strong>W${throughWeek}</strong> · prior best ${c.careerLongestWinStreak}W</span>`,
        when: `W${throughWeek}`,
        sort: 99 * 100 + c.activeStreak.len,
      })
    }

    // ── Imminent (≤1 win or ≤150 PF away from the next tier).
    // Each goes into its own category bucket so the template can render
    // a columnar layout (Wins | Points | Streaks).
    const winsTo = nextTierAhead(c.winsAfter, winTiers)
    if (winsTo != null && winsTo - c.winsAfter === 1) {
      // Imminent ETAs use % progress to match the horizon column's
      // treatment — keeps the right edge from echoing the left copy.
      const progress = Math.round((c.winsAfter / winsTo) * 100)
      imminent.wins.push({
        glyph: '✦', category: 'wins', name: c.name, avatar: c.avatar,
        copy_html: `<em>1</em> win from <em>${ordinal(winsTo)}</em>`,
        stats_html: statsFor(c, 'wins'),
        eta: `${progress}%`, eta_unit: 'there',
        sort: 1,
      })
    }
    // Career-starts imminent dropped — see CAREER STARTS comment above.
    const pfTo = nextTierAhead(c.pfAfter, pfTiers)
    if (pfTo != null && pfTo - c.pfAfter <= 150) {
      const gap = Math.round(pfTo - c.pfAfter)
      const progress = Math.round((c.pfAfter / pfTo) * 100)
      imminent.points.push({
        glyph: '★', category: 'points', name: c.name, avatar: c.avatar,
        copy_html: `<em>${gap}</em> pts from <em>${pfTo.toLocaleString()}</em>`,
        stats_html: statsFor(c, 'points'),
        eta: `${progress}%`, eta_unit: 'there',
        sort: gap,
      })
    }
    // Streak imminent: one win from beating the manager's own personal best
    if (c.activeStreak.type === 'W' && c.careerLongestWinStreak > 0 && c.activeStreak.len === c.careerLongestWinStreak) {
      const target = c.careerLongestWinStreak + 1
      const progress = Math.round((c.activeStreak.len / target) * 100)
      imminent.streak.push({
        glyph: '✺', category: 'streak', name: c.name, avatar: c.avatar,
        copy_html: `one win from a new personal-best <em>${target}-game win</em> streak`,
        stats_html: statsFor(c, 'streak'),
        eta: `${progress}%`, eta_unit: 'there',
        sort: 1,
      })
    }

    // ── Horizon (2-8 wins out, 150-800 PF out; streak chases personal best)
    if (winsTo != null) {
      const gap = winsTo - c.winsAfter
      const progress = Math.round((c.winsAfter / winsTo) * 100)
      // Gap caps at 8 wins so deep-season tiers (e.g. 75W) don't
      // start tracking from 40W. Progress floor at 50% so small
      // tiers (e.g. 10W) don't surface a chaser at 3 wins (30%).
      if (gap >= 2 && gap <= 8 && progress >= 50) {
        horizon.wins.push({
          glyph: '✦', category: 'wins', name: c.name, avatar: c.avatar,
          copy_html: `<em>${gap}</em> wins from <em>${ordinal(winsTo)}</em>`,
          stats_html: statsFor(c, 'wins'),
          eta: `${progress}%`, eta_unit: 'there',
          sort: gap,
        })
      }
    }
    // Career-starts horizon dropped — see CAREER STARTS comment above.
    if (pfTo != null) {
      const gap = Math.round(pfTo - c.pfAfter)
      if (gap > 150 && gap <= 800) {
        horizon.points.push({
          glyph: '★', category: 'points', name: c.name, avatar: c.avatar,
          copy_html: `<em>${gap}</em> pts to <em>${pfTo.toLocaleString()}</em>`,
          stats_html: statsFor(c, 'points'),
          eta: `${gap}`, eta_unit: 'pts to go',
          sort: gap,
        })
      }
    }
    // Streak horizon: active run is ≥50% of the way to the new target
    // (PB + 1) — measured against the same target the copy + ETA call
    // out, so a manager whose active streak sits below 50% of that
    // milestone doesn't surface here.
    if (
      c.activeStreak.type === 'W' &&
      c.careerLongestWinStreak >= 2 &&
      c.activeStreak.len < c.careerLongestWinStreak &&
      c.activeStreak.len * 2 >= (c.careerLongestWinStreak + 1)
    ) {
      const target = c.careerLongestWinStreak + 1
      const gap = target - c.activeStreak.len
      const progress = Math.round((c.activeStreak.len / target) * 100)
      horizon.streak.push({
        glyph: '✺', category: 'streak', name: c.name, avatar: c.avatar,
        copy_html: `<em>${gap}</em> wins shy of a <em>${target}-game win</em> streak`,
        stats_html: statsFor(c, 'streak'),
        eta: `${progress}%`, eta_unit: 'there',
        sort: gap,
      })
    }
  }

  crossed.sort((a, b) => b.sort - a.sort)
  for (const cat of ['wins','points','streak'] as Category[]) {
    imminent[cat].sort((a, b) => a.sort - b.sort)
    horizon[cat].sort((a, b) => a.sort - b.sort)
    imminent[cat] = imminent[cat].slice(0, 6)
    horizon[cat]  = horizon[cat].slice(0, 6)
  }

  const imminentCount = imminent.wins.length + imminent.points.length + imminent.streak.length

  // "Just Achieved" shows milestones from this week and last week,
  // sorted this-week-first so the newest stuff leads. Items get a
  // week_bucket tag the template uses to insert a "Last week" divider
  // between the two groups. Older crossings (W{n-2} and earlier) drop
  // off the feed.
  type Crossed2 = Crossed & { week_bucket?: 'this' | 'last' }
  const lastWeek = throughWeek - 1
  const crossedRecent: Crossed2[] = []
  for (const c of crossed) {
    const m = String(c.when || '').match(/^W(\d+)/)
    if (!m) continue
    const w = parseInt(m[1], 10)
    if (w === throughWeek) crossedRecent.push({ ...c, week_bucket: 'this' })
    else if (w === lastWeek) crossedRecent.push({ ...c, week_bucket: 'last' })
  }
  // Within each bucket items keep their existing sort (the higher tier
  // first), but ensure this-week items come before last-week items.
  crossedRecent.sort((a, b) => {
    if (a.week_bucket !== b.week_bucket) return a.week_bucket === 'this' ? -1 : 1
    return b.sort - a.sort
  })

  const milestones = {
    meter: {
      week: crossed.filter((c) => c.when === `W${throughWeek}`).length,
      season: crossed.length,
      imminent: imminentCount,
      through: throughLabel(year, throughWeek),
    },
    // Filtered + capped at 12 so the dense Just-Achieved grid stays
    // within scroll-friendly density.
    crossed: crossedRecent.slice(0, 12),
    // Columnar layout: keyed by category. Loyalty was dropped (most managers
    // started together so the anniversary signal isn't useful).
    imminent_by_category: imminent,
    horizon_by_category:  horizon,
  }

  return { records_watch, milestones }
}

// Estimate regular-season game count per manager from the most recent
// completed season (excludes playoff games). Falls back to 14 if there's
// no prior data — same number Sleeper / ESPN / Yahoo / NFL all default to.
function estimateRegSeasonLength(s: Snapshot, beforeYear: number): number {
  let maxGames = 0
  for (let i = s.seasons.length - 1; i >= 0; i--) {
    const sn = s.seasons[i]
    if (sn.year >= beforeYear) continue
    const matchups = s.matchupsBySeason.get(sn.id) ?? []
    const regGames = new Map<string, number>()
    for (const m of matchups) {
      if (m.is_playoff) continue
      regGames.set(m.manager_a_id, (regGames.get(m.manager_a_id) ?? 0) + 1)
      regGames.set(m.manager_b_id, (regGames.get(m.manager_b_id) ?? 0) + 1)
    }
    for (const n of regGames.values()) if (n > maxGames) maxGames = n
    if (maxGames > 0) return maxGames
  }
  return 14
}

// "Through" label stamped on the meter foot of records_watch + milestones.
// Week 0 means we're in preseason mode (no games played yet) — render that
// as "Preseason · {year}" instead of the nonsensical "W0 · {year}".
function throughLabel(year: number, throughWeek: number): string {
  if (throughWeek <= 0) return `Preseason · ${year}`
  return `W${throughWeek} · ${year}`
}

function flagFor(pct: number, broke: string, edge: string, brink: string, base: string): string {
  if (pct >= 100) return broke
  if (pct >= 95)  return edge
  if (pct >= 85)  return brink
  return base
}

function nextTierCrossed(before: number, after: number, tiers: number[]): number | null {
  for (const t of tiers) if (before < t && after >= t) return t
  return null
}
function nextTierAhead(now: number, tiers: number[]): number | null {
  for (const t of tiers) if (now < t) return t
  return null
}
function ordinal(n: number): string {
  const j = n % 10, k = n % 100
  if (j === 1 && k !== 11) return `${n}st`
  if (j === 2 && k !== 12) return `${n}nd`
  if (j === 3 && k !== 13) return `${n}rd`
  return `${n}th`
}
function escTxt(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ============================================================
// best_coach.json — Best Coach Tracker (live season only)
//
// For each manager × week in the is_live season, compute:
//   • actual    — sum of every player they started that week
//   • optimal   — sum of the best-possible legal lineup chosen from
//                 the same rostered pool, honoring that week's slot
//                 template (greedy: fill the most-restrictive slots
//                 first, then flex/superflex).
//   • left      — optimal − actual ("points left on the bench")
//
// Rolls up to season totals + rankings (by efficiency and by total
// left-on-bench), plus a top-10 "worst single weeks" board for the
// running-drama angle the tile is built around.
//
// Returns null when the league has no live season, or when no
// season has weekly_lineups data (pre-migration leagues fall here).
// ============================================================
type BestCoachWeek = {
  week: number
  actual: number | null
  optimal: number | null
  left: number | null
}

type BestCoachManager = {
  manager_id: string
  uid: string | null
  display_name: string
  team_name: string | null
  weeks: BestCoachWeek[]
  season_actual: number
  season_optimal: number
  season_left: number
  efficiency_pct: number | null
  worst_week: { week: number; left: number } | null
}

// Player position → list of slot names that player is eligible to fill.
// Reverse map keyed by slot is computed inline (small data, clarity > perf).
function slotsEligibleForPosition(pos: string): Set<string> {
  const P = pos.toUpperCase()
  const out = new Set<string>()
  if (P === 'QB') { out.add('QB'); out.add('OP'); out.add('SUPER_FLEX'); out.add('SUPERFLEX'); out.add('TQB'); out.add('Q/W/R/T') }
  if (P === 'RB') { out.add('RB'); out.add('FLEX'); out.add('RB/WR'); out.add('OP'); out.add('SUPER_FLEX'); out.add('SUPERFLEX'); out.add('W/R/T'); out.add('Q/W/R/T') }
  if (P === 'WR') { out.add('WR'); out.add('FLEX'); out.add('RB/WR'); out.add('WR/TE'); out.add('OP'); out.add('SUPER_FLEX'); out.add('SUPERFLEX'); out.add('W/R/T'); out.add('Q/W/R/T') }
  if (P === 'TE') { out.add('TE'); out.add('FLEX'); out.add('WR/TE'); out.add('OP'); out.add('SUPER_FLEX'); out.add('SUPERFLEX'); out.add('W/R/T'); out.add('Q/W/R/T') }
  if (P === 'K') out.add('K')
  if (P === 'DEF' || P === 'DST' || P === 'D/ST') { out.add('DEF'); out.add('D/ST'); out.add('DST') }
  return out
}

// Fewer eligible positions = more restrictive = fill first. K and DEF have
// exactly one eligible position so they win every tiebreak; FLEX-style
// multi-position slots get filled last from whatever's left.
function slotRestrictiveness(slot: string): number {
  const S = slot.toUpperCase()
  if (S === 'QB' || S === 'K' || S === 'DEF' || S === 'D/ST' || S === 'DST') return 1
  if (S === 'RB' || S === 'WR' || S === 'TE') return 2
  if (S === 'RB/WR' || S === 'WR/TE') return 3
  if (S === 'FLEX' || S === 'W/R/T') return 4
  if (S === 'OP' || S === 'TQB') return 5
  if (S === 'SUPER_FLEX' || S === 'SUPERFLEX' || S === 'Q/W/R/T') return 6
  return 7
}

function computeOptimalLineup(
  pool: Array<{ player_external_id: string; name: string | null; pos: string; pts: number; forceSlot?: string }>,
  slotCounts: Map<string, number>,
): { total: number; lineup: Array<{ slot: string; name: string | null; pos: string; pts: number }> } {
  // Expand slot counts into a flat list of slot names, ordered most-restrictive
  // first so QB/K/DEF get their pick before FLEX touches the pool.
  const slots: string[] = []
  for (const [slot, count] of slotCounts.entries()) {
    for (let i = 0; i < count; i++) slots.push(slot)
  }
  slots.sort((a, b) => slotRestrictiveness(a) - slotRestrictiveness(b))

  const used = new Set<string>()
  const lineup: Array<{ slot: string; name: string | null; pos: string; pts: number }> = []
  let total = 0
  for (const slot of slots) {
    // Eligible candidates: not yet used, position is in this slot's
    // eligibility set OR the player is a wildcard pinned to exactly this slot
    // (used for starters whose position the parser couldn't identify or that
    // sits outside the standard QB/RB/WR/TE/K/DEF set — IDP slots, niche
    // platform positions, etc.). Wildcards can only fill their original
    // slot, so they never bump a real player off a flex spot.
    const slotUpper = slot.toUpperCase()
    let best: typeof pool[number] | null = null
    for (const p of pool) {
      if (used.has(p.player_external_id)) continue
      const isWild = p.forceSlot != null && p.forceSlot.toUpperCase() === slotUpper
      if (!isWild) {
        const eligible = slotsEligibleForPosition(p.pos)
        if (!eligible.has(slotUpper)) continue
      }
      if (best == null || p.pts > best.pts) best = p
    }
    if (best) {
      used.add(best.player_external_id)
      total += best.pts
      lineup.push({ slot, name: best.name, pos: best.pos, pts: best.pts })
    } else {
      lineup.push({ slot, name: null, pos: '', pts: 0 })
    }
  }
  return { total, lineup }
}

function buildBestCoach(s: Snapshot): unknown {
  // Prefer the live season; otherwise fall back to the most recent season
  // that has lineup data so the page is useful year-round (and so leagues
  // out of season today can still render their last completed year).
  let liveSeason = s.seasons.find((sn) => sn.is_live)
  let rows = liveSeason ? (s.weeklyLineupsBySeason.get(liveSeason.id) ?? []) : []
  let isLiveMode = !!liveSeason && rows.length > 0
  if (rows.length === 0) {
    const seasonsDesc = [...s.seasons].sort((a, b) => b.year - a.year)
    for (const sn of seasonsDesc) {
      const r = s.weeklyLineupsBySeason.get(sn.id) ?? []
      if (r.length > 0) { liveSeason = sn; rows = r; break }
    }
  }
  if (!liveSeason || rows.length === 0) return null

  const groups = buildProfileGroups(s).filter((g) => !isGroupHidden(g))
  const managerToGroup = buildManagerToGroup(groups)

  // Consolation-game lookup: (manager, week) pairs where the matchup is a
  // playoff placement game (neither participant finished top-4). Managers
  // have nothing to play for, so a week-16 bench bomb from someone in the
  // 7th-place game shouldn't count against their coaching record.
  const consolationKeys = new Set<string>()
  for (const m of s.matchupsBySeason.get(liveSeason.id) ?? []) {
    if (!m.is_playoff) continue
    const game = asManagerGame(m, m.manager_a_id)
    if (game && !isChampionshipBracketGame(s, game)) {
      consolationKeys.add(`${m.manager_a_id}|${m.week}`)
      consolationKeys.add(`${m.manager_b_id}|${m.week}`)
    }
  }

  // Bucket rows by manager → week → players.
  type WeekBucket = { starters: WeeklyLineupRow[]; all: WeeklyLineupRow[] }
  const byMgr = new Map<string, Map<number, WeekBucket>>()
  let maxWeek = 0
  for (const r of rows) {
    if (!managerToGroup.has(r.manager_id)) continue
    if (consolationKeys.has(`${r.manager_id}|${r.week}`)) continue
    if (r.week > maxWeek) maxWeek = r.week
    let weeks = byMgr.get(r.manager_id)
    if (!weeks) { weeks = new Map(); byMgr.set(r.manager_id, weeks) }
    let b = weeks.get(r.week)
    if (!b) { b = { starters: [], all: [] }; weeks.set(r.week, b) }
    b.all.push(r)
    if (r.is_starter) b.starters.push(r)
  }

  const managers: BestCoachManager[] = []
  for (const [managerId, weeks] of byMgr.entries()) {
    const group = managerToGroup.get(managerId)
    if (!group) continue
    const mgr = s.managers.get(managerId)
    if (!mgr) continue

    const weekBlocks: BestCoachWeek[] = []
    let seasonActual = 0
    let seasonOptimal = 0
    let worstWeek: { week: number; left: number } | null = null

    const sortedWeeks = [...weeks.entries()].sort(([a], [b]) => a - b)
    for (const [week, bucket] of sortedWeeks) {
      // Skip the week entirely if no starter has scored points yet — that's
      // an unplayed-future or in-progress week and including it would
      // bias the season totals.
      const anyStarterScored = bucket.starters.some((r) => r.points != null)
      if (!anyStarterScored) continue

      const actual = bucket.starters.reduce((sum, r) => sum + (r.points ?? 0), 0)

      // Slot template = exactly what they started. Empty starter rows (slot
      // present but no player) would be tracked here too, but ingest skips
      // those — so any zero-player slot the manager left empty just doesn't
      // exist in our pool and can't be optimally filled either.
      const slotCounts = new Map<string, number>()
      for (const r of bucket.starters) {
        slotCounts.set(r.slot, (slotCounts.get(r.slot) ?? 0) + 1)
      }

      // Optimal pool: every player on the roster that week with a position
      // and points. Bench players with null points get treated as 0 — they
      // had a bye or weren't active. Starters whose position the parser
      // couldn't extract (or whose position sits outside the standard
      // QB/RB/WR/TE/K/DEF set — IDP, niche platform slots) get pushed as
      // wildcards pinned to the slot they actually started in. Without this,
      // their points landed in the actual sum but they couldn't fill any
      // optimal slot, producing actual > optimal weeks.
      const pool: Array<{ player_external_id: string; name: string | null; pos: string; pts: number; forceSlot?: string }> = []
      for (const r of bucket.all) {
        const pos = r.position ?? ''
        const eligibleAny = pos ? slotsEligibleForPosition(pos).size > 0 : false
        if (!eligibleAny) {
          // Bench players with no position are dropped (they couldn't have
          // helped anyway); starters get a wildcard entry so they fill
          // their own slot in the optimal lineup.
          if (!r.is_starter) continue
          pool.push({
            player_external_id: r.player_external_id,
            name: r.player_name,
            pos: pos,
            pts: r.points ?? 0,
            forceSlot: r.slot,
          })
          continue
        }
        pool.push({
          player_external_id: r.player_external_id,
          name: r.player_name,
          pos: pos,
          pts: r.points ?? 0,
        })
      }

      const { total: optimal } = computeOptimalLineup(pool, slotCounts)
      const left = Math.max(0, optimal - actual)
      seasonActual += actual
      seasonOptimal += optimal
      if (worstWeek == null || left > worstWeek.left) worstWeek = { week, left: round2(left) }

      weekBlocks.push({
        week,
        actual: round2(actual),
        optimal: round2(optimal),
        left: round2(left),
      })
    }

    if (weekBlocks.length === 0) continue
    const efficiency = seasonOptimal > 0 ? (seasonActual / seasonOptimal) * 100 : null
    managers.push({
      manager_id: managerId,
      uid: userId(mgr),
      display_name: groupDisplayName(group),
      team_name: mgr.team_name,
      weeks: weekBlocks,
      season_actual: round2(seasonActual),
      season_optimal: round2(seasonOptimal),
      season_left: round2(seasonOptimal - seasonActual),
      efficiency_pct: efficiency != null ? round2(efficiency) : null,
      worst_week: worstWeek,
    })
  }

  if (managers.length === 0) return null

  // Rankings — efficiency desc (best coaches first), left desc (worst).
  const byEfficiency = [...managers]
    .filter((m) => m.efficiency_pct != null)
    .sort((a, b) => (b.efficiency_pct! - a.efficiency_pct!))
    .map((m, idx) => ({ rank: idx + 1, manager_id: m.manager_id, uid: m.uid, name: m.display_name, efficiency_pct: m.efficiency_pct }))
  const byLeftOnBench = [...managers]
    .sort((a, b) => b.season_left - a.season_left)
    .map((m, idx) => ({ rank: idx + 1, manager_id: m.manager_id, uid: m.uid, name: m.display_name, left: m.season_left }))

  // Worst-single-week board — top 10 most points any manager left on bench in a single week.
  const allWeekLeft: Array<{ manager_id: string; uid: string | null; name: string; week: number; left: number; actual: number; optimal: number }> = []
  // Perfect-week board — every week where a manager played the optimal lineup
  // (zero points left on bench). Sorted by actual points desc so the biggest
  // perfectly-coached weeks float to the top.
  const allPerfectWeeks: Array<{ manager_id: string; uid: string | null; name: string; week: number; actual: number }> = []
  for (const m of managers) {
    for (const w of m.weeks) {
      if (w.left == null) continue
      if (w.left <= 0) {
        allPerfectWeeks.push({
          manager_id: m.manager_id,
          uid: m.uid,
          name: m.display_name,
          week: w.week,
          actual: w.actual ?? 0,
        })
      } else {
        allWeekLeft.push({
          manager_id: m.manager_id,
          uid: m.uid,
          name: m.display_name,
          week: w.week,
          left: w.left,
          actual: w.actual ?? 0,
          optimal: w.optimal ?? 0,
        })
      }
    }
  }
  allWeekLeft.sort((a, b) => b.left - a.left)
  const worstWeeks = allWeekLeft.slice(0, 10)
  allPerfectWeeks.sort((a, b) => b.actual - a.actual)
  const perfectWeeks = allPerfectWeeks.slice(0, 10)

  // Per-manager perfect-lineup tally — the "who's been perfect most often"
  // sidebar. Includes only managers with at least one perfect week so the
  // list reads as an accolades column rather than a goose-egg leaderboard.
  const perfectCountByMgr = new Map<string, { manager_id: string; uid: string | null; name: string; count: number }>()
  for (const w of allPerfectWeeks) {
    const cur = perfectCountByMgr.get(w.manager_id)
    if (cur) cur.count++
    else perfectCountByMgr.set(w.manager_id, { manager_id: w.manager_id, uid: w.uid, name: w.name, count: 1 })
  }
  const perfectCounts = [...perfectCountByMgr.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  // Per-manager "bench bomb" tally — weeks where 30+ pts were stranded on
  // the bench. Mirror of the perfect-count column for the right rail.
  const BENCH_BOMB_THRESHOLD = 30
  const bombCountByMgr = new Map<string, { manager_id: string; uid: string | null; name: string; count: number }>()
  for (const w of allWeekLeft) {
    if (w.left < BENCH_BOMB_THRESHOLD) continue
    const cur = bombCountByMgr.get(w.manager_id)
    if (cur) cur.count++
    else bombCountByMgr.set(w.manager_id, { manager_id: w.manager_id, uid: w.uid, name: w.name, count: 1 })
  }
  const benchBombCounts = [...bombCountByMgr.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return {
    year: liveSeason.year,
    throughWeek: maxWeek,
    is_live: isLiveMode,
    managers,
    rankings: {
      by_efficiency_desc: byEfficiency,
      by_left_desc: byLeftOnBench,
    },
    worst_weeks: worstWeeks,
    perfect_weeks: perfectWeeks,
    perfect_counts: perfectCounts,
    bench_bomb_counts: benchBombCounts,
    bench_bomb_threshold: BENCH_BOMB_THRESHOLD,
  }
}

// ============================================================
// Manager DNA — per-manager archetype + trait markers, derived from
// lineup behavior, matchup outcomes, draft tendencies, and trade volume.
// Each profile gets one primary archetype (the most extreme signal) plus
// up to four secondary "gene" chips, plus the raw signal values so the
// page can render bars and tooltips.
// ============================================================

type DnaSignals = {
  career_games: number
  career_seasons: number
  // Lineup signals (null = no weekly_lineups data for this profile)
  efficiency_pct: number | null         // 0..100, actual / optimal
  lineup_churn_pct: number | null       // 0..100, avg % of starters that changed vs prior week
  // Matchup signals
  pf_per_game: number | null
  volatility_pct: number | null         // 100 * stddev(weekly PF) / mean(weekly PF)
  // avg_margin_pts is the average regular-season point differential (own
  // score - opponent's). Positive = wins are bigger than losses; negative
  // = blown out more than they blow others out. Works on every platform
  // (matchup data only) so it's the natural replacement for the lineup
  // churn slot on NFL.com-only leagues.
  avg_margin_pts: number | null
  // clutch_win_pct is the regular-season win rate in close games (≤5 pts).
  // Null when they haven't played ≥6 close games yet.
  clutch_win_pct: number | null
  close_games: number                   // games decided by ≤ 5 pts
  close_record: { w: number; l: number; t: number }
  blowout_games: number                 // games decided by ≥ 30 pts
  blowout_record: { w: number; l: number; t: number }
  // Draft signals
  // RB-share is career-flat across the first 5 rounds of every draft on file.
  // Early-QB / Early-TE are PERCENTAGES of drafts where they took the position
  // inside rounds 1–4 — used to be a boolean ("ever") which over-fired in
  // long-running leagues. total_drafts is the denominator.
  draft_rb_share_pct: number | null     // 0..100, % of first-5-round picks that were RB
  total_drafts: number                  // # of drafts the profile participated in (round-1–4 picks)
  draft_qb_early_pct: number | null     // 0..100, % of drafts where a QB was taken in rounds 1–4
  draft_te_early_pct: number | null     // 0..100, % of drafts where a TE was taken in rounds 1–4
  // Trade signals — per-season divisor is FULL career seasons (not just
  // seasons in which they traded), so a single trade in 7 years now reads
  // as ~0.14/yr rather than 1.0/yr.
  trades_total: number
  trades_per_season: number | null
}

type DnaTrait = {
  key: string
  label: string
  detail: string
}

type DnaManager = {
  manager_id: string
  uid: string | null
  name: string
  team_latest: string | null
  is_current: boolean
  archetype: {
    key: string
    name: string
    tagline: string
    blurb: string
  }
  traits: DnaTrait[]
  signals: DnaSignals
}

function buildManagerDna(s: Snapshot): unknown {
  const groups = buildProfileGroups(s).filter((g) => !isGroupHidden(g))
  if (groups.length === 0) return null
  const autoCurrent = currentManagerIdSet(s)
  const managerToGroup = buildManagerToGroup(groups)

  // -------- Per-profile aggregation pass --------
  type ProfileBundle = {
    group: ProfileGroup
    primary: ManagerRow
    name: string
    is_current: boolean
    // Game-level
    weeklyPF: number[]
    games: ManagerGame[]   // regular season only — playoffs distort volatility
    // Lineup-level (career)
    actualSum: number
    optimalSum: number
    lineupWeeksSeen: number  // weeks with any lineup data
    starterChurnSum: number  // sum of per-week churn ratios
    churnWeeksCounted: number  // number of (week→week) transitions counted
    // Draft-level
    // first5Picks is career-flat (used for RB-share %). draftSlates groups
    // round-1–4 picks by draft so we can compute "% of drafts where they
    // took a QB early" — a single early QB pick used to qualify someone as
    // Anchor QB forever, which over-fired in long-running leagues.
    first5Picks: Array<{ position: string | null }>
    draftSlates: Array<Array<{ round: number; position: string | null }>>
    // Trade-level
    tradeCount: number
    tradeSeasons: Set<string>
  }

  // ProfileGroup has no stable id field — use primary.id as the bundle key
  // since managerToGroup() always resolves any manager_id back to the group
  // whose primary owns that id (or that contains it as an alt identity).
  const bundles = new Map<string, ProfileBundle>()
  for (const g of groups) {
    bundles.set(g.primary.id, {
      group: g,
      primary: g.primary,
      name: groupDisplayName(g),
      is_current: isGroupCurrent(g, autoCurrent),
      weeklyPF: [],
      games: [],
      actualSum: 0,
      optimalSum: 0,
      lineupWeeksSeen: 0,
      starterChurnSum: 0,
      churnWeeksCounted: 0,
      first5Picks: [],
      draftSlates: [],
      tradeCount: 0,
      tradeSeasons: new Set(),
    })
  }

  // -------- Matchups: PF per week + close/blowout buckets --------
  for (const g of groups) {
    const bundle = bundles.get(g.primary.id)!
    for (const mid of g.managerIds) {
      const mList = s.matchupsByManager.get(mid) ?? []
      for (const m of mList) {
        const gm = asManagerGame(m, mid)
        if (!gm) continue
        // Skip 5th/7th-place placement games (mirror buildManagerFile).
        if (gm.is_playoff && !isChampionshipBracketGame(s, gm)) continue
        bundle.games.push(gm)
        if (!gm.is_playoff) bundle.weeklyPF.push(gm.self_score)
      }
    }
  }

  // -------- Lineups: efficiency + week-to-week starter churn --------
  // Walk every season's lineups, bucket by (manager_id, week), then for each
  // (profile, season) sort weeks ascending and compare consecutive starter
  // sets to compute churn.
  for (const season of s.seasons) {
    const rows = s.weeklyLineupsBySeason.get(season.id) ?? []
    if (rows.length === 0) continue
    type WB = { starters: WeeklyLineupRow[]; all: WeeklyLineupRow[] }
    const byProfileWeek = new Map<string, Map<number, WB>>()
    for (const r of rows) {
      const g = managerToGroup.get(r.manager_id)
      if (!g) continue
      let weeks = byProfileWeek.get(g.primary.id)
      if (!weeks) { weeks = new Map(); byProfileWeek.set(g.primary.id, weeks) }
      let b = weeks.get(r.week)
      if (!b) { b = { starters: [], all: [] }; weeks.set(r.week, b) }
      b.all.push(r)
      if (r.is_starter) b.starters.push(r)
    }
    for (const [groupId, weeks] of byProfileWeek) {
      const bundle = bundles.get(groupId)
      if (!bundle) continue
      const sortedWeeks = [...weeks.entries()].sort(([a], [b]) => a - b)
      let prevStarterIds: Set<string> | null = null
      for (const [, bucket] of sortedWeeks) {
        const anyScored = bucket.starters.some((r) => r.points != null)
        if (!anyScored) continue
        // Efficiency contribution
        const actual = bucket.starters.reduce((sum, r) => sum + (r.points ?? 0), 0)
        const slotCounts = new Map<string, number>()
        for (const r of bucket.starters) slotCounts.set(r.slot, (slotCounts.get(r.slot) ?? 0) + 1)
        // Same wildcard treatment as buildBestCoach — starters with unknown
        // positions get pinned to their original slot so the optimal can
        // never come in below actual (which would let efficiency exceed
        // 100% and break the DNA bar visualization).
        const pool: Array<{ player_external_id: string; name: string | null; pos: string; pts: number; forceSlot?: string }> = []
        for (const r of bucket.all) {
          const pos = r.position ?? ''
          const eligibleAny = pos ? slotsEligibleForPosition(pos).size > 0 : false
          if (!eligibleAny) {
            if (!r.is_starter) continue
            pool.push({ player_external_id: r.player_external_id, name: r.player_name, pos, pts: r.points ?? 0, forceSlot: r.slot })
            continue
          }
          pool.push({ player_external_id: r.player_external_id, name: r.player_name, pos, pts: r.points ?? 0 })
        }
        const { total: optimal } = computeOptimalLineup(pool, slotCounts)
        bundle.actualSum += actual
        bundle.optimalSum += optimal
        bundle.lineupWeeksSeen++

        // Churn vs previous week (within same season)
        const curIds = new Set(bucket.starters.map((r) => r.player_external_id))
        if (prevStarterIds != null && prevStarterIds.size > 0 && curIds.size > 0) {
          let changed = 0
          for (const id of curIds) if (!prevStarterIds.has(id)) changed++
          // Symmetric: also count those dropped that are no longer here.
          // Use the larger lineup size as denom so 100% = total swap.
          const denom = Math.max(curIds.size, prevStarterIds.size)
          bundle.starterChurnSum += changed / denom
          bundle.churnWeeksCounted++
        }
        prevStarterIds = curIds
      }
    }
  }

  // -------- Drafts: first-5 picks (career-flat for RB-share) + per-draft
  // round-1–4 slates (so Anchor QB / TE Premium can check "% of drafts" not
  // "ever in any draft"). --------
  for (const [seasonId, draft] of s.draftsBySeason) {
    if (!draft) continue
    const picks = s.picksByDraft.get(draft.id) ?? []
    // Bucket this draft's round-1–4 picks per profile so each profile sees
    // its own slate for this draft. A profile with no picks here gets no
    // slate entry — they didn't participate.
    const slatesThisDraft = new Map<string, Array<{ round: number; position: string | null }>>()
    for (const p of picks) {
      if (p.manager_id == null) continue
      const g = managerToGroup.get(p.manager_id)
      if (!g) continue
      const bundle = bundles.get(g.primary.id)
      if (!bundle) continue
      if (p.round <= 5) bundle.first5Picks.push({ position: p.position })
      if (p.round <= 4) {
        const slate = slatesThisDraft.get(g.primary.id) ?? []
        slate.push({ round: p.round, position: p.position })
        slatesThisDraft.set(g.primary.id, slate)
      }
    }
    for (const [groupId, slate] of slatesThisDraft) {
      const bundle = bundles.get(groupId)
      if (bundle) bundle.draftSlates.push(slate)
    }
    void seasonId
  }

  // -------- Trades --------
  for (const g of groups) {
    const bundle = bundles.get(g.primary.id)!
    for (const mid of g.managerIds) {
      const tps = s.tradeParticipationByManager.get(mid) ?? []
      for (const tp of tps) {
        bundle.tradeCount++
        bundle.tradeSeasons.add(tp.season_id)
      }
    }
  }

  // -------- Build signals per profile --------
  const profiles: Array<{ bundle: ProfileBundle; signals: DnaSignals }> = []
  for (const bundle of bundles.values()) {
    const totalGames = bundle.games.length
    if (totalGames === 0) continue
    const careerSeasonsSet = new Set(bundle.games.map((g) => g.season_id))
    const regGames = bundle.games.filter((g) => !g.is_playoff)

    // PF/volatility
    const pf = bundle.weeklyPF
    const mean = pf.length > 0 ? pf.reduce((a, b) => a + b, 0) / pf.length : 0
    let volatility: number | null = null
    if (pf.length >= 4 && mean > 0) {
      const variance = pf.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / pf.length
      const sd = Math.sqrt(variance)
      volatility = (sd / mean) * 100
    }

    // Close / blowout (regular-season only — playoffs are small-sample noise).
    // marginSum is signed (own − opp), so its average reflects whether wins
    // are bigger than losses (positive) or vice versa.
    const CLOSE = 5
    const BLOWOUT = 30
    let cw = 0, cl = 0, ct = 0, bw = 0, bl = 0, bt = 0
    let closeN = 0, blowN = 0
    let marginSum = 0
    for (const gm of regGames) {
      marginSum += gm.margin
      const absMargin = Math.abs(gm.margin)
      if (absMargin <= CLOSE) {
        closeN++
        if (gm.result === 'W') cw++; else if (gm.result === 'L') cl++; else ct++
      }
      if (absMargin >= BLOWOUT) {
        blowN++
        if (gm.result === 'W') bw++; else if (gm.result === 'L') bl++; else bt++
      }
    }
    const avgMargin = regGames.length > 0 ? marginSum / regGames.length : null
    // Require ≥6 close games before publishing a clutch number; below that
    // single results swing the rate too much to mean anything.
    const clutchWinPct = closeN >= 6 ? (cw / closeN) * 100 : null

    // Lineup efficiency + churn. The optimal-lineup calc is a greedy slot
    // picker (not Hungarian), so it can underestimate the true optimum when
    // FLEX eligibility lets the actual lineup beat the greedy assignment.
    // Cap at 100 so the UI never shows nonsense like 102% — Evan / Sleeper
    // leagues hit this routinely with a great FLEX-RB call.
    const efficiencyRaw = bundle.optimalSum > 0
      ? (bundle.actualSum / bundle.optimalSum) * 100
      : null
    const efficiency = efficiencyRaw != null ? Math.min(100, efficiencyRaw) : null
    const churn = bundle.churnWeeksCounted > 0
      ? (bundle.starterChurnSum / bundle.churnWeeksCounted) * 100
      : null

    // Draft tendencies
    const f5 = bundle.first5Picks
    const rbShare = f5.length > 0
      ? (f5.filter((p) => (p.position ?? '').toUpperCase() === 'RB').length / f5.length) * 100
      : null
    // Per-draft early-position rate. QBs need to be locked in rounds 1–3
    // (round 4 is borderline and too inclusive); TEs use rounds 1–4 because
    // elite TEs typically come off the board slightly later than elite QBs.
    const totalDrafts = bundle.draftSlates.length
    const qbEarlyDrafts = bundle.draftSlates.filter((slate) =>
      slate.some((p) => p.round <= 3 && (p.position ?? '').toUpperCase() === 'QB')
    ).length
    const teEarlyDrafts = bundle.draftSlates.filter((slate) =>
      slate.some((p) => p.round <= 4 && (p.position ?? '').toUpperCase() === 'TE')
    ).length
    const qbEarlyPct = totalDrafts > 0 ? (qbEarlyDrafts / totalDrafts) * 100 : null
    const teEarlyPct = totalDrafts > 0 ? (teEarlyDrafts / totalDrafts) * 100 : null

    // Trades per season — divide by full career seasons so a manager who
    // traded once in 1 of 7 seasons reads as 0.14/yr (not 1.0/yr from
    // dividing by "seasons in which they traded").
    const tradesPerSeason = careerSeasonsSet.size > 0
      ? bundle.tradeCount / careerSeasonsSet.size
      : null

    const signals: DnaSignals = {
      career_games: totalGames,
      career_seasons: careerSeasonsSet.size,
      efficiency_pct: efficiency != null ? round2(efficiency) : null,
      lineup_churn_pct: churn != null ? round2(churn) : null,
      pf_per_game: pf.length > 0 ? round2(mean) : null,
      volatility_pct: volatility != null ? round2(volatility) : null,
      avg_margin_pts: avgMargin != null ? round2(avgMargin) : null,
      clutch_win_pct: clutchWinPct != null ? round2(clutchWinPct) : null,
      close_games: closeN,
      close_record: { w: cw, l: cl, t: ct },
      blowout_games: blowN,
      blowout_record: { w: bw, l: bl, t: bt },
      draft_rb_share_pct: rbShare != null ? round2(rbShare) : null,
      total_drafts: totalDrafts,
      draft_qb_early_pct: qbEarlyPct != null ? round2(qbEarlyPct) : null,
      draft_te_early_pct: teEarlyPct != null ? round2(teEarlyPct) : null,
      trades_total: bundle.tradeCount,
      trades_per_season: tradesPerSeason != null ? round2(tradesPerSeason) : null,
    }
    profiles.push({ bundle, signals })
  }

  if (profiles.length === 0) return null

  // -------- League-wide stats for z-score classification --------
  const stat = (vals: number[]) => {
    if (vals.length === 0) return { mean: 0, sd: 0 }
    const m = vals.reduce((a, b) => a + b, 0) / vals.length
    const v = vals.reduce((sum, x) => sum + (x - m) * (x - m), 0) / vals.length
    return { mean: m, sd: Math.sqrt(v) }
  }
  const eff = stat(profiles.map((p) => p.signals.efficiency_pct).filter((v): v is number => v != null))
  const ch = stat(profiles.map((p) => p.signals.lineup_churn_pct).filter((v): v is number => v != null))
  const vol = stat(profiles.map((p) => p.signals.volatility_pct).filter((v): v is number => v != null))
  const rb = stat(profiles.map((p) => p.signals.draft_rb_share_pct).filter((v): v is number => v != null))
  const tr = stat(profiles.map((p) => p.signals.trades_per_season).filter((v): v is number => v != null))
  const mg = stat(profiles.map((p) => p.signals.avg_margin_pts).filter((v): v is number => v != null))
  const cl = stat(profiles.map((p) => p.signals.clutch_win_pct).filter((v): v is number => v != null))

  // If the league baseline for churn is effectively zero, the weekly_lineups
  // data we have is bogus (NFL.com history serves the same roster for every
  // week, so every consecutive-week comparison is identical → 0% churn for
  // everyone). When that happens, efficiency comes from the same bad data
  // (actual lineup ≈ "optimal" because they're the same players), so both
  // signals should be nulled out across the board. The page renderer will
  // then fall back to matchup-derived signals (Margin, Clutch).
  const lineupSignalsUsable = ch.mean >= 1
  if (!lineupSignalsUsable) {
    for (const p of profiles) {
      p.signals.efficiency_pct = null
      p.signals.lineup_churn_pct = null
    }
  }

  const z = (v: number | null, st: { mean: number; sd: number }) =>
    v == null || st.sd === 0 ? 0 : (v - st.mean) / st.sd

  // -------- Pick archetype per profile (highest |z| across signals, with tiebreakers) --------
  type Candidate = { key: string; name: string; tagline: string; blurb: string; strength: number }
  type ProfileBuild = {
    bundle: ProfileBundle
    signals: DnaSignals
    z_eff: number; z_churn: number; z_vol: number; z_rb: number; z_trade: number
    closeWinRate: number | null
    blowWinRate: number | null
    candidates: Candidate[]
  }

  const builds: ProfileBuild[] = []
  for (const { bundle, signals } of profiles) {
    const z_eff = z(signals.efficiency_pct, eff)
    const z_churn = z(signals.lineup_churn_pct, ch)
    const z_vol = z(signals.volatility_pct, vol)
    const z_rb = z(signals.draft_rb_share_pct, rb)
    const z_trade = z(signals.trades_per_season, tr)

    const closeWinRate = signals.close_games > 0 ? signals.close_record.w / signals.close_games : null
    const blowWinRate = signals.blowout_games > 0 ? signals.blowout_record.w / signals.blowout_games : null

    const candidates: Candidate[] = []
    // Strength is normalized as `actual / threshold` — the ratio of the
    // manager's signal to the bar it had to clear to qualify. 1.0 = exactly
    // at the threshold, 2.0 = double the threshold, etc. This lets every
    // archetype's strength be compared on the same scale, so the one a
    // manager exceeds by the largest relative margin is the best descriptor
    // (e.g. someone 56% past a 25% bar beats someone 36% past a 25% bar, and
    // also beats someone 50% past a 40% bar). Previously each candidate had
    // its own ad-hoc formula on a different scale — Cardiac Kid started at
    // 1.85 and Anchor QB maxed at 1.40, so the close-game winner basically
    // always won the tiebreak even when a deep QB-anchor manager was much
    // further past their own bar.
    // Trade Hawk / Vault
    if (signals.trades_per_season != null && z_trade >= 1.0) {
      candidates.push({
        key: 'trade_hawk',
        name: 'The Trade Hawk',
        tagline: 'Always on the phone',
        blurb: `Trades at ${signals.trades_per_season.toFixed(1)} deals per season — well above league baseline. The roster is never finished.`,
        strength: z_trade / 1.0,
      })
    }
    // The Vault — strictly under one trade per season on average. Used to
    // require *zero* trades (almost nobody hits that in a long league), then
    // briefly relaxed to <2/yr (too permissive — caught half the field).
    // The 1/yr line is the sweet spot: anyone making fewer than one trade
    // per season on average is genuinely a hold-the-line drafter.
    if (
      signals.career_seasons >= 2
      && signals.trades_total < signals.career_seasons
    ) {
      const tradeRate = (signals.trades_total / signals.career_seasons).toFixed(1)
      candidates.push({
        key: 'the_vault',
        name: 'The Vault',
        tagline: 'Draft-and-hold disciple',
        blurb: signals.trades_total === 0
          ? `Zero completed trades across ${signals.career_seasons} season${signals.career_seasons === 1 ? '' : 's'}. What's drafted is what's kept.`
          : `Only ${signals.trades_total} trade${signals.trades_total === 1 ? '' : 's'} across ${signals.career_seasons} seasons (${tradeRate}/yr) — well under one a year. Drafts the roster and lives with it.`,
        // Threshold = 1 trade/season. Headroom = how far below that they
        // actually sit. 0 trades → ∞ in the limit, so cap at 2.0.
        strength: Math.min(2.0, 1 / Math.max(0.25, signals.trades_total / signals.career_seasons)),
      })
    }
    // Optimizer / Reactionary / Set-and-Forget
    if (signals.efficiency_pct != null && z_eff >= 1.0) {
      candidates.push({
        key: 'the_optimizer',
        name: 'The Optimizer',
        tagline: 'Squeezes every last point',
        blurb: `Career lineup efficiency of ${signals.efficiency_pct.toFixed(1)}% — top of the league at starting the right names.`,
        strength: z_eff / 1.0,
      })
    }
    if (signals.lineup_churn_pct != null && z_churn >= 1.2) {
      candidates.push({
        key: 'the_tinkerer',
        name: 'The Tinkerer',
        tagline: 'Lineup is never finished',
        blurb: `Swaps ~${signals.lineup_churn_pct.toFixed(0)}% of starters week to week. The roster shifts constantly.`,
        strength: z_churn / 1.2,
      })
    }
    if (signals.lineup_churn_pct != null && z_churn <= -1.0 && (signals.efficiency_pct == null || z_eff <= 0.2)) {
      candidates.push({
        key: 'set_and_forget',
        name: 'The Set-and-Forget',
        tagline: 'Drafted in August, started in January',
        blurb: `Touches the lineup the least in the league — only ~${(signals.lineup_churn_pct ?? 0).toFixed(0)}% turnover week to week.`,
        strength: Math.abs(z_churn) / 1.0,
      })
    }
    // Coin Flipper / Steady Hand
    if (signals.volatility_pct != null && z_vol >= 1.2) {
      candidates.push({
        key: 'coin_flipper',
        name: 'The Coin-Flipper',
        tagline: 'Boom one week, bust the next',
        blurb: `Score swings ±${signals.volatility_pct.toFixed(0)}% week to week — most volatile output in the league.`,
        strength: z_vol / 1.2,
      })
    }
    if (signals.volatility_pct != null && z_vol <= -1.0) {
      candidates.push({
        key: 'steady_hand',
        name: 'The Steady Hand',
        tagline: 'Same number every week',
        blurb: `Lowest week-to-week swing in the league — predictable ${signals.pf_per_game?.toFixed(0) ?? '—'} most Sundays.`,
        strength: Math.abs(z_vol) / 1.0,
      })
    }
    // Cardiac / Heartbreaker
    if (closeWinRate != null && signals.close_games >= 6 && closeWinRate >= 0.65) {
      candidates.push({
        key: 'cardiac_kid',
        name: 'The Cardiac Kid',
        tagline: 'Lives in one-score games',
        blurb: `${signals.close_record.w}–${signals.close_record.l}${signals.close_record.t ? `–${signals.close_record.t}` : ''} in games decided by ≤5 pts. Refuses to lose close.`,
        strength: closeWinRate / 0.65,
      })
    }
    if (closeWinRate != null && signals.close_games >= 6 && closeWinRate <= 0.35) {
      candidates.push({
        key: 'heartbreaker',
        name: 'The Heartbreaker',
        tagline: 'Cursed by the photo finish',
        blurb: `${signals.close_record.w}–${signals.close_record.l}${signals.close_record.t ? `–${signals.close_record.t}` : ''} in games decided by ≤5 pts. The margin gods are not friends.`,
        strength: (1 - closeWinRate) / 0.65,
      })
    }
    // Steamroller / Punching Bag
    if (blowWinRate != null && signals.blowout_games >= 4 && blowWinRate >= 0.70) {
      candidates.push({
        key: 'steamroller',
        name: 'The Steamroller',
        tagline: 'When they win, they win big',
        blurb: `${signals.blowout_record.w}–${signals.blowout_record.l} in ≥30-pt games. No cruise control — pedal stays floored.`,
        strength: blowWinRate / 0.70,
      })
    }
    // Zero-RB / Hog Mollie / Anchor QB / TE Premium
    // Bar was z ≤ -1.0 (strength = |z|/1.0). In tight leagues where the RB-share
    // distribution clusters near the mean, a small absolute deviation (29% vs a
    // 36% mean) reads as z ≈ -2.0 and out-prioritized Anchor QB at 71% (strength
    // 1.78). A drafter that's only 7pp below norm shouldn't outweigh a manager
    // taking a QB top-3 in 71% of drafts. Raised threshold to z ≤ -1.5 with
    // matching strength denominator — Zero-RB now needs roughly z ≤ -2.7 to
    // out-strength an Anchor QB at 71%, which is genuinely WR-first behavior.
    if (signals.draft_rb_share_pct != null && z_rb <= -1.5 && bundle.first5Picks.length >= 5) {
      candidates.push({
        key: 'zero_rb',
        name: 'The Zero-RB Prophet',
        tagline: 'Pass-catchers first, RBs later',
        blurb: `Only ${signals.draft_rb_share_pct.toFixed(0)}% of early picks were RBs — well below the league norm. Believer in the WR-first build.`,
        strength: Math.abs(z_rb) / 1.5,
      })
    }
    if (signals.draft_rb_share_pct != null && z_rb >= 1.5 && bundle.first5Picks.length >= 5) {
      candidates.push({
        key: 'hog_mollie',
        name: 'The Hog Mollie',
        tagline: 'RBs first, RBs always',
        blurb: `${signals.draft_rb_share_pct.toFixed(0)}% of early picks were RBs — the most run-heavy build in the league.`,
        strength: z_rb / 1.5,
      })
    }
    // Anchor QB — requires a top-3-round QB in at least 40% of drafts on
    // file (≥3 drafts as a sample-size floor). Used to use rounds 1–4 which
    // was too inclusive — round 4 captures a lot of "best player available"
    // QB grabs rather than true position-anchoring. Rounds 1–3 is closer to
    // "I refuse to stream the position" behavior.
    if (
      signals.draft_qb_early_pct != null
      && signals.total_drafts >= 3
      && signals.draft_qb_early_pct >= 50
    ) {
      candidates.push({
        key: 'anchor_qb',
        name: 'The Anchor QB',
        tagline: 'Locks the position early',
        blurb: `Has reached for a QB inside the first three rounds in ${signals.draft_qb_early_pct.toFixed(0)}% of drafts on file. Refuses to play the streamer's game.`,
        strength: signals.draft_qb_early_pct / 50,  // 50% → 1.0, 100% → 2.0
      })
    }
    // TE Premium — same shape as Anchor QB. Bar was originally 25% (too
    // permissive — five managers hit it in a 10-team league), raised to
    // 50% so it identifies genuine "I always take an elite TE" drafters
    // rather than anyone who's reached for the position twice in four years.
    if (
      signals.draft_te_early_pct != null
      && signals.total_drafts >= 3
      && signals.draft_te_early_pct >= 50
    ) {
      candidates.push({
        key: 'te_premium',
        name: 'The TE Premium',
        tagline: 'Pays the elite-TE tax',
        blurb: `Has spent a top-4-round pick on a TE in ${signals.draft_te_early_pct.toFixed(0)}% of drafts on file. Willing to corner the position rather than chase it.`,
        strength: signals.draft_te_early_pct / 50,  // 50% → 1.0, 100% → 2.0
      })
    }

    // Trade Hawk reads as "just another trader" when stamped on three or
    // four cards. Demote it whenever another archetype fits — keep it as a
    // fallback only when it's literally the manager's lone candidate.
    candidates.sort((a, b) => {
      if (a.key === 'trade_hawk' && b.key !== 'trade_hawk') return 1
      if (b.key === 'trade_hawk' && a.key !== 'trade_hawk') return -1
      return b.strength - a.strength
    })
    builds.push({ bundle, signals, z_eff, z_churn, z_vol, z_rb, z_trade, closeWinRate, blowWinRate, candidates })
  }

  // -------- Spread archetypes across the league --------
  // No single archetype should land on 3+ managers — when it does, the page
  // reads as "everyone's a Cardiac Kid" rather than a distinct lineup of
  // archetypes. Algorithm: every manager starts on their strongest candidate;
  // if any archetype has 3+ holders, demote the weakest holder of that group
  // to their next-best candidate. Repeat until no archetype is overstuffed
  // (or the demoted manager runs out of candidates and falls through to The
  // Average Joe). Iteration is bounded by the sum of candidate-list lengths
  // so the loop can never run more times than total demotions available.
  const AVERAGE_JOE: Candidate = {
    key: 'the_average_joe',
    name: 'The Average Joe',
    tagline: 'Defies categorization',
    blurb: 'Sits in the middle of every distribution — no extreme behaviors, no obvious tells. Quietly competitive.',
    strength: 0,
  }
  const selectedIdx = builds.map(() => 0)
  const archetypeAt = (i: number): Candidate => {
    const c = builds[i].candidates
    if (c.length === 0 || selectedIdx[i] >= c.length) return AVERAGE_JOE
    return c[selectedIdx[i]]
  }
  const maxIter = builds.reduce((sum, b) => sum + b.candidates.length, 0) + builds.length
  for (let iter = 0; iter < maxIter; iter++) {
    const byKey = new Map<string, number[]>()
    for (let i = 0; i < builds.length; i++) {
      const k = archetypeAt(i).key
      if (k === 'the_average_joe') continue
      let arr = byKey.get(k)
      if (!arr) { arr = []; byKey.set(k, arr) }
      arr.push(i)
    }
    let toReduce: number[] | null = null
    for (const arr of byKey.values()) {
      if (arr.length >= 3) { toReduce = arr; break }
    }
    if (!toReduce) break
    // Weakest holder loses the slot — lowest current strength gets demoted.
    toReduce.sort((a, b) => archetypeAt(a).strength - archetypeAt(b).strength)
    selectedIdx[toReduce[0]]++
  }

  // -------- Build traits + result rows using the finalized archetype --------
  const result: DnaManager[] = []
  for (let i = 0; i < builds.length; i++) {
    const { bundle, signals, z_eff, z_churn, z_vol, z_rb, z_trade, closeWinRate, blowWinRate } = builds[i]
    const archetype = archetypeAt(i)

    // -------- Build trait chips (gene markers) — secondary archetypes, capped 4 --------
    const traits: DnaTrait[] = []
    const pushTrait = (key: string, label: string, detail: string) => {
      if (traits.find((t) => t.key === key)) return
      if (traits.length >= 4) return
      traits.push({ key, label, detail })
    }
    // Lineup
    if (signals.efficiency_pct != null) {
      if (z_eff >= 0.7 && archetype.key !== 'the_optimizer') pushTrait('high_eff', 'Lineup Optimizer', `${signals.efficiency_pct.toFixed(1)}% career efficiency`)
      else if (z_eff <= -0.7) pushTrait('low_eff', 'Bench Burner', `${signals.efficiency_pct.toFixed(1)}% career efficiency`)
    }
    if (signals.lineup_churn_pct != null) {
      if (z_churn >= 0.7 && archetype.key !== 'the_tinkerer') pushTrait('high_churn', 'High Churn', `${signals.lineup_churn_pct.toFixed(0)}% lineup turnover/wk`)
      else if (z_churn <= -0.7 && archetype.key !== 'set_and_forget') pushTrait('low_churn', 'Iron Lineup', `${signals.lineup_churn_pct.toFixed(0)}% lineup turnover/wk`)
    }
    // Volatility
    if (signals.volatility_pct != null) {
      if (z_vol >= 0.7 && archetype.key !== 'coin_flipper') pushTrait('volatile', 'High Variance', `±${signals.volatility_pct.toFixed(0)}% weekly swing`)
      else if (z_vol <= -0.7 && archetype.key !== 'steady_hand') pushTrait('consistent', 'Low Variance', `±${signals.volatility_pct.toFixed(0)}% weekly swing`)
    }
    // Close-game
    if (closeWinRate != null && signals.close_games >= 6) {
      if (closeWinRate >= 0.6 && archetype.key !== 'cardiac_kid') pushTrait('clutch', 'Clutch in Close', `${(closeWinRate * 100).toFixed(0)}% win rate in ≤5-pt games`)
      else if (closeWinRate <= 0.4 && archetype.key !== 'heartbreaker') pushTrait('unclutch', 'Coughs Close Ones', `${(closeWinRate * 100).toFixed(0)}% win rate in ≤5-pt games`)
    }
    // Trade
    if (signals.trades_per_season != null) {
      if (z_trade >= 0.7 && archetype.key !== 'trade_hawk') pushTrait('active_trader', 'Active Trader', `${signals.trades_per_season.toFixed(1)} trades/season`)
      else if (signals.trades_total === 0 && signals.career_seasons >= 2 && archetype.key !== 'the_vault') pushTrait('no_trader', 'Never Trades', `0 completed trades`)
    }
    // Draft
    if (signals.draft_rb_share_pct != null && bundle.first5Picks.length >= 5) {
      if (z_rb <= -0.7 && archetype.key !== 'zero_rb') pushTrait('wr_heavy', 'WR-Heavy Drafter', `${signals.draft_rb_share_pct.toFixed(0)}% early-round RBs`)
      else if (z_rb >= 0.7 && archetype.key !== 'hog_mollie') pushTrait('rb_heavy', 'RB-Heavy Drafter', `${signals.draft_rb_share_pct.toFixed(0)}% early-round RBs`)
    }
    // Trait chips for early-position drafting — show as a "noticed it" tell
    // when the manager has done it at least once but isn't full Anchor QB /
    // TE Premium. Surfaces single early QB picks that no longer trigger the
    // primary archetype, so the signal still lives somewhere on the card.
    if (
      signals.draft_qb_early_pct != null
      && signals.draft_qb_early_pct > 0
      && archetype.key !== 'anchor_qb'
    ) {
      pushTrait('early_qb', 'Early-QB History', `Top-3 QB in ${signals.draft_qb_early_pct.toFixed(0)}% of drafts`)
    }
    if (
      signals.draft_te_early_pct != null
      && signals.draft_te_early_pct > 0
      && archetype.key !== 'te_premium'
    ) {
      pushTrait('early_te', 'Early-TE History', `Top-4 TE in ${signals.draft_te_early_pct.toFixed(0)}% of drafts`)
    }
    // Blowouts
    if (blowWinRate != null && signals.blowout_games >= 4) {
      if (blowWinRate >= 0.6 && archetype.key !== 'steamroller') pushTrait('steamroller_lite', 'Steamroller Streak', `${signals.blowout_record.w}–${signals.blowout_record.l} in ≥30-pt games`)
      else if (blowWinRate <= 0.4) pushTrait('punching_bag', 'Takes Big Hits', `${signals.blowout_record.w}–${signals.blowout_record.l} in ≥30-pt games`)
    }

    // team_latest — most recent manager_season name
    const allMs: ManagerSeasonRow[] = []
    for (const mid of bundle.group.managerIds) allMs.push(...(s.managerSeasonsByManager.get(mid) ?? []))
    const lastMs = allMs.slice().sort((a, b) => {
      const ya = s.seasons.find((sn) => sn.id === a.season_id)?.year ?? 0
      const yb = s.seasons.find((sn) => sn.id === b.season_id)?.year ?? 0
      return yb - ya
    })[0]

    result.push({
      manager_id: bundle.group.primary.id,
      uid: userId(bundle.primary),
      name: bundle.name,
      team_latest: lastMs?.team_name ?? bundle.primary.team_name ?? null,
      is_current: bundle.is_current,
      archetype: {
        key: archetype.key,
        name: archetype.name,
        tagline: archetype.tagline,
        blurb: archetype.blurb,
      },
      traits,
      signals,
    })
  }

  // Current first, then alphabetical by manager name. Earlier we grouped by
  // archetype which made same-archetype managers cluster together — but the
  // page now exposes the archetype tally in the strand panel, so the grid
  // reads more naturally in name order.
  result.sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  // League-level summary for the page header.
  const archetypeCounts: Record<string, number> = {}
  for (const m of result) {
    if (!m.is_current) continue
    archetypeCounts[m.archetype.key] = (archetypeCounts[m.archetype.key] ?? 0) + 1
  }

  return {
    generated_at: new Date().toISOString(),
    league_baselines: {
      efficiency_pct: lineupSignalsUsable && eff.mean > 0 ? round2(eff.mean) : null,
      lineup_churn_pct: lineupSignalsUsable && ch.mean > 0 ? round2(ch.mean) : null,
      volatility_pct: round2(vol.mean),
      draft_rb_share_pct: rb.mean > 0 ? round2(rb.mean) : null,
      trades_per_season: round2(tr.mean),
      avg_margin_pts: round2(mg.mean),
      clutch_win_pct: cl.mean > 0 ? round2(cl.mean) : null,
    },
    archetype_counts: archetypeCounts,
    managers: result,
  }
}
