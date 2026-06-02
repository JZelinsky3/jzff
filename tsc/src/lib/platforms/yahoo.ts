// Yahoo Fantasy OAuth 2.0 helpers. The Fantasy API requires per-user auth, so
// each commissioner has to grant access via Yahoo's hosted login. Tokens land
// in the yahoo_tokens table (migration 0021); access_token expires in 1h, the
// refresh_token is long-lived. Refresh is transparent.
//
// Yahoo endpoints:
//   Authorize:  https://api.login.yahoo.com/oauth2/request_auth
//   Token:      https://api.login.yahoo.com/oauth2/get_token
//   Fantasy v2: https://fantasysports.yahooapis.com/fantasy/v2/...

const AUTH_URL  = 'https://api.login.yahoo.com/oauth2/request_auth'
const TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token'

export type YahooTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  xoauth_yahoo_guid?: string
}

export function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.YAHOO_CLIENT_ID
  const clientSecret = process.env.YAHOO_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET must be set.')
  }
  return { clientId, clientSecret }
}

// The redirect URI must match exactly what's configured in the Yahoo app.
// We accept the request origin so the same code works in dev (localhost) and
// prod (jzff.online) — both URIs must be registered on the Yahoo side.
export function redirectUriFor(origin: string): string {
  return `${origin}/api/yahoo/callback`
}

