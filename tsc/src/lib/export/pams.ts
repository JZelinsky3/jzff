// Pams-shaped JSON exporter.
// Reads a league out of Supabase and produces the exact file tree that
// pams_site's HTML/JS expects under data/. Output is a flat map of
// relative path -> JSON object so callers can write to disk, return as
// a response, or compare against a fixture.

import { createAdminClient } from '@/lib/supabase/admin'

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
      .select('id, year, external_id, champion_manager_id, runner_up_manager_id, regular_season_winner_id, playoff_weeks, is_live')
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
  const [matchupsAll, managerSeasonsAll, draftsAll] = await Promise.all([
    seasonIdList.length === 0 ? Promise.resolve([] as MatchupRow[]) : selectAllPaged<MatchupRow>(db, 'matchups',
      'season_id, week, manager_a_id, manager_b_id, score_a, score_b, is_playoff, is_championship',
      seasonIdList),
    seasonIdList.length === 0 ? Promise.resolve([] as ManagerSeasonRow[]) : selectManagerSeasonsPaged(db, seasonIdList),
    seasonIdList.length === 0 ? Promise.resolve([] as DraftRow[]) : selectAllPaged<DraftRow>(db, 'drafts',
      'id, season_id, draft_type, rounds',
      seasonIdList),
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
  table: 'matchups' | 'drafts',
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

  let defendingChampion: Record<string, unknown> | null = null
  if (currentSeasonRow?.champion_manager_id) {
    const mgr = s.managers.get(currentSeasonRow.champion_manager_id)
    const ms = (s.managerSeasonsBySeason.get(currentSeasonRow.id) ?? []).find((r) => r.manager_id === currentSeasonRow.champion_manager_id)
    const champGroup = buildManagerToGroup(buildProfileGroups(s)).get(currentSeasonRow.champion_manager_id)
    if (mgr && ms && !(champGroup && isGroupHidden(champGroup))) {
      defendingChampion = {
        year: currentSeasonRow.year,
        team_name: ms.team_name ?? mgr.team_name ?? mgr.display_name,
        owner_name: champGroup ? groupDisplayName(champGroup) : mgr.display_name,
        owner_user_id: userId(champGroup?.primary ?? mgr),
        record: recordStr(ms.wins, ms.losses, ms.ties),
        points_for: round2(Number(ms.points_for)),
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
  // Hide in-progress seasons (marked is_live) from the public season archive —
  // they have no champion / final standings yet, so listing them just shows
  // a "Reigning Champion: —" row that's misleading. The commish still sees
  // them in admin and on the live-season page.
  return {
    seasons: s.seasons.filter((season) => !season.is_live).map((season) => {
      const champ = season.champion_manager_id ? s.managers.get(season.champion_manager_id) : null
      const champGroup = season.champion_manager_id ? managerToGroup.get(season.champion_manager_id) : undefined
      const champMs = champ
        ? (s.managerSeasonsBySeason.get(season.id) ?? []).find((r) => r.manager_id === champ.id)
        : null
      const standings = s.managerSeasonsBySeason.get(season.id) ?? []
      const champHidden = champGroup ? isGroupHidden(champGroup) : false
      return {
        year: season.year,
        champion_name: champHidden ? null : (champGroup ? groupDisplayName(champGroup) : champ?.display_name ?? null),
        champion_team_name: champHidden ? null : (champMs?.team_name ?? champ?.team_name ?? null),
        champion_user_id: champHidden ? null : userId(champGroup?.primary ?? champ ?? undefined),
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
    if (hadPlayoff) playoff_appearances++
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
      const name = groupDisplayName(g)
      return {
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
    for (const g of games) {
      aPF += g.a_score; bPF += g.b_score
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
      if (had) playoffAppearances++
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

  // Jake-only previews: real records_watch + milestones snapshots frozen at
  // end-of-W5-2025 so the live-season templates can be reviewed with real
  // names + numbers before the live data pipeline ships league-wide.
  if (opts.slug === 'jake') {
    const previews = buildLiveSeasonPreviews(s, 2025, 5)
    out['records_watch.json'] = previews.records_watch
    out['milestones.json'] = previews.milestones
  }

  return out
}

// ============================================================
// Live-season previews: records_watch + milestones snapshots
// Frozen at end of regular-season week N for a chosen year so
// the live-season templates can be evaluated against real data.
// Currently used only when slug === 'jake' (see exportLeague).
// ============================================================

function buildLiveSeasonPreviews(
  s: Snapshot,
  year: number,
  throughWeek: number,
): { records_watch: unknown; milestones: unknown } {
  const seasonRow = s.seasons.find((sn) => sn.year === year)
  if (!seasonRow) {
    return {
      records_watch: emptyRecordsWatch(year, throughWeek),
      milestones: emptyMilestones(year, throughWeek),
    }
  }

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

  // ── ALL-TIME (pre-{year}) longest streak + its holder.
  let allWinStreak = { len: 0, mid: '' }
  let allLossStreak = { len: 0, mid: '' }
  for (const [mid, games] of gamesByManager) {
    let runW = 0, runL = 0
    for (const g of games) {
      if (g.year >= year) break
      if (g.result === 'W') { runW++; runL = 0; if (runW > allWinStreak.len) allWinStreak = { len: runW, mid } }
      else if (g.result === 'L') { runL++; runW = 0; if (runL > allLossStreak.len) allLossStreak = { len: runL, mid } }
      else { runW = 0; runL = 0 }
    }
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
    // readout_sub renders as a small grey caption below the unit
    // line on the LCD-style On-Pace cards — e.g. "pace" or
    // "crossed W4". Optional; omitted for non-pace records.
    readout_sub?: string
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
    const v = pfPaceTop.proj, r = bestSeasonPF.val, pct = (v / r) * 100
    const gap = Math.round(v - r)
    const projInt = Math.round(v)
    // Holder's PPG: find their game count from manager_seasons for that year
    let holderPPG = 0
    const holderMs = (s.managerSeasonsBySeason.get(s.seasons.find((sn) => sn.year === bestSeasonPF.year)?.id ?? '') ?? [])
      .find((ms) => ms.manager_id === bestSeasonPF.mid)
    if (holderMs) {
      const holderGames = holderMs.wins + holderMs.losses + holderMs.ties
      if (holderGames > 0) holderPPG = bestSeasonPF.val / holderGames
    }
    accumItems.push({
      category: 'Season Points-For Pace',
      pct,
      flag: flagFor(pct, 'WILL BREAK IT', 'PROJECTING PAST', 'ON PACE', 'TRENDING UP'),
      title_html: `${Math.round(r)} pts <em>· highest reg-season PF</em>`,
      holder: nameOf(bestSeasonPF.mid),
      record_value: holderPPG > 0 ? `${Math.round(r)} pts · ${holderPPG.toFixed(1)} PPG` : `${Math.round(r)} pts`,
      holder_when: `${bestSeasonPF.year}`,
      chaser: pfPaceTop.m.name,
      chaser_value: `${Math.round(pfPaceTop.m.pf)} pts through ${pfPaceTop.m.games.length}G`,
      chaser_when: `pace ${projInt} pts`,
      gap: gap >= 0 ? `+${gap} pts on pace` : `${Math.abs(gap)} pts short on pace`,
      copy_html: `<em>${escTxt(pfPaceTop.m.name)}</em> · pace ${projInt} pts (${(pfPaceTop.m.pf / pfPaceTop.m.games.length).toFixed(1)} PPG)`,
      when: `through W${throughWeek}`,
      previous: `${Math.round(r)} pts · ${nameOf(bestSeasonPF.mid)}, ${bestSeasonPF.year}`,
    })
  }

  // ── Season PPG pace (projection-free; current avg vs all-time best avg)
  const ppgTop = seasonByMgr
    .filter((m) => m.games.length >= 2)
    .map((m) => ({ m, ppg: m.pf / m.games.length }))
    .sort((a, b) => b.ppg - a.ppg)[0]
  if (ppgTop && bestSeasonPPG.val > 0) {
    const v = ppgTop.ppg, r = bestSeasonPPG.val, pct = (v / r) * 100
    accumItems.push({
      category: 'Season PPG Pace',
      pct,
      flag: flagFor(pct, 'PPG RECORD CLIMBING', 'PROJECTING PAST', 'ON PACE', 'STRONG SCORING'),
      title_html: `${r.toFixed(1)} <em>· best regular-season PPG</em>`,
      holder: nameOf(bestSeasonPPG.mid), record_value: `${r.toFixed(1)} PPG`,
      holder_when: `${bestSeasonPPG.year}`,
      chaser: ppgTop.m.name, chaser_value: `${v.toFixed(1)} PPG`,
      chaser_when: `${ppgTop.m.games.length}G · ${year}`,
      gap: v >= r ? `+${(v - r).toFixed(1)} above` : `${(r - v).toFixed(1)} below`,
      copy_html: `<em>${escTxt(ppgTop.m.name)}</em> · ${v.toFixed(1)} PPG through ${ppgTop.m.games.length}G`,
      when: `through W${throughWeek} · ${year}`,
      previous: `${r.toFixed(1)} · ${nameOf(bestSeasonPPG.mid)}, ${bestSeasonPPG.year}`,
    })
  }

  // ── Regular-season WINS pace (only meaningful past midweek; gate at W5)
  if (throughWeek >= 5) {
    const winsPaceTop = seasonByMgr
      .filter((m) => m.games.length > 0)
      .map((m) => ({ m, proj: (m.wins / m.games.length) * regSeasonLen }))
      .sort((a, b) => b.proj - a.proj)[0]
    if (winsPaceTop && mostRegWins.val > 0) {
      const v = winsPaceTop.proj, r = mostRegWins.val, pct = (v / r) * 100
      const projInt = Math.round(v)
      const gap = Math.round(v - r)
      accumItems.push({
        category: 'Reg-Season Wins Pace',
        pct,
        flag: flagFor(pct, 'WILL MATCH OR PASS', 'ON PACE TO TIE', 'BIG W-PACE', 'STRONG START'),
        title_html: `${r} wins <em>· most reg-season wins</em>`,
        holder: nameOf(mostRegWins.mid), record_value: `${r} wins`,
        holder_when: `${mostRegWins.year}`,
        chaser: winsPaceTop.m.name,
        chaser_value: `${winsPaceTop.m.wins}-${winsPaceTop.m.losses} through ${winsPaceTop.m.games.length}G`,
        chaser_when: `pace ${projInt} wins`,
        gap: gap >= 0 ? `+${gap} wins on pace` : `${Math.abs(gap)} wins short on pace`,
        copy_html: `<em>${escTxt(winsPaceTop.m.name)}</em> · pace ${projInt} wins (${winsPaceTop.m.wins}-${winsPaceTop.m.losses})`,
        when: `through W${throughWeek}`,
        previous: `${r} wins · ${nameOf(mostRegWins.mid)}, ${mostRegWins.year}`,
      })
    }

    // ── Regular-season LOSSES pace
    const lossPaceTop = seasonByMgr
      .filter((m) => m.games.length > 0)
      .map((m) => ({ m, proj: (m.losses / m.games.length) * regSeasonLen }))
      .sort((a, b) => b.proj - a.proj)[0]
    if (lossPaceTop && mostRegLoss.val > 0) {
      const v = lossPaceTop.proj, r = mostRegLoss.val, pct = (v / r) * 100
      const projInt = Math.round(v)
      const gap = Math.round(v - r)
      accumItems.push({
        category: 'Reg-Season Losses Pace',
        pct,
        flag: flagFor(pct, 'WORST SEASON INCOMING', 'TANK PACE', 'STRUGGLING', 'ROUGH RUN'),
        title_html: `${r} losses <em>· most reg-season losses</em>`,
        holder: nameOf(mostRegLoss.mid), record_value: `${r} losses`,
        holder_when: `${mostRegLoss.year}`,
        chaser: lossPaceTop.m.name,
        chaser_value: `${lossPaceTop.m.wins}-${lossPaceTop.m.losses} through ${lossPaceTop.m.games.length}G`,
        chaser_when: `pace ${projInt} losses`,
        gap: gap >= 0 ? `+${gap} losses on pace` : `${Math.abs(gap)} losses short on pace`,
        copy_html: `<em>${escTxt(lossPaceTop.m.name)}</em> · pace ${projInt} losses (${lossPaceTop.m.wins}-${lossPaceTop.m.losses})`,
        when: `through W${throughWeek}`,
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
      flag: flagFor(pct, 'TIED OR SURPASSED', 'ONE FROM HISTORY', 'ON THE BRINK', 'HEATING UP'),
      title_html: `${r} wins <em>· longest streak ever</em>`,
      holder: nameOf(allWinStreak.mid), record_value: `${r} wins in a row`,
      holder_when: 'all-time mark',
      chaser: liveWin.name, chaser_value: `${v} wins active`,
      chaser_when: `through W${throughWeek}`,
      gap: pct >= 100 ? `+${v - r} wins past the line` : `${r - v} wins to tie`,
      copy_html: `<em>${escTxt(liveWin.name)}</em> on a ${v}-game win streak`,
      when: `through W${throughWeek}`,
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
      flag: flagFor(pct, 'NEW SKID HIGH', 'COLD AS ICE', 'STRUGGLING', 'ROUGH PATCH'),
      title_html: `${r} losses <em>· longest skid ever</em>`,
      holder: nameOf(allLossStreak.mid), record_value: `${r} losses in a row`,
      holder_when: 'all-time skid',
      chaser: liveLoss.name, chaser_value: `${v} losses active`,
      chaser_when: `through W${throughWeek}`,
      gap: pct >= 100 ? `+${v - r} losses past` : `${r - v} losses to tie`,
      copy_html: `<em>${escTxt(liveLoss.name)}</em> has dropped ${v} straight`,
      when: `through W${throughWeek}`,
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
        const crossings: Array<{ walk: Walk; cross: Crossing | null; currentVal: number; gamesPlayed: number; perGame: number }> = []
        for (const w of walks) {
          const cross = cfg.kind === 'wins' ? crossingForWins(w, T) : crossingForPF(w, T);
          let currentVal = 0
          let gamesPlayed = w.games.length
          if (cfg.kind === 'wins') {
            for (const g of w.games) if (g.result === 'W') currentVal++
          } else {
            for (const g of w.games) currentVal += g.self_score
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
          crossings.push({ walk: w, cross, currentVal, gamesPlayed, perGame })

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
        // than the record.
        type Chaser = { walk: Walk; projGames: number; broke: boolean; crossingDesc?: string }
        let bestChaser: Chaser | null = null
        for (const c of crossings) {
          if (c.walk === r.walk) continue
          if (c.cross && c.cross.year === year) {
            // crossed during {year}
            const cand: Chaser = {
              walk: c.walk,
              projGames: c.cross.games,
              broke: c.cross.games < r.games,
              crossingDesc: `W${c.cross.week} · ${year}`,
            }
            if (!bestChaser || cand.projGames < bestChaser.projGames) bestChaser = cand
          } else if (!c.cross && c.currentVal > 0 && c.perGame > 0 && c.currentVal < T) {
            // Hasn't crossed; project at {year}-pace.
            const needed = T - c.currentVal
            const moreGames = needed / c.perGame
            const proj = Math.round(c.gamesPlayed + moreGames)
            // Only surface if their projection is meaningful relative to the
            // record (within ~30% to bound chase candidates).
            if (proj <= r.games * 1.3) {
              const cand: Chaser = { walk: c.walk, projGames: proj, broke: false }
              if (!bestChaser || cand.projGames < bestChaser.projGames) bestChaser = cand
            }
          }
        }
        if (!bestChaser) continue

        // Lower projected games = better. pct flips the ratio so the existing
        // brink/chase/broken bucketing (pct >= 100 broken, >= 85 brink) works.
        const pct = (r.games / bestChaser.projGames) * 100
        const projGames = bestChaser.projGames
        const gap = r.games - projGames  // positive = on pace to break (faster)
        const broke = bestChaser.broke

        accumItems.push({
          category: cfg.label(T),
          pct,
          flag: broke
            ? 'NEW QUICKEST'
            : flagFor(pct, 'WILL BREAK IT', 'PROJECTING PAST', 'ON PACE', 'PURSUING'),
          title_html: `${r.games} games <em>· quickest to ${cfg.fmtT(T)}</em>`,
          holder: r.walk.name,
          record_value: cfg.fmtGames(r.games),
          holder_when: `set ${r.year}`,
          chaser: bestChaser.walk.name,
          // chaser_value leads with the bare number + unit so the LCD
          // readout shows "16" big with "games" as the unit caption.
          // The "pace" / "crossed" qualifier rides in readout_sub.
          chaser_value: `${projGames} games`,
          readout_sub: broke ? `crossed ${bestChaser.crossingDesc || ''}` : 'pace',
          chaser_when: broke
            ? `crossed ${cfg.fmtT(T)} in ${projGames}G`
            : `through W${throughWeek}`,
          gap: gap > 0
            ? `${gap} games faster on pace`
            : gap < 0 ? `${Math.abs(gap)} games slower on pace` : 'matching pace',
          copy_html: `<em>${escTxt(bestChaser.walk.name)}</em> · ${broke ? 'crossed' : 'pace'} ${projGames} games to ${cfg.fmtT(T)}`,
          when: `through W${throughWeek}`,
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
      flag: pct >= 100 ? 'BROKEN' : pct >= 95 ? 'NEARLY' : pct >= 85 ? 'BIG WEEK' : 'NOTABLE',
      title_html: `${r.toFixed(1)} <em>· single-week high</em>`,
      holder: nameOf(allHigh.mid), record_value: `${r.toFixed(1)} pts`,
      holder_when: `W${allHigh.week} · ${allHigh.year}`,
      chaser: topHigh.name, chaser_value: `${v.toFixed(1)} pts`,
      chaser_when: `W${topHigh.bestWeek!.week} · ${year} vs ${nameOf(topHigh.bestWeek!.opp_id)}`,
      gap: pct >= 100 ? `+${(v - r).toFixed(1)} past` : `${(r - v).toFixed(1)} short`,
      copy_html: `<em>${escTxt(topHigh.name)}</em> posted the season high — ${v.toFixed(1)} pts (W${topHigh.bestWeek!.week} vs ${escTxt(nameOf(topHigh.bestWeek!.opp_id))})`,
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
      flag: pct >= 100 ? 'NEW LOW' : pct >= 95 ? 'NEARLY' : pct >= 85 ? 'COLD WEEK' : 'NOTABLE',
      title_html: `${r.toFixed(1)} <em>· single-week low</em>`,
      holder: nameOf(allLow.mid), record_value: `${r.toFixed(1)} pts`,
      holder_when: `W${allLow.week} · ${allLow.year}`,
      chaser: topLow.name, chaser_value: `${v.toFixed(1)} pts`,
      chaser_when: `W${topLow.worstWeek!.week} · ${year}`,
      gap: pct >= 100 ? `${(r - v).toFixed(1)} under` : `${(v - r).toFixed(1)} above`,
      copy_html: `<em>${escTxt(topLow.name)}</em> bottomed out at ${v.toFixed(1)} pts — the season's lowest scoreline (W${topLow.worstWeek!.week})`,
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
      flag: pct >= 100 ? 'NEW BLOWOUT' : pct >= 95 ? 'NEARLY' : pct >= 85 ? 'BRUTAL' : 'BIG MARGIN',
      title_html: `+${r.toFixed(1)} <em>· margin record</em>`,
      holder: nameOf(allBlowout.mid), record_value: `+${r.toFixed(1)}`,
      holder_when: `W${allBlowout.week} · ${allBlowout.year}`,
      chaser: topBlow.name, chaser_value: `+${v.toFixed(1)}`,
      chaser_when: `W${topBlow.bestBlowout!.week} · ${year} vs ${nameOf(topBlow.bestBlowout!.opp_id)}`,
      gap: pct >= 100 ? `+${(v - r).toFixed(1)} past` : `${(r - v).toFixed(1)} short`,
      copy_html: `<em>${escTxt(topBlow.name)}</em> ran the season's biggest blowout — won by ${v.toFixed(1)} (W${topBlow.bestBlowout!.week})`,
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
      flag: pct >= 100 ? 'NEW SHOOTOUT' : pct >= 95 ? 'NEARLY' : pct >= 85 ? 'SHOOTOUT' : 'HIGH SCORING',
      title_html: `${r.toFixed(1)} <em>· highest combined game</em>`,
      holder: `${nameOf(allCombined.mid)} v ${allCombined.opp}`,
      record_value: `${r.toFixed(1)} combined`,
      holder_when: `W${allCombined.week} · ${allCombined.year}`,
      chaser: `${topCombo.name} v ${nameOf(topCombo.bestCombined!.opp_id)}`,
      chaser_value: `${v.toFixed(1)} combined`,
      chaser_when: `W${topCombo.bestCombined!.week} · ${year}`,
      gap: pct >= 100 ? `+${(v - r).toFixed(1)} past` : `${(r - v).toFixed(1)} short`,
      copy_html: `<em>${escTxt(topCombo.name)}</em> & ${escTxt(nameOf(topCombo.bestCombined!.opp_id))} ran the season's highest-scoring shootout — ${v.toFixed(1)} combined (W${topCombo.bestCombined!.week})`,
      when: `W${topCombo.bestCombined!.week} · ${year}`,
      previous: `${r.toFixed(1)} · ${allCombined.year}`,
    })
  }

  // Bucket accumulators into brink/chase/broken; just-missed stays its own.
  const brink: WatchItem[] = []
  const chase: WatchItem[] = []
  const broken: WatchItem[] = []
  for (const it of accumItems) {
    if (it.pct >= 100) broken.push(it)
    else if (it.pct >= 85) brink.push(it)
    else chase.push(it)
  }
  brink.sort((a, b) => b.pct - a.pct)
  chase.sort((a, b) => b.pct - a.pct)
  broken.sort((a, b) => b.pct - a.pct)
  justMissedItems.sort((a, b) => b.pct - a.pct)

  const records_watch = {
    meter: {
      brink: brink.length,
      chase: chase.length,
      broken: broken.length,
      just_missed: justMissedItems.length,
      through: `W${throughWeek} · ${year}`,
    },
    brink: brink.slice(0, 6),
    chase: chase.slice(0, 6),
    broken: broken.slice(0, 6),
    just_missed: justMissedItems.slice(0, 6),
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

  const careers: Career[] = []
  for (const g of groups) {
    if (isGroupHidden(g)) continue
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
  const gamesTiers  = [25, 50, 75, 100, 125, 150, 200, 250]
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

    // ── Crossed: career games started
    const gTier = nextTierCrossed(c.gamesBefore, c.gamesAfter, gamesTiers)
    if (gTier != null) {
      const idx = gTier - c.gamesBefore - 1
      const gm = c.seasonGames[idx]
      crossed.push({
        glyph: '◈', tier: 'CAREER STARTS', category: 'wins', name: c.name, avatar: c.avatar,
        achievement_html: `<strong>${ordinal(gTier)}</strong> career start`,
        stats_html: statsFor(c, 'wins'),
        meta_html: gm ? metaWins(seedMid, gm.week, gm.self_score, gm.opp_id) : '',
        when: gm ? `W${gm.week}` : '',
        sort: (gm?.week ?? 0) * 100 + 1,
      })
    }

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
      imminent.wins.push({
        glyph: '✦', category: 'wins', name: c.name, avatar: c.avatar,
        copy_html: `<em>1</em> win from <em>${ordinal(winsTo)}</em>`,
        stats_html: statsFor(c, 'wins'),
        eta: '1 win', eta_unit: 'to go',
        sort: 1,
      })
    }
    const gamesTo = nextTierAhead(c.gamesAfter, gamesTiers)
    if (gamesTo != null && gamesTo - c.gamesAfter === 1) {
      imminent.wins.push({
        glyph: '◈', category: 'wins', name: c.name, avatar: c.avatar,
        copy_html: `next game = <em>${ordinal(gamesTo)}</em> start`,
        stats_html: statsFor(c, 'wins'),
        eta: '1 game', eta_unit: 'to go',
        sort: 2,
      })
    }
    const pfTo = nextTierAhead(c.pfAfter, pfTiers)
    if (pfTo != null && pfTo - c.pfAfter <= 150) {
      const gap = Math.round(pfTo - c.pfAfter)
      imminent.points.push({
        glyph: '★', category: 'points', name: c.name, avatar: c.avatar,
        copy_html: `<em>${gap}</em> pts from <em>${pfTo.toLocaleString()}</em>`,
        stats_html: statsFor(c, 'points'),
        eta: `${gap}`, eta_unit: 'pts to go',
        sort: gap,
      })
    }
    // Streak imminent: one win from beating the manager's own personal best
    if (c.activeStreak.type === 'W' && c.careerLongestWinStreak > 0 && c.activeStreak.len === c.careerLongestWinStreak) {
      const target = c.careerLongestWinStreak + 1
      imminent.streak.push({
        glyph: '✺', category: 'streak', name: c.name, avatar: c.avatar,
        copy_html: `one win from a new personal-best <em>${target}-game win</em> streak`,
        stats_html: statsFor(c, 'streak'),
        eta: '1 win', eta_unit: 'to go',
        sort: 1,
      })
    }

    // ── Horizon (2-8 wins out, 150-800 PF out; streak chases personal best)
    if (winsTo != null) {
      const gap = winsTo - c.winsAfter
      if (gap >= 2 && gap <= 8) {
        horizon.wins.push({
          glyph: '✦', category: 'wins', name: c.name, avatar: c.avatar,
          copy_html: `<em>${gap}</em> wins from <em>${ordinal(winsTo)}</em>`,
          stats_html: statsFor(c, 'wins'),
          eta: `${gap} wins`, eta_unit: 'remaining',
          sort: gap,
        })
      }
    }
    if (gamesTo != null) {
      const gap = gamesTo - c.gamesAfter
      if (gap >= 2 && gap <= 6) {
        horizon.wins.push({
          glyph: '◈', category: 'wins', name: c.name, avatar: c.avatar,
          copy_html: `<em>${gap}</em> starts from <em>${ordinal(gamesTo)}</em> career game`,
          stats_html: statsFor(c, 'wins'),
          eta: `${gap} games`, eta_unit: 'remaining',
          sort: gap + 0.5,
        })
      }
    }
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
    // Streak horizon: active run is ≥50% of personal best but not yet there.
    // Target is personal_best + 1 (the next mark they'd be setting).
    if (
      c.activeStreak.type === 'W' &&
      c.careerLongestWinStreak >= 2 &&
      c.activeStreak.len >= Math.ceil(c.careerLongestWinStreak * 0.5) &&
      c.activeStreak.len < c.careerLongestWinStreak
    ) {
      const target = c.careerLongestWinStreak + 1
      const gap = target - c.activeStreak.len
      horizon.streak.push({
        glyph: '✺', category: 'streak', name: c.name, avatar: c.avatar,
        copy_html: `<em>${gap}</em> wins shy of a <em>${target}-game win</em> streak`,
        stats_html: statsFor(c, 'streak'),
        eta: `${gap} wins`, eta_unit: 'remaining',
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

  const milestones = {
    meter: {
      week: crossed.filter((c) => c.when === `W${throughWeek}`).length,
      season: crossed.length,
      imminent: imminentCount,
      through: `W${throughWeek} · ${year}`,
    },
    // Bumped from 6 → 12 so the template can scale into dense mode when
    // there are more than 6 fresh milestones to surface.
    crossed: crossed.slice(0, 12),
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
function emptyRecordsWatch(year: number, throughWeek: number) {
  return {
    meter: { brink: 0, chase: 0, broken: 0, just_missed: 0, through: `W${throughWeek} · ${year}` },
    brink: [], chase: [], broken: [], just_missed: [],
  }
}
function emptyMilestones(year: number, throughWeek: number) {
  return {
    meter: { week: 0, season: 0, imminent: 0, through: `W${throughWeek} · ${year}` },
    crossed: [],
    imminent_by_category: { wins: [], points: [], streak: [] },
    horizon_by_category:  { wins: [], points: [], streak: [] },
  }
}
