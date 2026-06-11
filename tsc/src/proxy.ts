import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
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
