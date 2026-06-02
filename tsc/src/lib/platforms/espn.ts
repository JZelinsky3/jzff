// ESPN Fantasy Football platform adapter.
//
// ESPN exposes a JSON API for league data. Two endpoints matter:
//   Modern (current + recent seasons, typically 2018+):
//     https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/<year>/segments/0/leagues/<leagueId>?view=...
//   Historical (older seasons that have been migrated to the "history" archive):
//     https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/<leagueId>?seasonId=<year>&view=...
//
// Both hosts accept the same `?view=` filters. Pass multiple views by repeating
// the parameter (e.g. ?view=mTeam&view=mMatchup&view=mSettings).
//
// Auth: public leagues need no cookies. Private leagues require both SWID
// (a UUID wrapped in braces) and espn_s2 (a long opaque token) sent as
// cookies on every request. The commish pastes them in during source setup.

const HOST = 'https://lm-api-reads.fantasy.espn.com'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ─── Auth ──────────────────────────────────────────────────────────────────

export type EspnAuth = {
  // SWID is the user's stable account id, formatted as "{UUID}" with braces.
  // espn_s2 is an opaque session token. Both required for private leagues.
  swid?: string | null
  espnS2?: string | null
}

function buildHeaders(auth?: EspnAuth): HeadersInit {
  const headers: Record<string, string> = {
    'User-Agent': UA,
    'Accept': 'application/json',
  }
  if (auth?.swid && auth?.espnS2) {
    // Both cookies must be present together; ESPN ignores SWID without espn_s2.
    const swid = auth.swid.startsWith('{') ? auth.swid : `{${auth.swid}}`
    headers['Cookie'] = `SWID=${swid}; espn_s2=${auth.espnS2}`
  }
  return headers
}

// ─── Types ─────────────────────────────────────────────────────────────────

// ESPN member ("user") record. `id` is a SWID like "{ABC123...}". One member
// can own multiple teams in the same league; one team can have co-owners.
export type EspnMember = {
  id: string
  displayName?: string
  firstName?: string
  lastName?: string
  isLeagueManager?: boolean
}

// ESPN team record. `id` is the per-season team id (1..N within the league).
export type EspnTeam = {
  id: number
  abbrev?: string
  name?: string           // modern API
  location?: string       // legacy: split name field
  nickname?: string       // legacy: split name field
  logo?: string
  owners?: string[]       // member SWIDs
  divisionId?: number
  playoffSeed?: number
  rankCalculatedFinal?: number   // final standings rank
  rankFinal?: number
  record?: {
    overall?: { wins?: number; losses?: number; ties?: number; pointsFor?: number; pointsAgainst?: number; percentage?: number }
    division?: { wins?: number; losses?: number; ties?: number }
  }
}

// One half of a matchup. ESPN nests scores by team; `teamId` references EspnTeam.id.
export type EspnMatchupSide = {
  teamId: number
  totalPoints?: number
  totalPointsLive?: number
}

export type EspnScheduleItem = {
  id: number
  matchupPeriodId: number   // ESPN's "matchup period" — usually equals the NFL week, but multi-week matchups exist
  playoffTierType?: string  // NONE | WINNERS_BRACKET | LOSERS_CONSOLATION_LADDER | etc.
  winner?: 'HOME' | 'AWAY' | 'TIE' | 'UNDECIDED'
  home?: EspnMatchupSide
  away?: EspnMatchupSide
}

export type EspnDivision = {
  id: number
  name: string
  size?: number
}

export type EspnSettings = {
  name?: string
  scheduleSettings?: {
    matchupPeriodCount?: number
    playoffMatchupPeriodLength?: number
    playoffTeamCount?: number
    divisions?: EspnDivision[]
  }
}

export type EspnDraftPick = {
  overallPickNumber: number
  roundId: number
  roundPickNumber: number
  teamId: number
  playerId: number
  // ESPN does not include the player's name in the draft view — we'd need a
  // separate kona_player_info call. For v1 we leave name resolution to the
  // ingest layer (it can map playerId → name via a cached lookup or skip names).
  keeper?: boolean
  nominatingTeamId?: number      // auction drafts
  bidAmount?: number             // auction drafts
}

// Full league payload as we use it. ESPN returns much more — we narrow to
// the fields the ingest layer actually reads.
export type EspnLeague = {
  id: number
  seasonId: number
  scoringPeriodId?: number
  status?: {
    currentMatchupPeriod?: number
    isActive?: boolean
    latestScoringPeriod?: number
    finalScoringPeriod?: number
    previousSeasons?: number[]
  }
  members?: EspnMember[]
  teams?: EspnTeam[]
  schedule?: EspnScheduleItem[]
  settings?: EspnSettings
  draftDetail?: { drafted?: boolean; completed?: boolean; picks?: EspnDraftPick[] }
}

