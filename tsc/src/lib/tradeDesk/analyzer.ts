// Trade Desk Analyzer — Phase 5 cross-platform data layer.
//
// Loads everything the Analyzer UI needs for one league regardless of host
// platform (Sleeper / ESPN / Yahoo / NFL.com): every team's roster, lean
// player metadata, and the merged effective settings.
//
// The output shape is identical across platforms — the consensus value
// engine, depth math, and the analyzer route all key on SLEEPER player ids,
// so each non-Sleeper loader translates platform-native player ids back to
// Sleeper ids via the cross-platform map (espn_id / yahoo_id / name-match
// for NFL.com). Players the map can't resolve are dropped with a warning
// count in the diagnostic surface.
//
// ESPN auth (private leagues): swid + espn_s2 live in
//   league_sources.settings JSONB
// Yahoo auth: yahoo_tokens row keyed on leagues.owner_id (refresh handled
// inside getValidAccessToken).
// NFL.com: no auth required for the leagues we've seen.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  sleeper,
  avatarUrl,
  type SleeperLeague,
  type SleeperRoster,
  type SleeperUser,
} from '@/lib/platforms/sleeper'
import {
  fetchTeams as espnFetchTeams,
  fetchWeekRoster as espnFetchWeekRoster,
  positionFromId as espnPositionFromId,
  type EspnAuth,
  type EspnLeague,
  type EspnTeam,
  type EspnMember,
} from '@/lib/platforms/espn'
import {
  fetchOwners as nflFetchOwners,
  fetchTeamWeekRoster as nflFetchTeamWeekRoster,
  probeLeague as nflProbeLeague,
  type NflOwner,
  type NflRosterPlayer,
} from '@/lib/platforms/nfl'
import {
  getValidAccessToken,
  getLeagueMeta as yahooGetLeagueMeta,
  getLeagueTeamsStandings as yahooGetLeagueTeamsStandings,
  getTeamRosterWeek as yahooGetTeamRosterWeek,
  type YahooTeam,
} from '@/lib/platforms/yahoo'
import { getPlayerIdMaps } from '@/lib/platforms/playerIdMap'
import { getPlayersMap, type LeanPlayer } from '@/lib/sleeperPlayers'
import { detectMode, type LeagueMode } from '@/lib/values'
import {
  parseSettings,
  mergeEffective,
  type AutoDetected,
  type EffectiveSettings,
} from './settings'
import { applyNameAliases, NAME_ALIASES } from '@/lib/values/nameAliases'

// ── Public types ─────────────────────────────────────────────────────────

export type AnalyzerPlayer = {
  id: string                  // Sleeper player_id (canonical across platforms)
  name: string
  position: string | null
  team: string | null
  injuryStatus: string | null
  // Optional consensus value, attached by the rosters API after running
  // valuateLeague() once. The loader itself doesn't compute this so it
  // stays cheap to call from places that don't need values.
  value?: number
}

export type AnalyzerRoster = {
  ownerId: string             // Platform-canonical owner identifier (Sleeper user_id, ESPN swid, Yahoo guid, NFL owner_external_id)
  rosterId: number
  ownerName: string
  teamName: string | null
  avatarUrl: string | null
  playerIds: string[]         // Sleeper ids (translated when source was non-Sleeper)
}

export type AnalyzerLeagueData = {
  leagueId: string
  liveLeagueId: string
  leagueName: string
  leagueSlug: string
  season: string
  // Auto-detected platform context (pre-override)
  detected: {
    mode: LeagueMode
    qbStarters: number
    teamCount: number
  }
  effective: EffectiveSettings
  rosters: AnalyzerRoster[]
  players: Record<string, AnalyzerPlayer>
  // Non-Sleeper platforms can have players whose ids didn't translate to
  // Sleeper. Surface the count so the UI can warn ("3 of 162 players
  // couldn't be matched; values may be incomplete"). Sleeper leagues always
  // have 0 here.
  unresolvedPlayerCount?: number
}

export type AnalyzerLoadError =
  | { kind: 'not-found' }
  | { kind: 'unsupported-platform'; platform: string }
  | { kind: 'no-live-id' }
  | { kind: 'sleeper-failed'; message: string }
  | { kind: 'espn-failed'; message: string }
  | { kind: 'nfl-failed'; message: string }
  | { kind: 'yahoo-failed'; message: string }
  | { kind: 'yahoo-not-connected' }   // owner has no yahoo_tokens row

