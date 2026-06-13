import { NextResponse, type NextRequest } from 'next/server'
import { VIEW_COOKIE } from '@/lib/viewMode'

// Sets the explicit mobile/desktop view preference, then bounces back to the
// page the visitor came from. Server Components can't set cookies, so the
// "View desktop site" / "Back to mobile" links on the React pages route
// through here. Mirrors how the per-league static site handles ?view=.
//
//   /api/view?mode=desktop&to=/        → force desktop, return to landing
//   /api/view?mode=mobile&to=/hub      → force mobile, return to clubhouse
export function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode')
  const toParam = req.nextUrl.searchParams.get('to') || '/'
  // Only allow same-site relative redirects — never bounce off-origin.
  const to = toParam.startsWith('/') && !toParam.startsWith('//') ? toParam : '/'

  const res = NextResponse.redirect(new URL(to, req.nextUrl.origin))
  if (mode === 'desktop' || mode === 'mobile') {
    res.cookies.set(VIEW_COOKIE, mode, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
  }
  return res
}
