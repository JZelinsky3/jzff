// GET /api/yahoo/authorize
// Kicks off the Yahoo OAuth 2.0 flow. Generates a random `state` value, sets
// it as an HttpOnly cookie (CSRF protection), and 302s the user to Yahoo's
// hosted login. After the user grants access, Yahoo redirects back to
// /api/yahoo/callback with ?code=... and the same state.

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAuthUrl } from '@/lib/platforms/yahoo'

export const dynamic = 'force-dynamic'

const STATE_COOKIE = 'yahoo_oauth_state'
const RETURN_COOKIE = 'yahoo_oauth_return'
const STATE_TTL_SECONDS = 600 // 10 minutes — plenty for the login round-trip

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login?next=/dashboard', req.url))
  }

  const url = new URL(req.url)
  const origin = req.headers.get('origin') ?? url.origin
  const state = crypto.randomUUID()

  // Optional return target — same-origin path only. Lets sub-pages (e.g.
  // the league sources page) keep the user on their flow after the OAuth
  // round-trip instead of bouncing back to /dashboard.
  const rawReturn = url.searchParams.get('from') || ''
  const safeReturn = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : ''

  const jar = await cookies()
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  })
  if (safeReturn) {
    jar.set(RETURN_COOKIE, safeReturn, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: STATE_TTL_SECONDS,
    })
  } else {
    jar.delete(RETURN_COOKIE)
  }

  return NextResponse.redirect(buildAuthUrl({ origin, state }))
}
