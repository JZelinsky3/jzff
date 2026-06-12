// OG image generator for individual manager file pages.
// URL: /api/og/manager/<slug>/<uid>
//
// Renders a 1200x630 "personnel file" card for one manager: name, latest
// team, career stat strip, championship years, and an ALUMNI stamp for
// departed managers. Shared when someone links managers/manager.html?id=.
//
// CDN-cached per (slug, uid); busted only when the league bundle's
// `league-<id>` tag is revalidated by sync.

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeagueBundle } from '@/lib/leagueBundleCache'

export const runtime = 'nodejs'

type DirectoryManager = {
  user_id: string | null
  name: string
  team_latest: string | null
  is_current: boolean
  total_record: string
  win_pct: number
  ppg: number
  seasons_played: number
  playoff_appearances: number
  championships: number
  championship_seasons: number[] | null
  top_three_finishes: number
}

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
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; uid: string }> }
) {
  const { slug, uid } = await params

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
  const dir = bundle['managers_directory.json'] as { managers?: DirectoryManager[] } | undefined
  const m = dir?.managers?.find((x) => x.user_id === uid)
  if (!m) return new Response('Manager not found', { status: 404 })

  const fonts = await loadFonts()
  return renderManagerCard(league.name, m, fonts)
}

function renderManagerCard(
  leagueName: string,
  m: DirectoryManager,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const gold = '#e8c889'
  const accent = m.is_current ? gold : '#7fa8bd' // alumni files read steel

  const stats: Array<[string, string]> = [
    ['Record', m.total_record || '0-0'],
    ['Win %', `${(m.win_pct * 100).toFixed(1)}%`],
    ['PPG', m.ppg ? m.ppg.toFixed(1) : '—'],
    ['Seasons', String(m.seasons_played ?? 0)],
    ['Playoffs', String(m.playoff_appearances ?? 0)],
    ['Top-3', String(m.top_three_finishes ?? 0)],
  ]

  const champYears = (m.championship_seasons ?? []).filter((y) => Number.isFinite(y))
  const champLine = m.championships > 0
    ? `${m.championships}× CHAMPION${champYears.length ? ` · ${champYears.join(' · ')}` : ''}`
    : null

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
            background: `radial-gradient(circle at 18% 30%, ${accent}29 0%, transparent 50%), radial-gradient(circle at 85% 85%, ${accent}14 0%, transparent 45%)`,
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
          <span style={{ display: 'flex' }}>{leagueName.toUpperCase()} · THE MANAGER FILE</span>
          <span style={{ display: 'flex', color: '#9ca3af', letterSpacing: '0.32em' }}>
            THE SUNDAY CHRONICLE
          </span>
        </div>

        {/* ALUMNI stamp */}
        {!m.is_current && (
          <div
            style={{
              position: 'absolute',
              top: '96px',
              right: '64px',
              display: 'flex',
              padding: '8px 22px',
              border: `3px solid ${accent}99`,
              color: `${accent}cc`,
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '0.35em',
              textTransform: 'uppercase',
              transform: 'rotate(8deg)',
              zIndex: 3,
            }}
          >
            ALUMNI
          </div>
        )}

        {/* Name + team */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 70px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              fontFamily: 'DMSerif',
              fontSize: m.name.length > 16 ? '88px' : '112px',
              lineHeight: 1,
              color: '#f3f4f6',
              textAlign: 'center',
              display: 'flex',
            }}
          >
            {m.name}
          </div>
          {m.team_latest && m.team_latest !== m.name && (
            <div
              style={{
                marginTop: '14px',
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '30px',
                color: accent,
              }}
            >
              {m.team_latest}
            </div>
          )}
          {champLine && (
            <div
              style={{
                marginTop: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '19px',
                fontWeight: 700,
                letterSpacing: '0.3em',
                color: gold,
                textTransform: 'uppercase',
              }}
            >
              <div style={{ display: 'flex', width: '11px', height: '11px', background: gold, transform: 'rotate(45deg)' }} />
              <span style={{ display: 'flex' }}>{champLine}</span>
              <div style={{ display: 'flex', width: '11px', height: '11px', background: gold, transform: 'rotate(45deg)' }} />
            </div>
          )}
        </div>

        {/* Stat strip */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '54px',
            padding: '0 56px 30px',
            zIndex: 2,
          }}
        >
          {stats.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'flex',
                  fontSize: '14px',
                  fontWeight: 700,
                  letterSpacing: '0.3em',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </span>
              <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '36px', color: accent, lineHeight: 1 }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 56px 26px',
            fontSize: '13px',
            letterSpacing: '0.28em',
            color: '#6b7280',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>{m.is_current ? 'ACTIVE ROSTER' : 'LEAGUE ALUMNI'}</span>
          <span style={{ display: 'flex', color: accent, fontWeight: 700 }}>JZFF.ONLINE</span>
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
