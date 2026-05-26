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
  draft_scoring_profile: 'ppr_6pt' | 'half_4pt'
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

export async function exportLeague(leagueId: string): Promise<ExportBundle> {
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

  return out
}
