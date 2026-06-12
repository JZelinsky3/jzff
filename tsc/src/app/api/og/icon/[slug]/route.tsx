// Home-screen icon generator for published league sites.
// URL: /api/og/icon/<slug>?s=<px>   (default 512; apple-touch-icon uses 180)
//
// App-tile design: ink field with a warm halo, the league's abbreviation
// in serif italic split two-tone (front half cream, back half + period in
// gold — "PA" + "MS."), and a small matching "TSC." wordmark beneath. No
// border/frame — iOS rounds the corners itself, so a drawn square outline
// just fights the mask. Referenced by the apple-touch-icon link and the
// web app manifest the almanac route injects into every served page.

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

// Same fallback the almanac route uses for {{LEAGUE_ABBR}} — first letter
// of each word, so the icon always matches the abbreviation shown on-site.
function abbreviate(name: string): string {
  const initials = (name ?? '')
    .replace(/[^A-Za-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return initials || (name ?? '?').slice(0, 4).toUpperCase()
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, name, slug, abbreviation, published_at')
    .eq('slug', slug)
    .maybeSingle()
  if (!league || !league.published_at) {
    return new Response('Not found', { status: 404 })
  }

  const sParam = Number(req.nextUrl.searchParams.get('s'))
  // Render at a clean square size; home screens downscale fine but icons
  // shouldn't be arbitrarily huge — clamp to [120, 512].
  const size = Number.isFinite(sParam) ? Math.min(512, Math.max(120, Math.round(sParam))) : 512
  const u = size / 512 // design unit — everything below is sized at 512 and scaled

  const abbr = (league.abbreviation?.trim() || abbreviate(league.name)).toUpperCase().slice(0, 6)
  // Two-tone split: front half cream, back half + trailing period gold
  // ("PAMS" → "PA" + "MS.", "TSC" → "TS" + "C.").
  const cut = Math.ceil(abbr.length / 2)
  const headChars = abbr.slice(0, cut)
  const tailChars = abbr.slice(cut)
  const abbrSize =
    abbr.length <= 2 ? 232 : abbr.length === 3 ? 196 : abbr.length === 4 ? 156 : abbr.length === 5 ? 128 : 108

  const serifItalic = await readFile(path.join(FONT_DIR, 'DMSerifDisplay-Italic.ttf'))

  const gold = '#e8c889'
  const cream = '#f4ebd8'
  const ink = '#0e1620'

  return new ImageResponse(
    (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: ink,
          position: 'relative',
          fontFamily: 'DMSerif',
        }}
      >
        {/* Warm halo behind the monogram */}
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex',
            background: `radial-gradient(circle at 50% 44%, ${gold}2b 0%, transparent 64%)`,
          }}
        />
        {/* League abbreviation, two-tone with the trailing period in gold */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            fontStyle: 'italic',
            fontSize: `${abbrSize * u}px`,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          <span style={{ display: 'flex', color: cream }}>{headChars}</span>
          <span style={{ display: 'flex', color: gold }}>{tailChars}.</span>
        </div>
        {/* Small TSC. wordmark, same treatment, kept quiet */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            fontStyle: 'italic',
            fontSize: `${80 * u}px`,
            lineHeight: 1,
            marginTop: `${30 * u}px`,
            opacity: 0.6,
          }}
        >
          <span style={{ display: 'flex', color: cream }}>TS</span>
          <span style={{ display: 'flex', color: gold }}>C.</span>
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: [
        { name: 'DMSerif', data: serifItalic, style: 'italic' as const, weight: 400 as const },
      ],
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  )
}
