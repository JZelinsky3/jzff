import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Static demo trees under /public that are browsed with directory URLs
// (/demo/, /demo/seasons/, ...). Vercel's static layer resolves those to
// <dir>/index.html in production, but `next dev` does no index resolution
// for /public, so the same URLs 404 locally. Rewriting here keeps dev and
// prod serving identical paths.
const STATIC_INDEX_TREES = /^\/(demo|demo-m|old)(\/|$)/

// Within those trees these two pages are flat files (standings.html,
// records.html) rather than directories with an index. The shared almanac
// nav links to them with clean URLs (/demo/standings), which the live league
// route resolves via a .html fallback but the static demo can't — the clean
// URL would rewrite to <name>/index.html and 404. Map it to the sibling file.
const STATIC_FLAT_PAGES = /\/(standings|records)\/?$/

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (STATIC_INDEX_TREES.test(pathname) && !/\.[a-z0-9]+$/i.test(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = STATIC_FLAT_PAGES.test(pathname)
      ? pathname.replace(/\/?$/, '').replace(STATIC_FLAT_PAGES, '/$1.html')
      : pathname.replace(/\/?$/, '/index.html')
    return NextResponse.rewrite(url)
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Skip middleware for static files served from /public — images,
    // sitemap.xml, robots.txt, llms.txt, and the Google site-verification
    // HTML file. Without `xml|txt|html` here the unauth middleware was
    // intercepting /sitemap.xml + /robots.txt and bouncing them through
    // /login, so search engines saw the login page instead of the file.
    // `webmanifest` keeps the PWA manifest installable — browsers fetch it
    // credential-less, and a /login bounce breaks home-screen install.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|xml|txt|html|webmanifest)$).*)',
  ],
}
