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
const RETURN_COOKIE = 'yahoo_oauth_return'

// Same-origin path only — anything else gets ignored. Prevents an attacker
// from setting the cookie to a phishing URL via a crafted authorize link.
function safeReturnPath(p: string | undefined): string | null {
  if (!p) return null
  if (!p.startsWith('/') || p.startsWith('//')) return null
  return p
}

function redirectWithStatus(req: Request, returnPath: string | null, status: string) {
  const target = returnPath ?? '/dashboard'
  const sep = target.includes('?') ? '&' : '?'
  return NextResponse.redirect(new URL(`${target}${sep}yahoo=${encodeURIComponent(status)}`, req.url))
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const yahooError = url.searchParams.get('error')

  const jar = await cookies()
  const returnPath = safeReturnPath(jar.get(RETURN_COOKIE)?.value)
  jar.delete(RETURN_COOKIE)

  // Yahoo bounces back with ?error=access_denied if the user declines.
  if (yahooError) {
    return redirectWithStatus(req, returnPath, yahooError)
  }

  const expectedState = jar.get(STATE_COOKIE)?.value
  jar.delete(STATE_COOKIE)

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithStatus(req, returnPath, 'state_mismatch')
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
    return redirectWithStatus(req, returnPath, 'token_exchange_failed')
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
    return redirectWithStatus(req, returnPath, 'save_failed')
  }

  return redirectWithStatus(req, returnPath, 'connected')
}
