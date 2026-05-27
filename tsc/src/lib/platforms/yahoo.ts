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
