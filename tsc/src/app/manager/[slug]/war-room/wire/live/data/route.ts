// Live Wire data endpoint — fetches current-week matchups and season-to-date
// form from every linked Sleeper league. The Wire template fetches this on
// load; no caching since these numbers move live during games.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadWireLive } from '@/lib/manager/wire'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Sign in required', { status: 401 })

  const live = await loadWireLive(slug, user.id)
  if (!live) return new NextResponse('Not found', { status: 404 })

  return NextResponse.json(live, {
    headers: {
      // Owner-scoped + live-shifting. No shared CDN caching, short browser
      // cache so a quick refresh doesn't re-hit Sleeper for every tab.
      'Cache-Control': 'private, max-age=30, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  })
}