type LoadOk = { ok: true; data: AnalyzerLeagueData }
type LoadErr = { ok: false; error: AnalyzerLoadError }
type LoadResult = LoadOk | LoadErr

// ── Shared helpers ───────────────────────────────────────────────────────

function nameKey(name: string, position?: string | null): string {
  const stripped = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'`’]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return `${stripped}|${(position ?? '').toUpperCase()}`
}

function buildSleeperNameLookup(playersDict: Record<string, LeanPlayer>): Map<string, string> {
  const out = new Map<string, string>()
  for (const [pid, p] of Object.entries(playersDict)) {
    if (!p.name) continue
    const key = nameKey(p.name, p.position ?? '')
    if (!out.has(key)) out.set(key, pid)
  }
  // Apply the same nickname/canonical aliases the value sources use so
  // NFL.com's name-matched roster picks up Hollywood/Chig/etc.
  applyNameAliases(out, nameKey)
  void NAME_ALIASES
  return out
}

function shapeAnalyzerPlayers(
  sleeperIds: Iterable<string>,
  playersDict: Record<string, LeanPlayer>,
): Record<string, AnalyzerPlayer> {
  const out: Record<string, AnalyzerPlayer> = {}
  for (const id of sleeperIds) {
    if (out[id]) continue
    const p = playersDict[id]
    if (!p) {
      out[id] = { id, name: `#${id}`, position: null, team: null, injuryStatus: null }
      continue
    }
    out[id] = {
      id,
      name: p.name,
      position: p.position,
      team: p.team,
      injuryStatus: p.injuryStatus,
    }
  }
  return out
}

// Common header + per-platform settings/season lookup. Loads the league row,
// resolves the season (current or year-pinned), and returns the platform's
// per-season external id along with shared metadata. Callers dispatch on
// the returned `platform` to invoke the correct loader.
type LeagueHeader = {
  leagueId: string
  leagueName: string
  leagueSlug: string
  ownerId: string
  platform: string
  tradeDeskSettings: unknown
  liveLeagueId: string
  seasonYear: number
}

