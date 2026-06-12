// Home-screen icon generator for published league sites.
// URL: /api/og/icon/<slug>?s=<px>   (default 512; apple-touch-icon uses 180)
//
// Rendered as a vintage bookplate so an added-to-home-screen league reads
// like a real app tile: ink field, double gold frame, diamond crest, serif-italic
// monogram, EST line. Referenced by the apple-touch-icon link and the web
// app manifest the almanac route injects into every served page.

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeagueBundle } from '@/lib/leagueBundleCache'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

function monogram(name: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

export async function GET(
  req: NextRequest,
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
    return new Response('Not found', { status: 404 })
  }

  let founded: number | null = null
  try {
    const bundle = await getLeagueBundle(league.id, league.slug)
    const lf = bundle['league.json'] as { founded?: number | null } | undefined
    founded = lf?.founded ?? null
  } catch { /* icon still renders without the EST line */ }

  const sParam = Number(req.nextUrl.searchParams.get('s'))
  // Render at a clean square size; home screens downscale fine but icons
  // shouldn't be arbitrarily huge — clamp to [120, 512].
  const size = Number.isFinite(sParam) ? Math.min(512, Math.max(120, Math.round(sParam))) : 512
  const u = size / 512 // design unit — everything below is sized at 512 and scaled

  const initials = monogram(league.name)
  const initialsSize =
    initials.length <= 1 ? 280 : initials.length === 2 ? 220 : 168

  const [serifItalic, mono] = await Promise.all([
    readFile(path.join(FONT_DIR, 'DMSerifDisplay-Italic.ttf')),
    readFile(path.join(FONT_DIR, 'JetBrainsMono-Bold.ttf')),
  ])

  const gold = '#e8c889'
  const goldDeep = '#a88a4a'
  const ink = '#0e1620'

  return new ImageResponse(
    (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          display: 'flex',
          background: ink,
          position: 'relative',
        }}
      >
        {/* Warm halo behind the monogram */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 50% 46%, ${gold}26 0%, transparent 62%)`,
          }}
        />
        {/* Double bookplate frame */}
        <div
          style={{
            position: 'absolute',
            top: `${28 * u}px`, left: `${28 * u}px`, right: `${28 * u}px`, bottom: `${28 * u}px`,
            display: 'flex',
            border: `${Math.max(2, 5 * u)}px solid ${goldDeep}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: `${44 * u}px`, left: `${44 * u}px`, right: `${44 * u}px`, bottom: `${44 * u}px`,
            display: 'flex',
            border: `${Math.max(1, 2 * u)}px solid ${gold}66`,
          }}
        />
        {/* Crest star, monogram, rule, EST line */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: `${10 * u}px`,
          }}
        >
          {/* Crest mark — drawn (rotated square) because neither OG font
              carries the ✦ glyph the site uses elsewhere */}
          <div
            style={{
              display: 'flex',
              width: `${20 * u}px`,
              height: `${20 * u}px`,
              background: gold,
              transform: 'rotate(45deg)',
              marginBottom: `${6 * u}px`,
            }}
          />
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontStyle: 'italic',
              fontSize: `${initialsSize * u}px`,
              lineHeight: 1,
              color: gold,
              letterSpacing: '-0.02em',
            }}
          >
            {initials}
          </div>
          <div style={{ display: 'flex', width: `${96 * u}px`, height: `${Math.max(1, 2 * u)}px`, background: `${gold}55` }} />
          {founded != null && (
            <div
              style={{
                display: 'flex',
                fontFamily: 'JetBrains',
                fontWeight: 700,
                fontSize: `${22 * u}px`,
                letterSpacing: '0.3em',
                color: '#837b6a',
              }}
            >
              EST. {founded}
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: [
        { name: 'DMSerif', data: serifItalic, style: 'italic' as const, weight: 400 as const },
        { name: 'JetBrains', data: mono, style: 'normal' as const, weight: 700 as const },
      ],
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  )
}