export function buildAuthUrl({ origin, state }: { origin: string; state: string }): string {
  const { clientId } = getCredentials()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUriFor(origin),
    response_type: 'code',
    state,
    language: 'en-us',
  })
  return `${AUTH_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens({
  code,
  origin,
}: {
  code: string
  origin: string
}): Promise<YahooTokenResponse> {
  const { clientId, clientSecret } = getCredentials()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    redirect_uri: redirectUriFor(origin),
    code,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Yahoo token exchange failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return (await res.json()) as YahooTokenResponse
}

const FANTASY_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2'

// Resolves a usable access token for `userId`, refreshing it transparently if
// it's within 60s of expiry. Persists the new token back to yahoo_tokens.
// Pass a Supabase client that has the user's session (RLS-friendly) OR the
// service-role client when running outside a request context.
export async function getValidAccessToken(
  userId: string,
  db: { from: (t: string) => unknown }
): Promise<string> {
  type Row = { access_token: string; refresh_token: string; expires_at: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db.from('yahoo_tokens') as any)
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()
  const tok = row?.data as Row | null
  if (!tok) throw new Error('Yahoo not connected for this user.')

  const expiresMs = new Date(tok.expires_at).getTime()
  const skew = 60_000
  if (Date.now() < expiresMs - skew) return tok.access_token

  const refreshed = await refreshAccessToken(tok.refresh_token)
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from('yahoo_tokens') as any)
    .update({
      access_token: refreshed.access_token,
      // Yahoo sometimes rotates the refresh token; honor the new one if given.
      refresh_token: refreshed.refresh_token ?? tok.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  return refreshed.access_token
}

export async function yahooFetchJson<T = unknown>(
  accessToken: string,
  path: string
): Promise<T> {
  const url = `${FANTASY_BASE}${path}${path.includes('?') ? '&' : '?'}format=json`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Yahoo ${res.status} on ${path}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

// Normalized league shape returned to the UI.
export type YahooLeagueSummary = {
  league_key: string   // e.g. "461.l.123456" — used as external_id
  league_id: string    // numeric portion only
  game_key: string     // e.g. "461" — the NFL season key
  name: string
  season: string       // year as string (Yahoo's native format)
  num_teams: number
  url?: string
  logo_url?: string
}

// Yahoo's JSON is shaped like XML serialized through a JSON converter. Objects
// alternate between numbered-key maps (".0", ".1", ".count") and arrays of
// fragment objects. These helpers tolerate both.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenFragments(frags: any): Record<string, unknown> {
  // Yahoo returns league/game/team objects as arrays of small fragment objects,
  // each containing one or two keys. Flatten into a single object.
  if (!Array.isArray(frags)) return (frags ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const f of frags) {
    if (f && typeof f === 'object') Object.assign(out, f)
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function numberedToArray(node: any): unknown[] {
  // Walks a {"0": ..., "1": ..., "count": N} map and returns ordered values.
  if (!node || typeof node !== 'object') return []
  const out: unknown[] = []
  for (const k of Object.keys(node)) {
    if (k === 'count') continue
    if (/^\d+$/.test(k)) out.push(node[k])
  }
  return out
}

// GET users;use_login=1/games;game_codes=nfl;seasons=Y1,Y2,.../leagues
// Returns a flat array of every NFL league the authenticated user has been in,
// across the requested seasons.
export async function listUserNflLeagues(
  accessToken: string,
  opts?: { sinceSeason?: number; throughSeason?: number }
): Promise<YahooLeagueSummary[]> {
  const through = opts?.throughSeason ?? new Date().getFullYear()
  const since = opts?.sinceSeason ?? 2010
  const seasons: number[] = []
  for (let y = since; y <= through; y++) seasons.push(y)

  const path = `/users;use_login=1/games;game_codes=nfl;seasons=${seasons.join(',')}/leagues`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await yahooFetchJson<any>(accessToken, path)

  const out: YahooLeagueSummary[] = []
  const userNode = raw?.fantasy_content?.users?.['0']?.user
  if (!userNode) return out
  const userObj = flattenFragments(userNode)
  const games = (userObj.games as Record<string, unknown>) ?? {}
  for (const gameNode of numberedToArray(games)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gameArr = (gameNode as any)?.game
    if (!gameArr) continue
    const gameInfo = flattenFragments(gameArr)
    // Some game entries embed leagues; others don't (e.g. user never joined any).
    const leaguesNode = gameInfo.leagues as Record<string, unknown> | undefined
    if (!leaguesNode) continue
    for (const lgNode of numberedToArray(leaguesNode)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lgFrag = (lgNode as any)?.league
      if (!lgFrag) continue
      const lg = flattenFragments(lgFrag)
      const league_key = String(lg.league_key ?? '')
      if (!league_key) continue
      out.push({
        league_key,
        league_id: String(lg.league_id ?? ''),
        game_key: String(lg.game_code ? gameInfo.game_key ?? '' : lg.league_key).split('.')[0],
        name: String(lg.name ?? 'Untitled'),
        season: String(lg.season ?? gameInfo.season ?? ''),
        num_teams: Number(lg.num_teams ?? 0),
        url: typeof lg.url === 'string' ? lg.url : undefined,
        logo_url: typeof lg.logo_url === 'string' ? lg.logo_url : undefined,
      })
    }
  }
  // Sort newest season first, then by name.
  out.sort((a, b) => b.season.localeCompare(a.season) || a.name.localeCompare(b.name))
  return out
}

// Deduped league listing for the new-archive / add-source pickers. Same league
// across multiple seasons appears once, with the chain's HEAD league_key (the
// most recent season) returned so the ingest's renew-walk picks up the rest.
export type YahooLeaguePickerEntry = {
  league_key: string  // HEAD of the chain
  name: string
  num_teams: number
  logo_url?: string
  seasons: string[]   // sorted ascending; e.g. ["2019","2020","2021","2022"]
}

export async function listUserNflLeaguesDeduped(
  accessToken: string,
  opts?: { sinceSeason?: number; throughSeason?: number }
): Promise<YahooLeaguePickerEntry[]> {
  const flat = await listUserNflLeagues(accessToken, opts)
  if (flat.length === 0) return []

  // Resolve each league's `renew` so we can collapse chains. Yahoo's
  // /leagues collection doesn't include renew, so we hit /league/{key} once
  // per row. Per-user OAuth gives us enough budget for ~30 parallel calls.
  const metas = await Promise.all(
    flat.map(async (lg) => {
      try {
        const m = await getLeagueMeta(accessToken, lg.league_key)
        return { lg, renewKey: m ? renewToLeagueKey(m.renew) : null }
      } catch {
        return { lg, renewKey: null }
      }
    })
  )

  const byKey = new Map<string, { lg: YahooLeagueSummary; renewKey: string | null }>()
  for (const r of metas) byKey.set(r.lg.league_key, r)

  // Any key referenced as someone's renew target is an ancestor — not a head.
  const ancestors = new Set<string>()
  for (const r of metas) {
    if (r.renewKey) ancestors.add(r.renewKey)
  }

  const out: YahooLeaguePickerEntry[] = []
  for (const r of metas) {
    if (ancestors.has(r.lg.league_key)) continue
    // Walk back through known keys to collect every season in the chain.
    const seasons: string[] = []
    let cursor: { lg: YahooLeagueSummary; renewKey: string | null } | undefined = r
    const guard = new Set<string>()
    while (cursor && !guard.has(cursor.lg.league_key)) {
      guard.add(cursor.lg.league_key)
      if (cursor.lg.season) seasons.push(cursor.lg.season)
      cursor = cursor.renewKey ? byKey.get(cursor.renewKey) : undefined
    }
    out.push({
      league_key: r.lg.league_key,
      name: r.lg.name,
      num_teams: r.lg.num_teams,
      logo_url: r.lg.logo_url,
      seasons: seasons.sort(),
    })
  }

  // Newest-season-of-chain first.
  out.sort((a, b) =>
    (b.seasons.at(-1) ?? '').localeCompare(a.seasons.at(-1) ?? '') ||
    a.name.localeCompare(b.name)
  )
  return out
}

export type YahooLeagueDetail = YahooLeagueSummary & {
  num_divisions?: number
  division_names?: string[]
  playoff_start_week?: number
  num_playoff_teams?: number
}

// GET league/{league_key}/settings — used to populate the new-archive form
// with name + division setup + (eventually) playoff/scoring config.
export async function getLeagueDetail(
  accessToken: string,
  leagueKey: string
): Promise<YahooLeagueDetail | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await yahooFetchJson<any>(accessToken, `/league/${leagueKey}/settings`)
  const leagueArr = raw?.fantasy_content?.league
  if (!leagueArr) return null
  // /settings returns [leagueMetadata..., { settings: [...] }]
  const meta = flattenFragments(leagueArr.slice(0, -1))
  const settingsFrag = leagueArr[leagueArr.length - 1]
  const settings = flattenFragments(settingsFrag?.settings)

  const divisions = (settings.divisions as Record<string, unknown> | undefined) ?? undefined
  const divisionList = divisions ? numberedToArray(divisions) : []
  const divisionNames = divisionList
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => String(d?.division?.name ?? '').trim())
    .filter((n) => n.length > 0)

  return {
    league_key: String(meta.league_key ?? leagueKey),
    league_id: String(meta.league_id ?? ''),
    game_key: String(meta.league_key ?? leagueKey).split('.')[0],
    name: String(meta.name ?? 'Untitled'),
    season: String(meta.season ?? ''),
    num_teams: Number(meta.num_teams ?? 0),
    url: typeof meta.url === 'string' ? meta.url : undefined,
    logo_url: typeof meta.logo_url === 'string' ? meta.logo_url : undefined,
    num_divisions: divisionList.length || undefined,
    division_names: divisionNames.length > 0 ? divisionNames : undefined,
    playoff_start_week: settings.playoff_start_week != null ? Number(settings.playoff_start_week) : undefined,
    num_playoff_teams: settings.num_playoff_teams != null ? Number(settings.num_playoff_teams) : undefined,
  }
}

// ============================================================
// Ingest-time API helpers
// ============================================================
//
// Yahoo's `renew` field on a league points back to the prior season as
// "{prev_game_key}_{prev_league_id}". Convert to league_key form.
export function renewToLeagueKey(renew: string | undefined | null): string | null {
  if (!renew || typeof renew !== 'string') return null
  // Sometimes returns "x.l.y" already; sometimes "x_y".
  if (renew.includes('.l.')) return renew
  const [gk, lid] = renew.split('_')
  if (!gk || !lid) return null
  return `${gk}.l.${lid}`
}

export type YahooLeagueMeta = {
  league_key: string
  league_id: string
  game_key: string
  name: string
  season: string
  num_teams: number
  start_week: number
  end_week: number
  current_week?: number
  renew?: string | null      // raw value: e.g. "423_789012"
  renewed?: string | null
}

// GET /league/{key} — basic metadata including renew/renewed for history walking.
export async function getLeagueMeta(
  accessToken: string,
  leagueKey: string
): Promise<YahooLeagueMeta | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await yahooFetchJson<any>(accessToken, `/league/${leagueKey}`)
  const arr = raw?.fantasy_content?.league
  if (!arr) return null
  const m = flattenFragments(Array.isArray(arr) ? arr : [arr])
  return {
    league_key: String(m.league_key ?? leagueKey),
    league_id: String(m.league_id ?? ''),
    game_key: String(m.league_key ?? leagueKey).split('.')[0],
    name: String(m.name ?? ''),
    season: String(m.season ?? ''),
    num_teams: Number(m.num_teams ?? 0),
    start_week: Number(m.start_week ?? 1),
    end_week: Number(m.end_week ?? 17),
    current_week: m.current_week != null ? Number(m.current_week) : undefined,
    renew: typeof m.renew === 'string' && m.renew.length > 0 ? m.renew : null,
    renewed: typeof m.renewed === 'string' && m.renewed.length > 0 ? m.renewed : null,
  }
}

// Walks the renew chain back from `startLeagueKey` (oldest → newest in the
// returned array). Guards against cycles + 30-deep chains.
export async function walkLeagueChain(
  accessToken: string,
  startLeagueKey: string
): Promise<YahooLeagueMeta[]> {
  const chain: YahooLeagueMeta[] = []
  const seen = new Set<string>()
  let cursor: string | null = startLeagueKey
  let guard = 0
  while (cursor && guard < 30 && !seen.has(cursor)) {
    seen.add(cursor)
    const meta = await getLeagueMeta(accessToken, cursor)
    if (!meta) break
    chain.push(meta)
    cursor = renewToLeagueKey(meta.renew)
    guard++
  }
  return chain.reverse()
}

export type YahooManagerInfo = {
  guid: string
  nickname: string
  image_url?: string
  is_commish: boolean
}

export type YahooTeam = {
  team_key: string          // e.g. "461.l.123456.t.5"
  team_id: string           // "5"
  name: string
  url?: string
  logo_url?: string
  division_id?: string      // Yahoo stores this as a string
  managers: YahooManagerInfo[]
  wins: number
  losses: number
  ties: number
  points_for: number
  points_against: number
  rank?: number             // team_standings.rank — final rank if season's over, else regular-season rank
  playoff_seed?: number
}

// GET /league/{key}/standings — every team with team_standings inline.
// Yahoo's standings response includes the manager array per team, so this
// one call gives us teams + managers + records + ranks in one go.
//
// `diagOut`: optional sink for diagnostic messages. When the parser ends up
// with every team at 0-0 / 0 PF (the symptom of a structural mismatch we
// haven't accounted for) we push a one-line shape report so the caller can
// surface it as a warning instead of silently writing zeroes.
export async function getLeagueTeamsStandings(
  accessToken: string,
  leagueKey: string,
  diagOut?: string[]
): Promise<YahooTeam[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await yahooFetchJson<any>(accessToken, `/league/${leagueKey}/standings`)
  const leagueArr = raw?.fantasy_content?.league
  if (!leagueArr) {
    diagOut?.push(`standings(${leagueKey}): fantasy_content.league missing — top keys: ${Object.keys(raw?.fantasy_content ?? {}).join(',') || '(none)'}`)
    return []
  }
  // /standings shape: leagueArr = [ {...meta...}, { standings: [ { teams: { 0:{team:[...]}, 1:..., count } } ] } ]
  const standingsBlock = (leagueArr as unknown[]).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (x: any) => x && typeof x === 'object' && 'standings' in x
  )
  // standings can be either an array `[{teams: ...}]` or a bare object
  // `{teams: ...}` depending on Yahoo's response variant. Tolerate both.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const standingsNode = (standingsBlock as any)?.standings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamsNode = Array.isArray(standingsNode)
    ? (standingsNode[0] as any)?.teams
    : (standingsNode as any)?.teams
  if (!teamsNode) {
    diagOut?.push(`standings(${leagueKey}): teams node missing — standingsBlock keys: ${Object.keys((standingsBlock ?? {}) as object).join(',') || '(none)'}`)
    return []
  }

  const out: YahooTeam[] = []
  for (const tNode of numberedToArray(teamsNode)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamFrag = (tNode as any)?.team
    if (!teamFrag) continue
    // team is itself an array of fragments — flatten the META portion (the
    // first inner array) and the trailing team_standings + division/etc.
    // Yahoo wraps the team metadata in a nested array: team[0] is array of
    // fragments, the rest of team[] are subresources (team_standings, etc.)
    const metaFrags = Array.isArray(teamFrag[0]) ? teamFrag[0] : teamFrag
    const m = flattenFragments(metaFrags)
    // Subresources live in team[1..N]. Each part is usually `{ key: value }`
    // but Yahoo sometimes wraps it as a single-element array — unwrap that so
    // the lookup below ("subResources.team_standings") still works.
    const subResources: Record<string, unknown> = {}
    for (let i = 1; i < teamFrag.length; i++) {
      let part = teamFrag[i]
      if (Array.isArray(part)) part = part[0]
      if (part && typeof part === 'object' && !Array.isArray(part)) {
        Object.assign(subResources, part)
      }
    }
    // team_standings can live either as a separate subresource (team[1+]) OR
    // be inlined in the meta fragments depending on Yahoo's game version. Try
    // both before falling back to an empty object (which would zero out the
    // record + points-for/against and produce a team-name-only row).
    const team_standings = (
      subResources.team_standings ??
      m.team_standings ??
      {}
    ) as Record<string, unknown>
    const outcome = (team_standings.outcome_totals ?? {}) as Record<string, unknown>

    // Managers: Yahoo nests these as { managers: [ { manager: {...} }, ... ] } or
    // a numbered-key map. Tolerate both.
    const managers: YahooManagerInfo[] = []
    const mgrNode = m.managers
    if (Array.isArray(mgrNode)) {
      for (const mm of mgrNode) {
        const mgr = (mm as { manager?: Record<string, unknown> })?.manager
        if (!mgr) continue
        const guid = String(mgr.guid ?? '')
        if (!guid) continue
        managers.push({
          guid,
          nickname: String(mgr.nickname ?? '').trim() || guid,
          image_url: typeof mgr.image_url === 'string' ? mgr.image_url : undefined,
          is_commish: String(mgr.is_commish ?? '0') === '1',
        })
      }
    } else if (mgrNode && typeof mgrNode === 'object') {
      for (const mm of numberedToArray(mgrNode)) {
        const mgr = (mm as { manager?: Record<string, unknown> })?.manager
        if (!mgr) continue
        const guid = String(mgr.guid ?? '')
        if (!guid) continue
        managers.push({
          guid,
          nickname: String(mgr.nickname ?? '').trim() || guid,
          image_url: typeof mgr.image_url === 'string' ? mgr.image_url : undefined,
          is_commish: String(mgr.is_commish ?? '0') === '1',
        })
      }
    }

    const team_logos = m.team_logos as unknown
    let logo_url: string | undefined
    if (Array.isArray(team_logos) && team_logos.length > 0) {
      const tl = team_logos[0] as { team_logo?: { url?: string } }
      logo_url = tl?.team_logo?.url
    }

    out.push({
      team_key: String(m.team_key ?? ''),
      team_id: String(m.team_id ?? ''),
      name: String(m.name ?? '').trim(),
      url: typeof m.url === 'string' ? m.url : undefined,
      logo_url,
      division_id: m.division_id != null ? String(m.division_id) : undefined,
      managers,
      wins: Number(outcome.wins ?? 0),
      losses: Number(outcome.losses ?? 0),
      ties: Number(outcome.ties ?? 0),
      points_for: Number(team_standings.points_for ?? 0),
      points_against: Number(team_standings.points_against ?? 0),
      rank: team_standings.rank != null ? Number(team_standings.rank) : undefined,
      playoff_seed: team_standings.playoff_seed != null ? Number(team_standings.playoff_seed) : undefined,
    })
  }
  if (diagOut && out.length > 0) {
    const allZero = out.every((t) => t.wins === 0 && t.losses === 0 && t.points_for === 0)
    if (allZero) {
      // Re-derive a compact shape report so a future Yahoo response change
      // is debuggable from one warning line alone.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstTeamFrag = (numberedToArray(teamsNode)[0] as any)?.team
      const shape = Array.isArray(firstTeamFrag)
        ? `len=${firstTeamFrag.length}, [0]=${Array.isArray(firstTeamFrag[0]) ? 'array' : typeof firstTeamFrag[0]}`
        : typeof firstTeamFrag
      diagOut.push(
        `standings(${leagueKey}): all ${out.length} teams parsed with 0-0 record and 0 PF — team_standings structure not where the parser is looking. teamFrag shape: ${shape}`
      )
    }
  }
  return out
}

export type YahooScoreboardMatchup = {
  week: number
  is_playoffs: boolean
  is_consolation: boolean
  status: string            // "postevent" | "midevent" | "preevent"
  team_a_key: string
  team_b_key: string
  team_a_points: number | null
  team_b_points: number | null
  winner_team_key?: string  // present after game ends
}

// GET /league/{key}/scoreboard;week=N — returns matchups for that week.
// Yahoo accepts a comma-separated list (;week=1,2,3) for multi-week, but the
// shape gets even worse to parse; we fetch per-week for clarity.
export async function getLeagueScoreboard(
  accessToken: string,
  leagueKey: string,
  week: number,
  diagOut?: string[]
): Promise<YahooScoreboardMatchup[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await yahooFetchJson<any>(accessToken, `/league/${leagueKey}/scoreboard;week=${week}`)
  const leagueArr = raw?.fantasy_content?.league
  if (!leagueArr) return []
  const sbBlock = (leagueArr as unknown[]).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (x: any) => x && typeof x === 'object' && 'scoreboard' in x
  )
  // scoreboard can be `{matchups: ...}` (modern), `{'0': {matchups: ...}}`
  // (older numbered-map wrapper), or even an array `[{matchups: ...}]`.
  // Walk all three so a shape change in one season doesn't zero matchups.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbNode = (sbBlock as any)?.scoreboard
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let matchupsNode: any =
    sbNode?.matchups ??
    sbNode?.['0']?.matchups ??
    (Array.isArray(sbNode) ? sbNode[0]?.matchups : undefined)
  if (!matchupsNode) {
    if (diagOut && week === 1) {
      const sbKeys = sbNode && typeof sbNode === 'object' ? Object.keys(sbNode).join(',') : typeof sbNode
      diagOut.push(`scoreboard(${leagueKey}, w${week}): matchups missing — scoreboard keys: [${sbKeys || '(empty)'}]`)
    }
    return []
  }

  const out: YahooScoreboardMatchup[] = []
  let missingTeamsNodeLogged = false
  for (const mNode of numberedToArray(matchupsNode)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchupFrag = (mNode as any)?.matchup
    if (!matchupFrag) continue
    // matchup is a flat object of metadata + a `teams` numbered map.
    // Newer responses wrap the matchup body as { '0': { matchups: { ... } } }
    // INSIDE each matchup frag — i.e. the teams collection lives at
    // matchupFrag['0'].teams rather than meta.teams. Handle both.
    const meta = flattenFragments(Array.isArray(matchupFrag) ? matchupFrag : [matchupFrag])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamsNode = (meta.teams ?? matchupFrag.teams ?? (matchupFrag as any)?.['0']?.teams) as Record<string, unknown> | undefined
    if (!teamsNode) {
      if (diagOut && !missingTeamsNodeLogged && week === 1) {
        missingTeamsNodeLogged = true
        const mfShape = Array.isArray(matchupFrag) ? `array(len=${matchupFrag.length})` : typeof matchupFrag
        const mfKeys = matchupFrag && typeof matchupFrag === 'object'
          ? Object.keys(matchupFrag as object).join(',')
          : '(n/a)'
        diagOut.push(`scoreboard(${leagueKey}, w${week}): matchup is missing the teams node — matchupFrag=${mfShape} · matchupFrag_keys=[${mfKeys}] · meta_keys=[${Object.keys(meta).join(',')}]`)
      }
      continue
    }
    const teamList = numberedToArray(teamsNode)
    if (teamList.length !== 2) continue
    const [tA, tB] = teamList
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamA = flattenFragments((tA as any)?.team?.[0] ?? (tA as any)?.team ?? {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamB = flattenFragments((tB as any)?.team?.[0] ?? (tB as any)?.team ?? {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamAPoints = (tA as any)?.team?.[1]?.team_points?.total
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamBPoints = (tB as any)?.team?.[1]?.team_points?.total

    out.push({
      week,
      is_playoffs: String(meta.is_playoffs ?? '0') === '1',
      is_consolation: String(meta.is_consolation ?? '0') === '1',
      status: String(meta.status ?? ''),
      team_a_key: String(teamA.team_key ?? ''),
      team_b_key: String(teamB.team_key ?? ''),
      team_a_points: teamAPoints != null && teamAPoints !== '' ? Number(teamAPoints) : null,
      team_b_points: teamBPoints != null && teamBPoints !== '' ? Number(teamBPoints) : null,
      winner_team_key: typeof meta.winner_team_key === 'string' ? meta.winner_team_key : undefined,
    })
  }
  if (diagOut && week === 1 && out.length === 0) {
    diagOut.push(`scoreboard(${leagueKey}, w${week}): 0 matchups parsed — every matchup frag was missing the teams node. See the shape line above.`)
  }
  return out
}

export type YahooDraftPick = {
  pick: number
  round: number
  team_key: string
  player_key: string
  cost?: number  // auction only
}

// GET /league/{key}/draftresults
export async function getLeagueDraft(
  accessToken: string,
  leagueKey: string
): Promise<YahooDraftPick[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await yahooFetchJson<any>(accessToken, `/league/${leagueKey}/draftresults`)
  const leagueArr = raw?.fantasy_content?.league
  if (!leagueArr) return []
  const block = (leagueArr as unknown[]).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (x: any) => x && typeof x === 'object' && 'draft_results' in x
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drNode = (block as any)?.draft_results
  if (!drNode) return []
  const out: YahooDraftPick[] = []
  for (const node of numberedToArray(drNode)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dr = (node as any)?.draft_result
    if (!dr) continue
    out.push({
      pick: Number(dr.pick ?? 0),
      round: Number(dr.round ?? 0),
      team_key: String(dr.team_key ?? ''),
      player_key: String(dr.player_key ?? ''),
      cost: dr.cost != null ? Number(dr.cost) : undefined,
    })
  }
  return out
}

export type YahooPlayerInfo = {
  player_key: string
  full_name: string
  position?: string          // primary position
  editorial_team_abbr?: string  // NFL team
}

// GET /league/{key}/players;player_keys=k1,k2,...
// Yahoo caps at 25 player_keys per call; this helper batches.
export async function getPlayersBatch(
  accessToken: string,
  leagueKey: string,
  playerKeys: string[]
): Promise<Map<string, YahooPlayerInfo>> {
  const out = new Map<string, YahooPlayerInfo>()
  const chunkSize = 25
  for (let i = 0; i < playerKeys.length; i += chunkSize) {
    const chunk = playerKeys.slice(i, i + chunkSize).filter(Boolean)
    if (chunk.length === 0) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await yahooFetchJson<any>(
      accessToken,
      `/league/${leagueKey}/players;player_keys=${chunk.join(',')}`
    )
    const leagueArr = raw?.fantasy_content?.league
    if (!leagueArr) continue
    const block = (leagueArr as unknown[]).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (x: any) => x && typeof x === 'object' && 'players' in x
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playersNode = (block as any)?.players
    if (!playersNode) continue
    for (const pNode of numberedToArray(playersNode)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pFrag = (pNode as any)?.player
      if (!pFrag) continue
      const metaFrags = Array.isArray(pFrag[0]) ? pFrag[0] : pFrag
      const m = flattenFragments(metaFrags)
      const player_key = String(m.player_key ?? '')
      if (!player_key) continue
      // name is either { full, first, last, ascii_first, ascii_last } or a string.
      let full_name = ''
      const nameObj = m.name as Record<string, unknown> | string | undefined
      if (typeof nameObj === 'string') full_name = nameObj
      else if (nameObj && typeof nameObj === 'object') full_name = String(nameObj.full ?? '').trim()
      out.set(player_key, {
        player_key,
        full_name: full_name || player_key,
        position: m.primary_position != null ? String(m.primary_position) : undefined,
        editorial_team_abbr: m.editorial_team_abbr != null ? String(m.editorial_team_abbr) : undefined,
      })
    }
  }
  return out
}

// ─── Per-week roster snapshot ─────────────────────────────────────────────
//
// For the Best Coach Tracker we need each player's slot + per-week points.
// Yahoo's roster endpoint, when combined with the players/stats subresource
// and `type=week;week=N`, returns one frag per player with:
//   - meta: player_key, name.full, primary_position, editorial_team_abbr
//   - selected_position[].position — the slot the player filled (BN/IR/QB/...)
//   - player_points.total — the player's actual fantasy points that week
// Yahoo's response shapes vary across game years; we tolerate the common
// permutations the same way getLeagueScoreboard does.

export type YahooRosterPlayer = {
  player_key: string
  full_name: string
  position?: string         // primary position (QB/RB/...)
  nfl_team?: string
  slot: string              // selected position that week (QB/RB/BN/IR/...)
  points: number | null
  proj_points: number | null
}

export function yahooIsStarterSlot(slot: string): boolean {
  const s = slot.toUpperCase()
  return s !== 'BN' && s !== 'IR' && s !== 'IL' && s !== 'NA'
}

export async function getTeamRosterWeek(
  accessToken: string,
  teamKey: string,
  week: number,
  diagOut?: string[]
): Promise<YahooRosterPlayer[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await yahooFetchJson<any>(
    accessToken,
    `/team/${teamKey}/roster;week=${week}/players/stats;type=week;week=${week}`
  )
  const teamArr = raw?.fantasy_content?.team
  if (!teamArr) {
    diagOut?.push(`roster(${teamKey}, w${week}): fantasy_content.team missing`)
    return []
  }
  // team[0] is meta frags; team[1] holds the roster subresource.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rosterBlock = (teamArr as unknown[]).find(
    (x: any) => x && typeof x === 'object' && 'roster' in x
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rosterNode = (rosterBlock as any)?.roster
  // roster is usually an array — its first entry is coverage meta, the rest
  // numbered keys wrap a `players` collection. Search for the `players` node.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let playersNode: any = null
  if (Array.isArray(rosterNode)) {
    for (const r of rosterNode) {
      if (r && typeof r === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const direct = (r as any).players
        if (direct) { playersNode = direct; break }
        for (const v of Object.values(r as object)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (v && typeof v === 'object' && (v as any).players) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            playersNode = (v as any).players
            break
          }
        }
        if (playersNode) break
      }
    }
  } else if (rosterNode && typeof rosterNode === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    playersNode = (rosterNode as any).players ?? (rosterNode as any)['0']?.players
  }
  if (!playersNode) {
    diagOut?.push(`roster(${teamKey}, w${week}): players node missing`)
    return []
  }

  const out: YahooRosterPlayer[] = []
  for (const pNode of numberedToArray(playersNode)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pFrag = (pNode as any)?.player
    if (!pFrag || !Array.isArray(pFrag)) continue
    const metaFrags = Array.isArray(pFrag[0]) ? pFrag[0] : pFrag
    const m = flattenFragments(metaFrags)
    const player_key = String(m.player_key ?? '')
    if (!player_key) continue
    let full_name = ''
    const nameObj = m.name as Record<string, unknown> | string | undefined
    if (typeof nameObj === 'string') full_name = nameObj
    else if (nameObj && typeof nameObj === 'object') full_name = String(nameObj.full ?? '').trim()

    // Walk the trailing subresources for selected_position + player_points.
    let slot = 'BN'
    let points: number | null = null
    let proj_points: number | null = null
    for (let i = 1; i < pFrag.length; i++) {
      const part = pFrag[i]
      if (!part || typeof part !== 'object') continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj = part as any
      const sp = obj.selected_position
      if (sp) {
        const spFrags = Array.isArray(sp) ? sp : [sp]
        const sm = flattenFragments(spFrags)
        if (sm.position != null) slot = String(sm.position).toUpperCase()
      }
      const pp = obj.player_points
      if (pp) {
        const total = pp.total ?? pp?.['0']?.total
        if (total != null && total !== '') {
          const n = Number(total)
          if (!Number.isNaN(n)) points = n
        }
      }
      const ppproj = obj.player_projected_points
      if (ppproj) {
        const total = ppproj.total ?? ppproj?.['0']?.total
        if (total != null && total !== '') {
          const n = Number(total)
          if (!Number.isNaN(n)) proj_points = n
        }
      }
    }

    out.push({
      player_key,
      full_name: full_name || player_key,
      position: m.primary_position != null ? String(m.primary_position) : undefined,
      nfl_team: m.editorial_team_abbr != null ? String(m.editorial_team_abbr) : undefined,
      slot,
      points,
      proj_points,
    })
  }
  return out
}

export async function refreshAccessToken(refreshToken: string): Promise<YahooTokenResponse> {
  const { clientId, clientSecret } = getCredentials()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    // redirect_uri is required by Yahoo even for refresh; any registered URI works.
    redirect_uri: 'oob',
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Yahoo token refresh failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return (await res.json()) as YahooTokenResponse
}