async function loadLeagueHeader(
  leagueIdOrSlug: string,
  opts: { lookupBy: 'id' | 'slug'; year?: number },
): Promise<{ ok: true; data: LeagueHeader } | { ok: false; error: AnalyzerLoadError }> {
  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, name, slug, platform, owner_id, external_id, trade_desk_settings')
    .eq(opts.lookupBy, leagueIdOrSlug)
    .maybeSingle<{
      id: string
      name: string
      slug: string
      platform: string
      owner_id: string
      external_id: string
      trade_desk_settings: unknown
    }>()
  if (!league) return { ok: false, error: { kind: 'not-found' } }

  // Pull all season rows so we can prefer the one that matches the league's
  // live platform. A league that migrated platforms mid-history has multiple
  // sources contributing — e.g. NFL.com 2017–2024 then Sleeper 2025+ —
  // which means the same year can have two rows with differently-shaped
  // external_ids. Picking "most recent year, any row" would dispatch to
  // whichever loader the database happened to return first; we want the
  // live platform's row whenever it's available.
  const { data: allSeasons } = await db
    .from('seasons')
    .select('year, external_id')
    .eq('league_id', league.id)
    .order('year', { ascending: false })

  // External_id shape tells us the source platform:
  //   NFL.com → 4-digit year ("2025") — no per-season id, just the year
  //   Sleeper → 18–19 digit numeric league id
  //   Yahoo   → "461.l.123456"
  //   ESPN    → small numeric league id (1–10 digits)
  // The only one that collides with a year is NFL.com.
  const isNflShaped = (extId: string | null) =>
    !!extId && /^\d{4}$/.test(extId)

  type SeasonRow = { year: number; external_id: string | null }
  const rows: SeasonRow[] = (allSeasons ?? []) as SeasonRow[]

  let pickedRow: SeasonRow | undefined
  if (opts.year) {
    // Year pinned — match the league's live platform when both rows for that
    // year exist, otherwise take whichever row we have.
    const yearRows = rows.filter((r) => r.year === opts.year)
    pickedRow = league.platform === 'nfl'
      ? yearRows.find((r) => isNflShaped(r.external_id)) ?? yearRows[0]
      : yearRows.find((r) => !isNflShaped(r.external_id)) ?? yearRows[0]
  } else {
    // No year — prefer the most recent row matching the live platform, then
    // fall back to the most recent row of any platform.
    pickedRow = league.platform === 'nfl'
      ? rows.find((r) => isNflShaped(r.external_id)) ?? rows[0]
      : rows.find((r) => !isNflShaped(r.external_id)) ?? rows[0]
  }

  const liveLeagueId = pickedRow?.external_id ?? undefined
  const seasonYear = pickedRow?.year
  if (!liveLeagueId || !seasonYear) return { ok: false, error: { kind: 'no-live-id' } }

  // NFL.com ingests store the season YEAR in seasons.external_id (NFL.com
  // identifies a season by league+year — there is no per-season id). The
  // real league id lives on the league's nfl league_sources row, so swap
  // it in and dispatch to the NFL loader. Keying off the row shape (not
  // leagues.platform) also covers leagues that migrated platforms
  // mid-history: a now-Sleeper league's 2025 NFL.com season still loads.
  // Legacy NFL leagues created before the multi-source schema have no
  // league_sources row; fall back to leagues.external_id, which holds the
  // NFL.com league id for those.
  let platform = league.platform
  let resolvedLeagueId = liveLeagueId
  if (/^\d{4}$/.test(liveLeagueId) && Number(liveLeagueId) === seasonYear) {
    const { data: src } = await db
      .from('league_sources')
      .select('external_id')
      .eq('league_id', league.id)
      .eq('platform', 'nfl')
      .maybeSingle<{ external_id: string }>()
    const nflLeagueId = src?.external_id
      ?? (league.platform === 'nfl' && !/^\d{4}$/.test(league.external_id)
          ? league.external_id
          : undefined)
    if (nflLeagueId) {
      platform = 'nfl'
      resolvedLeagueId = nflLeagueId
    } else if (league.platform === 'nfl') {
      // Last-ditch: platform says nfl but every lookup gave us a year-shaped
      // id. Refuse rather than hitting NFL.com with "/league/2025/..." which
      // bounces straight to the homepage and confuses the caller with a
      // "no owners returned" downstream parse.
      return { ok: false, error: { kind: 'nfl-failed', message: `league ${league.id} has no NFL.com league id stored (leagues.external_id=${league.external_id}, no nfl league_sources row)` } }
    }
  }

  return {
    ok: true,
    data: {
      leagueId: league.id,
      leagueName: league.name,
      leagueSlug: league.slug,
      ownerId: league.owner_id,
      platform,
      tradeDeskSettings: league.trade_desk_settings,
      liveLeagueId: resolvedLeagueId,
      seasonYear,
    },
  }
}

// ── Sleeper loader (existing path, refactored) ───────────────────────────

function countSleeperQbStarters(league: SleeperLeague): number {
  const slots = league.roster_positions ?? []
  let qb = 0
  for (const s of slots) {
    if (s === 'QB') qb += 1
    if (s === 'SUPER_FLEX') qb += 1
  }
  return qb || 1
}

