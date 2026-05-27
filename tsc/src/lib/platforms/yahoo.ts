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
