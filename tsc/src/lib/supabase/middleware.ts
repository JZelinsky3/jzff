import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Exact-match public paths (the parent landing/auth pages + standalone
// public sections). Trailing slashes are stripped by the normalization
// step below before comparison, so list them without trailing slash.
// /hub (the Clubhouse) is browsable signed-out — guests get a Login button
// in the masthead and a guest view of each wing; write APIs under /api/hub/
// (promote) enforce auth in their own handlers.
// /api/view is the mobile/desktop view toggle — signed-out visitors on the
// public landing must be able to flip to the desktop layout, so it can't be
// behind the auth gate.
const PUBLIC_PATHS = ['/', '/login', '/auth/callback', '/pricing', '/about', '/guides', '/demo', '/demo-m', '/old', '/hub', '/api/view', '/privacy', '/terms', '/gameday', '/new']
// /api/cron/ is reached by Vercel's cron infra (no Supabase session); the
// route handler itself enforces auth via the CRON_SECRET bearer header.
// /api/stripe/webhook is hit by Stripe; the handler verifies the request
// using STRIPE_WEBHOOK_SECRET. Other /api/stripe/* routes (checkout, portal)
// still require an authenticated user and stay middleware-gated.
// `/data/` holds the shared static JSON used by every public almanac (e.g.
// `public/data/fantasy_ranks/<profile>/<year>.json`). It MUST be reachable
// without auth — visitors to /leagues/<slug>/draft fetch from here, and the
// gate would otherwise 302 them to /login and break the Steal/Bust panels
// for anyone not signed in.
// `/api/og/` serves Open Graph card images for shareable almanac pages
// (e.g. rivalry detail). They MUST be reachable without auth — Twitter,
// Facebook, iMessage, Discord etc. crawl them with no session cookies.
// `/api/leagues/` covers GET-public reads used by the public almanac pages
// (Trade Desk Settings drawer for non-commish viewers, Analyzer roster
// loader, etc.). Write routes inside this prefix (sync, grade-trades,
// trades-theme, trade-desk/settings POST, ...) still enforce owner/editor
// auth inside their own handlers — bypassing the middleware redirect just
// keeps an unauthenticated GET from being bounced to /login as HTML.
// `/api/mock-board` is the Mock Room's player board (league-agnostic
// redraft values) — the almanac page fetching it is public.
// `/api/support` is the Support widget's inbox — league members browsing a
// public almanac are usually signed out and must still be able to send a
// note. The handler has its own honeypot + throttle.
const PUBLIC_PREFIXES = ['/leagues/', '/pams-template/', '/demo/', '/demo-m/', '/old/', '/data/', '/design/', '/guides/', '/about/', '/pricing/', '/api/cron/', '/api/og/', '/api/stripe/webhook', '/api/leagues/', '/api/mock-board', '/api/support', '/hub/', '/api/hub/']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Normalize: trailingSlash:true in next.config means most paths have a
  // trailing slash. Strip it (except for root) so PUBLIC_PATHS comparisons
  // like `/login` still match a request to `/login/`.
  const raw = request.nextUrl.pathname
  const path = raw.length > 1 ? raw.replace(/\/$/, '') : raw
  const isPublic =
    PUBLIC_PATHS.some((p) => path === p || path.startsWith('/auth/')) ||
    PUBLIC_PREFIXES.some((p) => path.startsWith(p))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  return response
}
