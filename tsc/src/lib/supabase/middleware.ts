import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/', '/login', '/auth/callback', '/pricing']
// /api/cron/ is reached by Vercel's cron infra (no Supabase session); the
// route handler itself enforces auth via the CRON_SECRET bearer header.
// /api/stripe/webhook is hit by Stripe; the handler verifies the request
// using STRIPE_WEBHOOK_SECRET. Other /api/stripe/* routes (checkout, portal)
// still require an authenticated user and stay middleware-gated.
const PUBLIC_PREFIXES = ['/leagues/', '/pams-template/', '/api/cron/', '/api/stripe/webhook']

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

  const path = request.nextUrl.pathname
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
