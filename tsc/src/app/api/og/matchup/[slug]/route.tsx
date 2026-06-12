// OG image generator for the live-season matchup preview page.
// URL: /api/og/matchup/<slug>            → Game of the Week (or first slate game)
//      /api/og/matchup/<slug>?m=<uid>    → the matchup featuring that manager
//
// Renders a 1200x630 fight-poster card for one upcoming game: week kicker,
// GOTW banner, both managers with records and form, projection line, and
// the all-time head-to-head ledger. When there's no live week (offseason),
// it falls back to a quiet "desk is dark" card instead of 404ing — a share
// must never lose its image.
//
// CDN-cached per (slug, m); busted when the league bundle's `league-<id>`
// tag is revalidated by sync.

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeagueBundle } from '@/lib/leagueBundleCache'

export const runtime = 'nodejs'

type Side = {
  uid: string | null
  name: string
  record: string
  ppg5: number
  ppgSeason: number
  streak: { kind: 'W' | 'L'; count: number } | null
}

type MatchupCard = {
  a: Side
  b: Side
  h2h: {
    meetings: number
    winsA: number
    winsB: number
    ties: number
    lastYear: number | null
    recent: Array<{ year: number; week: number }>
  }
  projected: { a: number; b: number; spread: number; favorite: 'a' | 'b' | 'pp' }
  gotw: boolean
}

type PreviewFile = {
  year: number
  week: number
  gotwIdx: number | null
  matchups: MatchupCard[]
} | null

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

