// GET /api/yahoo/callback?code=...&state=...
// Yahoo redirects here after the user grants access. We verify the state
// cookie matches (CSRF), exchange the code for access + refresh tokens, and
// upsert them into yahoo_tokens keyed by the Supabase user. Then redirect
// to /dashboard with a status param.

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens } from '@/lib/platforms/yahoo'

export const dynamic = 'force-dynamic'

const STATE_COOKIE = 'yahoo_oauth_state'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const yahooError = url.searchParams.get('error')

  // Yahoo bounces back with ?error=access_denied if the user declines.
  if (yahooError) {
    return NextResponse.redirect(new URL(`/dashboard?yahoo=${encodeURIComponent(yahooError)}`, req.url))
  }

  const jar = await cookies()
  const expectedState = jar.get(STATE_COOKIE)?.value
  jar.delete(STATE_COOKIE)

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL('/dashboard?yahoo=state_mismatch', req.url))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login?next=/dashboard', req.url))
  }

  const origin = req.headers.get('origin') ?? url.origin
  let tokens
  try {
    tokens = await exchangeCodeForTokens({ code, origin })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'token_exchange_failed'
    console.error('[yahoo/callback]', msg)
    return NextResponse.redirect(new URL('/dashboard?yahoo=token_exchange_failed', req.url))
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const { error } = await supabase.from('yahoo_tokens').upsert({
    user_id: user.id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    yahoo_guid: tokens.xoauth_yahoo_guid ?? null,
    updated_at: new Date().toISOString(),
  })
  if (error) {
    console.error('[yahoo/callback] upsert', error)
    return NextResponse.redirect(new URL('/dashboard?yahoo=save_failed', req.url))
  }

  return NextResponse.redirect(new URL('/dashboard?yahoo=connected', req.url))
}