function sleeperRosterPlayerIds(r: SleeperRoster): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const arr of [r.players, r.starters, r.reserve, r.taxi]) {
    for (const id of arr ?? []) {
      if (!id || id === '0') continue
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

async function loadSleeper(header: LeagueHeader): Promise<LoadResult> {
  let sleeperLeague: SleeperLeague | null = null
  let users: SleeperUser[] | null = null
  let rosters: SleeperRoster[] | null = null
  try {
    ;[sleeperLeague, users, rosters] = await Promise.all([
      sleeper.league(header.liveLeagueId),
      sleeper.users(header.liveLeagueId),
      sleeper.rosters(header.liveLeagueId),
    ])
  } catch (e) {
    return { ok: false, error: { kind: 'sleeper-failed', message: e instanceof Error ? e.message : String(e) } }
  }
  if (!sleeperLeague || !users || !rosters) {
    return { ok: false, error: { kind: 'sleeper-failed', message: 'partial Sleeper response' } }
  }

  const usersByOwnerId = new Map<string, SleeperUser>()
  for (const u of users) usersByOwnerId.set(u.user_id, u)

  const analyzerRosters: AnalyzerRoster[] = rosters
    .filter((r) => r.owner_id != null)
    .map((r) => {
      const u = usersByOwnerId.get(r.owner_id!)
      const ownerName = u?.display_name ?? 'Unknown'
      const teamName = u?.metadata?.team_name?.trim() || null
      return {
        ownerId: r.owner_id!,
        rosterId: r.roster_id,
        ownerName,
        teamName: teamName ?? ownerName,
        avatarUrl: u ? avatarUrl(u) : null,
        playerIds: sleeperRosterPlayerIds(r),
      }
    })
    .sort((a, b) => (a.teamName ?? '').localeCompare(b.teamName ?? ''))

  const playersMap = await getPlayersMap()
  const ids = new Set<string>()
  for (const r of analyzerRosters) for (const id of r.playerIds) ids.add(id)
  const players = shapeAnalyzerPlayers(ids, playersMap)

  const overrides = parseSettings(header.tradeDeskSettings)
  const detected: AutoDetected = {
    mode: detectMode({
      type: typeof sleeperLeague.settings.type === 'number' ? sleeperLeague.settings.type : null,
      taxiSlots: typeof sleeperLeague.settings.taxi_slots === 'number' ? sleeperLeague.settings.taxi_slots : null,
    }),
    lineupType: countSleeperQbStarters(sleeperLeague) >= 2 ? 'SUPERFLEX' : '1QB',
    teamCount: sleeperLeague.total_rosters,
    qbStarters: (countSleeperQbStarters(sleeperLeague) >= 2 ? 2 : 1) as 1 | 2,
  }
  const effective = mergeEffective(overrides, detected)

  return {
    ok: true,
    data: {
      leagueId: header.leagueId,
      liveLeagueId: header.liveLeagueId,
      leagueName: header.leagueName,
      leagueSlug: header.leagueSlug,
      season: sleeperLeague.season,
      detected: {
        mode: detected.mode ?? 'redraft',
        qbStarters: detected.qbStarters ?? 1,
        teamCount: detected.teamCount ?? 12,
      },
      effective,
      rosters: analyzerRosters,
      players,
      unresolvedPlayerCount: 0,
    },
  }
}

// ── ESPN loader ──────────────────────────────────────────────────────────

async function loadEspnAuth(leagueId: string, externalId: string): Promise<EspnAuth | undefined> {
  const db = createAdminClient()
  const { data: src } = await db
    .from('league_sources')
    .select('settings')
    .eq('league_id', leagueId)
    .eq('platform', 'espn')
    .eq('external_id', externalId)
    .maybeSingle<{ settings: { swid?: string | null; espn_s2?: string | null } | null }>()
  const s = src?.settings
  if (!s?.swid || !s?.espn_s2) return undefined
  return { swid: s.swid, espnS2: s.espn_s2 }
}

function espnTeamDisplay(t: EspnTeam, members: EspnMember[]): { teamName: string; ownerName: string; ownerId: string; avatar: string | null } {
  const teamName = (t.name?.trim() || [t.location?.trim(), t.nickname?.trim()].filter(Boolean).join(' ').trim() || `Team ${t.id}`).trim()
  const ownerSwid = (t.owners && t.owners[0]) ?? ''
  const member = members.find((m) => m.id === ownerSwid)
  const ownerName = member
    ? [member.firstName, member.lastName].filter(Boolean).join(' ').trim() || member.displayName?.trim() || teamName
    : teamName
  return { teamName, ownerName, ownerId: ownerSwid || `team:${t.id}`, avatar: t.logo ?? null }
}

async function loadEspn(header: LeagueHeader): Promise<LoadResult> {
  const auth = await loadEspnAuth(header.leagueId, header.liveLeagueId)
  let league: EspnLeague
  let weekPayload: Awaited<ReturnType<typeof espnFetchWeekRoster>>
  try {
    // mTeam + mStatus + mSettings gets us teams + members + current week + roster slot config in one round-trip.
    // fetchTeams only requests mTeam, so we keep our own fetch logic but reuse the platform module's payload type.
    league = await espnFetchTeams(header.liveLeagueId, header.seasonYear, auth)
    // ESPN's `latestScoringPeriod` is the most recent week with results;
    // `currentMatchupPeriod` is the bracket period. We want the latest week
    // with actual roster data — fall back through both, then to W17 for
    // archived seasons.
    const week =
      league.status?.latestScoringPeriod ??
      league.status?.currentMatchupPeriod ??
      17
    weekPayload = await espnFetchWeekRoster(header.liveLeagueId, header.seasonYear, week, auth)
  } catch (e) {
    return { ok: false, error: { kind: 'espn-failed', message: e instanceof Error ? e.message : String(e) } }
  }

  const teams = league.teams ?? []
  const members = league.members ?? []

  // Translate ESPN player ids → Sleeper ids per team.
  //
  // Sleeper's espn_id field is null for many recent stars (Bijan, Chase,
  // Gibbs, etc — verified 2026-06). When ID lookup fails, fall back to
  // name+position matching against the Sleeper player dict — same approach
  // KTC/DP/FP use. ESPN's roster entry carries the player's name and
  // defaultPositionId so we can do this without a second API call.
  const maps = await getPlayerIdMaps()
  const playersMap = await getPlayersMap()
  const nameLookup = buildSleeperNameLookup(playersMap)
  let unresolved = 0

  const analyzerRosters: AnalyzerRoster[] = teams.map((t) => {
    const display = espnTeamDisplay(t, members)
    const wkTeam = (weekPayload.teams ?? []).find((wt) => wt.id === t.id)
    const playerIds: string[] = []
    const seen = new Set<string>()
    for (const entry of wkTeam?.roster?.entries ?? []) {
      const player = entry.playerPoolEntry?.player
      const espnPid = entry.playerId ?? player?.id
      let sid: string | undefined
      if (espnPid != null) sid = maps.espnToSleeper.get(String(espnPid))
      if (!sid && player) {
        const fullName = player.fullName
          ?? [player.firstName, player.lastName].filter(Boolean).join(' ').trim()
        const pos = espnPositionFromId(player.defaultPositionId ?? null)
        if (fullName && pos) {
          sid = nameLookup.get(nameKey(fullName, pos))
        }
      }
      if (!sid) { unresolved += 1; continue }
      if (seen.has(sid)) continue
      seen.add(sid)
      playerIds.push(sid)
    }
    return {
      ownerId: display.ownerId,
      rosterId: t.id,
      ownerName: display.ownerName,
      teamName: display.teamName,
      avatarUrl: display.avatar,
      playerIds,
    }
  }).sort((a, b) => (a.teamName ?? '').localeCompare(b.teamName ?? ''))

  const ids = new Set<string>()
  for (const r of analyzerRosters) for (const id of r.playerIds) ids.add(id)
  const players = shapeAnalyzerPlayers(ids, playersMap)

  // Settings — ESPN's `mSettings` view would give us roster slot counts; for
  // v1 we lean on commish overrides via trade_desk_settings + safe defaults.
  // detectMode is heuristic — ESPN doesn't have a Sleeper-style "type" flag.
  // We mark all ESPN leagues as redraft by default; dynasty/keeper is
  // commish-overridable in the Trade Desk settings.
  const overrides = parseSettings(header.tradeDeskSettings)
  const detected: AutoDetected = {
    mode: 'redraft',
    lineupType: '1QB',
    teamCount: teams.length || 12,
    qbStarters: 1,
  }
  const effective = mergeEffective(overrides, detected)

  return {
    ok: true,
    data: {
      leagueId: header.leagueId,
      liveLeagueId: header.liveLeagueId,
      leagueName: header.leagueName,
      leagueSlug: header.leagueSlug,
      season: String(league.seasonId),
      detected: {
        mode: detected.mode ?? 'redraft',
        qbStarters: detected.qbStarters ?? 1,
        teamCount: detected.teamCount ?? 12,
      },
      effective,
      rosters: analyzerRosters,
      players,
      unresolvedPlayerCount: unresolved,
    },
  }
}

// ── NFL.com loader ───────────────────────────────────────────────────────

async function loadNfl(header: LeagueHeader): Promise<LoadResult> {
  const ctx = `nfl league=${header.liveLeagueId} year=${header.seasonYear}`
  let probe: Awaited<ReturnType<typeof nflProbeLeague>>
  let owners: NflOwner[]
  try {
    probe = await nflProbeLeague(header.liveLeagueId, header.seasonYear)
    owners = await nflFetchOwners(header.liveLeagueId, header.seasonYear)
  } catch (e) {
    return { ok: false, error: { kind: 'nfl-failed', message: `${ctx}: ${e instanceof Error ? e.message : String(e)}` } }
  }
  if (!probe.ok) {
    return { ok: false, error: { kind: 'nfl-failed', message: `${ctx}: probe ${probe.error}` } }
  }

  // NFL.com probe doesn't surface a current week; default to W17 (the
  // post-regular-season snapshot is the most useful default for trade
  // analysis during the offseason / past-year browsing). Commish overrides
  // via trade_desk_settings can pin a different value later.
  const week = 17
  const teamCount = owners.length
  if (teamCount === 0) {
    return { ok: false, error: { kind: 'nfl-failed', message: `${ctx}: no owners returned (probe name="${probe.name}")` } }
  }

  // Roster fetches in parallel — gamecenter HTML is the bottleneck.
  const rosterResults = await Promise.all(
    owners.map(async (o) => {
      try {
        const r = await nflFetchTeamWeekRoster(header.liveLeagueId, header.seasonYear, Number(o.team_id), week)
        return { owner: o, roster: r, err: null as string | null }
      } catch (e) {
        return { owner: o, roster: [] as NflRosterPlayer[], err: e instanceof Error ? e.message : String(e) }
      }
    }),
  )

  // NFL.com player ids don't match GSIS — use name-match against Sleeper.
  const playersMap = await getPlayersMap()
  const lookup = buildSleeperNameLookup(playersMap)
  let unresolved = 0

  const analyzerRosters: AnalyzerRoster[] = rosterResults.map(({ owner, roster }) => {
    const seen = new Set<string>()
    const playerIds: string[] = []
    for (const p of roster) {
      if (!p.full_name || !p.position) { unresolved += 1; continue }
      const sid = lookup.get(nameKey(p.full_name, p.position))
      if (!sid) { unresolved += 1; continue }
      if (seen.has(sid)) continue
      seen.add(sid)
      playerIds.push(sid)
    }
    const ownerName = owner.owner_name?.trim() || owner.team_name?.trim() || `Team ${owner.team_id}`
    return {
      ownerId: owner.user_id || `team:${owner.team_id}`,
      rosterId: Number(owner.team_id),
      ownerName,
      teamName: owner.team_name?.trim() || ownerName,
      avatarUrl: owner.team_image_url ?? null,
      playerIds,
    }
  }).sort((a, b) => (a.teamName ?? '').localeCompare(b.teamName ?? ''))

  const ids = new Set<string>()
  for (const r of analyzerRosters) for (const id of r.playerIds) ids.add(id)
  const players = shapeAnalyzerPlayers(ids, playersMap)

  const overrides = parseSettings(header.tradeDeskSettings)
  const detected: AutoDetected = {
    mode: 'redraft',
    lineupType: '1QB',
    teamCount,
    qbStarters: 1,
  }
  const effective = mergeEffective(overrides, detected)

  return {
    ok: true,
    data: {
      leagueId: header.leagueId,
      liveLeagueId: header.liveLeagueId,
      leagueName: header.leagueName,
      leagueSlug: header.leagueSlug,
      season: String(header.seasonYear),
      detected: {
        mode: detected.mode ?? 'redraft',
        qbStarters: detected.qbStarters ?? 1,
        teamCount: detected.teamCount ?? 12,
      },
      effective,
      rosters: analyzerRosters,
      players,
      unresolvedPlayerCount: unresolved,
    },
  }
}

// ── Yahoo loader ─────────────────────────────────────────────────────────

// Extract the Yahoo numeric playerId from a player_key like "461.p.30977".
function yahooPlayerIdFromKey(playerKey: string): string | null {
  const idx = playerKey.lastIndexOf('.p.')
  if (idx === -1) return null
  return playerKey.slice(idx + 3) || null
}

async function loadYahoo(header: LeagueHeader): Promise<LoadResult> {
  const db = createAdminClient()
  let accessToken: string
  try {
    accessToken = await getValidAccessToken(header.ownerId, db)
  } catch {
    return { ok: false, error: { kind: 'yahoo-not-connected' } }
  }

  let meta: Awaited<ReturnType<typeof yahooGetLeagueMeta>>
  let teams: YahooTeam[]
  try {
    meta = await yahooGetLeagueMeta(accessToken, header.liveLeagueId)
    teams = await yahooGetLeagueTeamsStandings(accessToken, header.liveLeagueId)
  } catch (e) {
    return { ok: false, error: { kind: 'yahoo-failed', message: e instanceof Error ? e.message : String(e) } }
  }
  if (!meta) return { ok: false, error: { kind: 'yahoo-failed', message: 'league meta missing' } }
  if (teams.length === 0) return { ok: false, error: { kind: 'yahoo-failed', message: 'no teams returned' } }

  const week = meta.current_week ?? meta.end_week ?? 17

  const rosterResults = await Promise.all(
    teams.map(async (t) => {
      try {
        const r = await yahooGetTeamRosterWeek(accessToken, t.team_key, week)
        return { team: t, roster: r, err: null as string | null }
      } catch (e) {
        return { team: t, roster: [], err: e instanceof Error ? e.message : String(e) }
      }
    }),
  )

  // Sleeper's yahoo_id is null for many recent stars, same as espn_id.
  // Fall back to name+position matching against the Sleeper dict — Yahoo's
  // roster row carries full_name + position so we can do this without an
  // extra lookup.
  const maps = await getPlayerIdMaps()
  const playersMap = await getPlayersMap()
  const nameLookup = buildSleeperNameLookup(playersMap)
  let unresolved = 0

  const analyzerRosters: AnalyzerRoster[] = rosterResults.map(({ team, roster }) => {
    const seen = new Set<string>()
    const playerIds: string[] = []
    for (const p of roster) {
      let sid: string | undefined
      const ypid = yahooPlayerIdFromKey(p.player_key)
      if (ypid) sid = maps.yahooToSleeper.get(ypid)
      if (!sid && p.full_name && p.position) {
        sid = nameLookup.get(nameKey(p.full_name, p.position))
      }
      if (!sid) { unresolved += 1; continue }
      if (seen.has(sid)) continue
      seen.add(sid)
      playerIds.push(sid)
    }
    const ownerName = team.managers[0]?.nickname?.trim() || team.name.trim() || `Team ${team.team_id}`
    return {
      ownerId: team.managers[0]?.guid ?? `team:${team.team_id}`,
      rosterId: Number(team.team_id),
      ownerName,
      teamName: team.name.trim() || ownerName,
      avatarUrl: team.logo_url ?? team.managers[0]?.image_url ?? null,
      playerIds,
    }
  }).sort((a, b) => (a.teamName ?? '').localeCompare(b.teamName ?? ''))
  const ids = new Set<string>()
  for (const r of analyzerRosters) for (const id of r.playerIds) ids.add(id)
  const players = shapeAnalyzerPlayers(ids, playersMap)

  const overrides = parseSettings(header.tradeDeskSettings)
  const detected: AutoDetected = {
    mode: 'redraft',
    lineupType: '1QB',
    teamCount: meta.num_teams || teams.length || 12,
    qbStarters: 1,
  }
  const effective = mergeEffective(overrides, detected)

  return {
    ok: true,
    data: {
      leagueId: header.leagueId,
      liveLeagueId: header.liveLeagueId,
      leagueName: header.leagueName,
      leagueSlug: header.leagueSlug,
      season: meta.season,
      detected: {
        mode: detected.mode ?? 'redraft',
        qbStarters: detected.qbStarters ?? 1,
        teamCount: detected.teamCount ?? 12,
      },
      effective,
      rosters: analyzerRosters,
      players,
      unresolvedPlayerCount: unresolved,
    },
  }
}

// ── Main entry point ─────────────────────────────────────────────────────

export async function loadAnalyzerData(
  leagueIdOrSlug: string,
  opts?: { lookupBy?: 'id' | 'slug'; year?: number },
): Promise<LoadResult> {
  const lookupBy = opts?.lookupBy ?? 'id'
  const headerResult = await loadLeagueHeader(leagueIdOrSlug, { lookupBy, year: opts?.year })
  if (!headerResult.ok) return headerResult
  const header = headerResult.data

  switch (header.platform) {
    case 'sleeper': return loadSleeper(header)
    case 'espn':    return loadEspn(header)
    case 'nfl':     return loadNfl(header)
    case 'yahoo':   return loadYahoo(header)
    default:
      return { ok: false, error: { kind: 'unsupported-platform', platform: header.platform } }
  }
}