// ─── HTTP ──────────────────────────────────────────────────────────────────

function buildUrl(leagueId: string, season: number, views: string[], historical: boolean): string {
  const viewQs = views.map((v) => `view=${encodeURIComponent(v)}`).join('&')
  if (historical) {
    // History endpoint returns an *array* with one element per matched season.
    return `${HOST}/apis/v3/games/ffl/leagueHistory/${encodeURIComponent(leagueId)}?seasonId=${season}&${viewQs}`
  }
  return `${HOST}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(leagueId)}?${viewQs}`
}

async function fetchEspn<T>(url: string, auth?: EspnAuth): Promise<T> {
  const res = await fetch(url, { headers: buildHeaders(auth), cache: 'no-store' })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(auth?.swid
        ? 'ESPN auth failed — your SWID/espn_s2 cookies may have expired. Grab fresh ones from a logged-in ESPN tab.'
        : 'ESPN auth required — this league is private. Check the "private league" box and paste your SWID + espn_s2 cookies.')
    }
    if (res.status === 403) throw new Error('ESPN forbidden (403) — cookies are valid but this league or season is restricted.')
    if (res.status === 404) throw new Error(`ESPN 404 — league not found for that season. Double-check the league ID and try an older year if this is a long-dormant league.`)
    throw new Error(`ESPN ${url} → HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

// Try modern endpoint first; if it 404s and `tryHistorical` is set, fall back.
// Pre-2018 seasons live only on the history endpoint; recent seasons live on
// modern. The cutover year has crept around over the years, so we sniff rather
// than hardcoding.
async function fetchLeaguePayload(
  leagueId: string,
  season: number,
  views: string[],
  auth?: EspnAuth
): Promise<EspnLeague> {
  try {
    return await fetchEspn<EspnLeague>(buildUrl(leagueId, season, views, false), auth)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (!msg.includes('404')) throw err
    // Historical endpoint returns an array; unwrap.
    const arr = await fetchEspn<EspnLeague[]>(buildUrl(leagueId, season, views, true), auth)
    const hit = arr.find((lg) => lg.seasonId === season) ?? arr[0]
    if (!hit) throw new Error(`ESPN history endpoint returned no leagues for season ${season}.`)
    return hit
  }
}

// ─── Public probe: confirm the league exists + auth (if any) works ─────────

export type EspnLeagueProbe =
  | { ok: true; name: string; seasonId: number; teamCount: number; isPublic: boolean }
  | { ok: false; error: string }

export async function probeLeague(
  leagueId: string,
  season: number,
  auth?: EspnAuth
): Promise<EspnLeagueProbe> {
  try {
    // mTeam + mSettings is the cheapest combo that returns league name and team count.
    const lg = await fetchLeaguePayload(leagueId, season, ['mTeam', 'mSettings'], auth)
    return {
      ok: true,
      name: lg.settings?.name || `ESPN League ${leagueId}`,
      seasonId: lg.seasonId,
      teamCount: lg.teams?.length ?? 0,
      // Heuristic: if the request succeeded without auth, the league is public.
      isPublic: !auth?.swid,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Probe failed.' }
  }
}

// ─── Per-season fetchers ───────────────────────────────────────────────────

// One call grabs teams, members, schedule, settings, and the draft. ESPN
// accepts multiple ?view= params on the same request, so we batch.
export async function fetchSeason(
  leagueId: string,
  season: number,
  auth?: EspnAuth
): Promise<EspnLeague> {
  return fetchLeaguePayload(
    leagueId,
    season,
    ['mTeam', 'mMatchup', 'mSettings', 'mStandings', 'mDraftDetail'],
    auth
  )
}

// Lightweight: just teams + members (for source label / metadata).
export async function fetchTeams(leagueId: string, season: number, auth?: EspnAuth): Promise<EspnLeague> {
  return fetchLeaguePayload(leagueId, season, ['mTeam'], auth)
}

// Lightweight: schedule + scores only (used when re-syncing a live week).
export async function fetchSchedule(leagueId: string, season: number, auth?: EspnAuth): Promise<EspnLeague> {
  return fetchLeaguePayload(leagueId, season, ['mMatchup', 'mStandings'], auth)
}

// ─── Per-week roster snapshot ─────────────────────────────────────────────
//
// For the Best Coach Tracker we need each team's roster *as it stood that
// week* with per-player fantasy points and which slot the player filled. ESPN
// returns this when you include `view=mRoster&view=mMatchupScore` and pin a
// scoringPeriodId. Older history seasons may not honor scoringPeriodId — the
// caller should be prepared for sparse entries[].

export type EspnPlayerStat = {
  scoringPeriodId?: number
  statSourceId?: number      // 0 = actual, 1 = projected
  statSplitTypeId?: number   // 0 = season, 1 = single scoring period
  appliedTotal?: number
}

export type EspnRosterPlayer = {
  id: number
  fullName?: string
  firstName?: string
  lastName?: string
  defaultPositionId?: number
  proTeamId?: number
  stats?: EspnPlayerStat[]
}

export type EspnRosterEntry = {
  lineupSlotId: number
  playerId: number
  playerPoolEntry?: { player?: EspnRosterPlayer }
}

export type EspnTeamRoster = {
  id: number
  roster?: { entries?: EspnRosterEntry[] }
}

export type EspnWeekRosterPayload = {
  teams?: EspnTeamRoster[]
}

export async function fetchWeekRoster(
  leagueId: string,
  season: number,
  week: number,
  auth?: EspnAuth
): Promise<EspnWeekRosterPayload> {
  const views = ['mRoster', 'mMatchupScore']
  const viewQs = views.map((v) => `view=${encodeURIComponent(v)}`).join('&')
  const url = `${HOST}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(leagueId)}?${viewQs}&scoringPeriodId=${week}`
  try {
    return await fetchEspn<EspnWeekRosterPayload>(url, auth)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (!msg.includes('404')) throw err
    const histUrl = `${HOST}/apis/v3/games/ffl/leagueHistory/${encodeURIComponent(leagueId)}?seasonId=${season}&${viewQs}&scoringPeriodId=${week}`
    const arr = await fetchEspn<EspnWeekRosterPayload[]>(histUrl, auth)
    return arr.find((p) => Array.isArray(p.teams)) ?? { teams: [] }
  }
}

// ESPN lineup slot id → unified slot string. Bench/IR/taxi are flagged as
// non-starter by the ingest layer based on the returned string. Slots we
// don't recognize fall through as `FLEX_OR_UNKNOWN` so the row still writes
// but we can spot them later if a league uses an exotic slot type.
const LINEUP_SLOT_BY_ID: Record<number, string> = {
  0:  'QB',
  1:  'TQB',
  2:  'RB',
  3:  'RB/WR',
  4:  'WR',
  5:  'WR/TE',
  6:  'TE',
  7:  'OP',
  16: 'DEF',
  17: 'K',
  18: 'P',
  19: 'HC',
  20: 'BN',
  21: 'IR',
  23: 'FLEX',
}

export function espnSlotName(id: number): string {
  return LINEUP_SLOT_BY_ID[id] ?? 'UNKNOWN'
}

export function isStarterSlot(slot: string): boolean {
  return slot !== 'BN' && slot !== 'IR' && slot !== 'TAXI' && slot !== 'UNKNOWN'
}

// ─── Player lookup (kona_player_info) ─────────────────────────────────────
//
// The draft view (`mDraftDetail`) returns `playerId` but no player name. Names
// live in a separate `/players?view=kona_player_info` endpoint that takes an
// `x-fantasy-filter` header narrowing the universe. We use it to batch-resolve
// names for the picks of a season.
//
// Player IDs are stable across seasons (they're ESPN's canonical NFL player
// ids), but proTeamId reflects the player's team in that specific season —
// so call this with the same season as the draft for accurate team affiliation.

export type EspnPlayerInfo = {
  id: number
  fullName?: string
  firstName?: string
  lastName?: string
  defaultPositionId?: number
  proTeamId?: number
}

// ESPN's defaultPositionId → fantasy position abbreviation.
// 1=QB, 2=RB, 3=WR, 4=TE, 5=K, 16=D/ST. Other slots (flex, IDP) don't appear
// as a player's *default* position, so we don't need to map them here.
const POSITION_BY_ID: Record<number, string> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'DEF',
}

// ESPN's proTeamId → NFL abbreviation. Stable mapping; only changes when a
// team relocates (e.g. 13 was OAK, then LV — the id stays the same, the
// abbreviation we map to is the current one).
const NFL_TEAM_BY_ID: Record<number, string> = {
  0:  'FA',
  1:  'ATL', 2:  'BUF', 3:  'CHI', 4:  'CIN', 5:  'CLE',
  6:  'DAL', 7:  'DEN', 8:  'DET', 9:  'GB',  10: 'TEN',
  11: 'IND', 12: 'KC',  13: 'LV',  14: 'LAR', 15: 'MIA',
  16: 'MIN', 17: 'NE',  18: 'NO',  19: 'NYG', 20: 'NYJ',
  21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF',
  26: 'SEA', 27: 'TB',  28: 'WSH', 29: 'CAR', 30: 'JAX',
  33: 'BAL', 34: 'HOU',
}

export function positionFromId(id: number | undefined | null): string | null {
  if (id == null) return null
  return POSITION_BY_ID[id] ?? null
}

export function nflTeamFromId(id: number | undefined | null): string | null {
  if (id == null) return null
  return NFL_TEAM_BY_ID[id] ?? null
}

// Batch-fetch player info for an explicit list of playerIds. Returns a Map
// keyed by playerId so callers can look up names without scanning the array.
// ESPN's filter accepts up to a few thousand ids per call; we chunk at 1000
// just to keep request payloads bounded.
export async function fetchPlayers(
  season: number,
  playerIds: number[],
  auth?: EspnAuth
): Promise<Map<number, EspnPlayerInfo>> {
  const out = new Map<number, EspnPlayerInfo>()
  if (playerIds.length === 0) return out

  const CHUNK = 1000
  const unique = Array.from(new Set(playerIds))
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK)
    const filter = {
      players: {
        filterIds: { value: slice },
        limit: slice.length,
      },
    }
    // Try modern endpoint first; fall back to history for older seasons.
    const url = `${HOST}/apis/v3/games/ffl/seasons/${season}/players?view=kona_player_info`
    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Accept': 'application/json',
      'x-fantasy-filter': JSON.stringify(filter),
    }
    if (auth?.swid && auth?.espnS2) {
      const swid = auth.swid.startsWith('{') ? auth.swid : `{${auth.swid}}`
      headers['Cookie'] = `SWID=${swid}; espn_s2=${auth.espnS2}`
    }
    let res = await fetch(url, { headers, cache: 'no-store' })
    if (res.status === 404) {
      // ESPN's player endpoint sometimes 404s on very old seasons. Older
      // seasons' player metadata is still on the modern endpoint with the
      // current year — fall back to the latest year as a best-effort.
      const fallbackYear = new Date().getFullYear()
      const fbUrl = `${HOST}/apis/v3/games/ffl/seasons/${fallbackYear}/players?view=kona_player_info`
      res = await fetch(fbUrl, { headers, cache: 'no-store' })
    }
    if (!res.ok) {
      throw new Error(`ESPN players ${season} → HTTP ${res.status}`)
    }
    const data = (await res.json()) as EspnPlayerInfo[]
    for (const p of data ?? []) {
      if (typeof p?.id === 'number') out.set(p.id, p)
    }
  }
  return out
}

// ─── Helpers ───────────────────────────────────────────────────────────────

// Modern API uses `team.name`; older seasons split into `location` + `nickname`.
export function teamDisplayName(team: EspnTeam): string {
  if (team.name && team.name.trim()) return team.name.trim()
  const composed = [team.location, team.nickname].filter(Boolean).join(' ').trim()
  return composed || team.abbrev || `Team ${team.id}`
}

// Pick a member's best display name.
export function memberDisplayName(m: EspnMember): string {
  if (m.displayName && m.displayName.trim()) return m.displayName.trim()
  const composed = [m.firstName, m.lastName].filter(Boolean).join(' ').trim()
  return composed || m.id
}

// Regular-season schedule items have playoffTierType === 'NONE' (or undefined
// on very old seasons). Anything else — WINNERS_BRACKET, LOSERS_CONSOLATION_LADDER,
// WINNERS_CONSOLATION_LADDER — is postseason. Ingest may want to flag these
// separately so head-to-head records don't double-count playoff games.
export function isRegularSeasonMatchup(m: EspnScheduleItem): boolean {
  const tier = m.playoffTierType
  return !tier || tier === 'NONE'
}

// "Real" postseason tiers — the only one that counts as actual playoff
// history. Anything else (LOSERS_CONSOLATION_LADDER, WINNERS_CONSOLATION_LADDER,
// PLACEMENT, BYE, etc.) is filler that we drop from the import entirely.
function isConsolationTier(tier: string | undefined): boolean {
  if (!tier) return false
  return tier !== 'NONE' && tier !== 'WINNERS_BRACKET'
}

// Sum schedule sides into a flat per-week array. ESPN matchups can span
// multiple scoring periods (rare; H2H_POINTS leagues only do single-week),
// but matchupPeriodId is the canonical "week" everywhere we care about.
export type EspnFlatMatchup = {
  week: number
  a_team_id: number
  a_score: number | null
  b_team_id: number
  b_score: number | null
  is_playoff: boolean
  // Raw ESPN tier so the ingest can apply richer logic (e.g. championship
  // detection by spotting the final WINNERS_BRACKET game). 'NONE' or
  // undefined for regular season; 'WINNERS_BRACKET' for the real playoff.
  // Consolation tiers are filtered out before this is populated.
  playoff_tier: string | undefined
  winner: 'HOME' | 'AWAY' | 'TIE' | null   // null = undecided / not yet played
}

export function flattenSchedule(lg: EspnLeague): EspnFlatMatchup[] {
  const out: EspnFlatMatchup[] = []
  for (const item of lg.schedule ?? []) {
    if (!item.home || !item.away) continue   // ESPN occasionally has BYE rows on odd team counts
    // Skip ESPN's consolation/losers/placement ladders. These are exhibition
    // games for non-contending teams and pollute the matchup count — for an
    // 8-season league they can add 200+ rows that nobody cares about.
    if (isConsolationTier(item.playoffTierType)) continue
    const a = item.home, b = item.away
    const aScore = typeof a.totalPoints === 'number' ? a.totalPoints : null
    const bScore = typeof b.totalPoints === 'number' ? b.totalPoints : null
    out.push({
      week: item.matchupPeriodId,
      a_team_id: a.teamId,
      a_score: aScore,
      b_team_id: b.teamId,
      b_score: bScore,
      is_playoff: !isRegularSeasonMatchup(item),
      playoff_tier: item.playoffTierType,
      winner: item.winner && item.winner !== 'UNDECIDED' ? item.winner : null,
    })
  }
  return out
}

// Derive champion + runner-up. Primary source is `rankCalculatedFinal` (1 =
// champion, 2 = runner-up). For old leagues + history-endpoint responses
// that omit it, fall back to scanning the schedule for the final
// WINNERS_BRACKET game and using its winner/loser as champ/runner-up. Both
// fall back further to playoffSeed if the schedule is empty too.
export function deriveChampions(lg: EspnLeague): {
  championTeamId: number | null
  runnerUpTeamId: number | null
} {
  const teams = lg.teams ?? []

  // Primary: explicit final ranks from ESPN.
  const ranked = teams.filter((t) => typeof t.rankCalculatedFinal === 'number')
  if (ranked.length >= 2) {
    const first = ranked.find((t) => t.rankCalculatedFinal === 1) ?? null
    const second = ranked.find((t) => t.rankCalculatedFinal === 2) ?? null
    if (first?.id != null && second?.id != null) {
      return { championTeamId: first.id, runnerUpTeamId: second.id }
    }
  }

  // Fallback A: find the last WINNERS_BRACKET game in the schedule. That's
  // the championship; winner = champion, loser = runner-up. Works for old
  // seasons where ESPN didn't populate rankCalculatedFinal.
  const winnersGames = (lg.schedule ?? []).filter(
    (s) => s.playoffTierType === 'WINNERS_BRACKET' && s.home && s.away
  )
  if (winnersGames.length > 0) {
    const lastWeek = Math.max(...winnersGames.map((s) => s.matchupPeriodId))
    const finals = winnersGames.filter((s) => s.matchupPeriodId === lastWeek)
    // The championship is the game between the two highest-finishing teams.
    // Take the one whose winner was decided (skip UNDECIDED if multiple).
    const decided = finals.find((s) => s.winner === 'HOME' || s.winner === 'AWAY')
    if (decided?.home && decided.away) {
      const championTeamId = decided.winner === 'HOME' ? decided.home.teamId : decided.away.teamId
      const runnerUpTeamId = decided.winner === 'HOME' ? decided.away.teamId : decided.home.teamId
      return { championTeamId, runnerUpTeamId }
    }
  }

  // Fallback B: playoffSeed (regular-season seeding, not final standing, but
  // better than nothing for mid-season or incomplete data).
  const seeded = teams.filter((t) => typeof t.playoffSeed === 'number')
  if (seeded.length >= 2) {
    const first = seeded.find((t) => t.playoffSeed === 1) ?? null
    const second = seeded.find((t) => t.playoffSeed === 2) ?? null
    return { championTeamId: first?.id ?? null, runnerUpTeamId: second?.id ?? null }
  }

  return { championTeamId: null, runnerUpTeamId: null }
}

// Concurrency helper (mirrors sleeper/nfl).
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function run() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await worker(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}
