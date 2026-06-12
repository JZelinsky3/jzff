// Web app manifest for published league sites, so "Add to Home Screen" on
// Android (and iOS 16.4+) installs the league with its bookplate icon and
// real name instead of a screenshot tile. Linked from every almanac page
// by the serving route. `display: standalone` + a league-scoped scope makes
// the installed site open like its own app.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, name, slug, published_at')
    .eq('slug', slug)
    .maybeSingle()
  if (!league || !league.published_at) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // short_name shows under the icon — home screens truncate past ~12 chars,
  // so prefer the league's last word ("...Society") over a mid-word chop.
  const words = league.name.trim().split(/\s+/).filter(Boolean)
  const shortName = league.name.length <= 12
    ? league.name
    : (words[words.length - 1] ?? league.name).slice(0, 12)

  return NextResponse.json(
    {
      name: league.name,
      short_name: shortName,
      start_url: `/leagues/${league.slug}/`,
      scope: `/leagues/${league.slug}/`,
      display: 'standalone',
      background_color: '#0e1620',
      theme_color: '#0e1620',
      // v= busts the CDN-cached icon whenever the tile design changes —
      // bump it together with the apple-touch-icon link in the almanac route.
      icons: [
        { src: `/api/og/icon/${league.slug}?s=192&v=2`, sizes: '192x192', type: 'image/png' },
        { src: `/api/og/icon/${league.slug}?s=512&v=2`, sizes: '512x512', type: 'image/png' },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  )
}