async function loadFonts() {
  const [serif, serifItalic, mono, monoBold] = await Promise.all([
    readFile(path.join(FONT_DIR, 'DMSerifDisplay-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'DMSerifDisplay-Italic.ttf')),
    readFile(path.join(FONT_DIR, 'JetBrainsMono-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'JetBrainsMono-Bold.ttf')),
  ])
  return [
    { name: 'DMSerif', data: serif, style: 'normal' as const, weight: 400 as const },
    { name: 'DMSerif', data: serifItalic, style: 'italic' as const, weight: 400 as const },
    { name: 'JetBrains', data: mono, style: 'normal' as const, weight: 400 as const },
    { name: 'JetBrains', data: monoBold, style: 'normal' as const, weight: 700 as const },
  ]
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

  const bundle = await getLeagueBundle(league.id, league.slug)
  const preview = bundle['matchup_preview.json'] as PreviewFile | undefined

  const fonts = await loadFonts()

  if (!preview || !preview.matchups?.length) {
    return renderOffseasonCard(league.name, fonts)
  }

  // ?m=<uid> picks that manager's game; otherwise the Game of the Week
  // (falling back to the first game on the slate).
  const mUid = req.nextUrl.searchParams.get('m')
  let card: MatchupCard | undefined
  if (mUid) {
    card = preview.matchups.find((c) => c.a.uid === mUid || c.b.uid === mUid)
  }
  if (!card) card = preview.matchups[preview.gotwIdx ?? 0] ?? preview.matchups[0]

  return renderMatchupCard(league.name, preview.week, card, fonts)
}

function streakStr(s: Side['streak']): string | null {
  if (!s || !s.count) return null
  return `${s.kind}${s.count}`
}

function renderMatchupCard(
  leagueName: string,
  week: number,
  c: MatchupCard,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const accent = c.gotw ? '#e8c850' : '#e8c889'
  const projA = c.projected.a.toFixed(1)
  const projB = c.projected.b.toFixed(1)

  const h2hLine = c.h2h.meetings > 0
    ? [
        `ALL-TIME ${c.h2h.winsA}—${c.h2h.winsB}${c.h2h.ties ? `—${c.h2h.ties}` : ''}`,
        `${c.h2h.meetings} MEETING${c.h2h.meetings === 1 ? '' : 'S'}`,
        c.h2h.recent[0] ? `LAST ${c.h2h.recent[0].year} W${c.h2h.recent[0].week}` : null,
      ].filter(Boolean).join('  ·  ')
    : 'FIRST CAREER MEETING'

  const gridiron = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path d="M0 40h80M40 0v80" stroke="#1e1e1e" stroke-width="1"/></svg>`
  )

  const side = (s: Side, align: 'flex-end' | 'flex-start') => (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        gap: '14px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: 'DMSerif',
          fontSize: s.name.length > 12 ? '64px' : '84px',
          lineHeight: 1,
          color: '#f3f4f6',
          display: 'flex',
          textAlign: align === 'flex-end' ? 'right' : 'left',
        }}
      >
        {s.name}
      </div>
      <div
        style={{
          display: 'flex',
          gap: '18px',
          fontSize: '18px',
          fontWeight: 700,
          letterSpacing: '0.22em',
          color: '#9ca3af',
          textTransform: 'uppercase',
        }}
      >
        <span style={{ display: 'flex', color: accent }}>{s.record}</span>
        <span style={{ display: 'flex' }}>{s.ppgSeason ? `${s.ppgSeason.toFixed(1)} PPG` : ''}</span>
        {streakStr(s.streak) && <span style={{ display: 'flex' }}>{streakStr(s.streak)}</span>}
      </div>
    </div>
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: '#0a0a0a',
          color: '#f3f4f6',
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            opacity: 0.5,
            backgroundImage: `url("data:image/svg+xml;utf8,${gridiron}")`,
            backgroundSize: '80px 80px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 12% 25%, ${accent}2e 0%, transparent 48%), radial-gradient(circle at 88% 75%, ${accent}1a 0%, transparent 48%)`,
          }}
        />

        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '32px 56px 0',
            fontSize: '17px',
            letterSpacing: '0.3em',
            color: accent,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>{leagueName.toUpperCase()} · WEEK {week} PREVIEW</span>
          <span style={{ display: 'flex', color: '#9ca3af', letterSpacing: '0.32em' }}>
            THE SUNDAY CHRONICLE
          </span>
        </div>

        {/* GOTW banner */}
        {c.gotw && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '22px', zIndex: 2 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '8px 26px',
                border: `2px solid ${accent}88`,
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '0.4em',
                color: accent,
                textTransform: 'uppercase',
              }}
            >
              <div style={{ display: 'flex', width: '10px', height: '10px', background: accent, transform: 'rotate(45deg)' }} />
              <span style={{ display: 'flex' }}>GAME OF THE WEEK</span>
              <div style={{ display: 'flex', width: '10px', height: '10px', background: accent, transform: 'rotate(45deg)' }} />
            </div>
          </div>
        )}

        {/* Tale of the tape */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '44px',
            padding: '0 64px',
            zIndex: 2,
          }}
        >
          {side(c.a, 'flex-end')}
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontStyle: 'italic',
              fontSize: '44px',
              color: accent,
            }}
          >
            vs.
          </div>
          {side(c.b, 'flex-start')}
        </div>

        {/* Projection + H2H ledger */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            padding: '0 56px 28px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '16px',
              fontFamily: 'DMSerif',
              fontSize: '40px',
              color: accent,
            }}
          >
            <span style={{ display: 'flex' }}>{projA}</span>
            <span style={{ display: 'flex', fontSize: '24px', color: '#6b7280', fontFamily: 'JetBrains', letterSpacing: '0.3em' }}>PROJ</span>
            <span style={{ display: 'flex' }}>{projB}</span>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '0.28em',
              color: '#9ca3af',
              textTransform: 'uppercase',
            }}
          >
            {h2hLine}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  )
}

// Offseason / no-live-week fallback — keeps shared links from losing their
// preview image when the slate is empty.
function renderOffseasonCard(
  leagueName: string,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const accent = '#e8c889'
  const gridiron = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path d="M0 40h80M40 0v80" stroke="#1e1e1e" stroke-width="1"/></svg>`
  )
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          color: '#f3f4f6',
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            opacity: 0.5,
            backgroundImage: `url("data:image/svg+xml;utf8,${gridiron}")`,
            backgroundSize: '80px 80px',
          }}
        />
        <div
          style={{
            display: 'flex',
            fontSize: '16px',
            letterSpacing: '0.4em',
            color: accent,
            textTransform: 'uppercase',
            marginBottom: '26px',
          }}
        >
          {leagueName.toUpperCase()} · MATCHUP PREVIEW
        </div>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '84px', lineHeight: 1 }}>
          The desk is dark.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '20px',
            fontFamily: 'DMSerif',
            fontStyle: 'italic',
            fontSize: '28px',
            color: '#9ca3af',
          }}
        >
          Previews return when the season does — The Sunday Chronicle
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
