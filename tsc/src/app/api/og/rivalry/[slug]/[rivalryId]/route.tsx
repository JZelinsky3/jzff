// OG image generator for individual rivalry pages.
// URL: /api/og/rivalry/<slug>/<rivalryId>
//
// Renders a 1200x630 PNG "tale of the tape" card. Layout, fonts, and
// imagery are designed to match the rivalry detail page's editorial vibe
// and to actually carry product signal — the character pair is chosen by
// rivalry STATS (blowout vs deadlocked vs high-scoring vs ancient feud)
// rather than dropped in as decoration. See `pickRivalryTheme`.
//
// CDN-cached per (slug, rivalryId); busted only when the league bundle's
// `league-<id>` tag is revalidated by sync.

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeagueBundle } from '@/lib/leagueBundleCache'
import {
  buildThemeContext,
  pickRivalryTheme,
  type RivalrySummary,
} from '@/lib/og/rivalryTheme'

export const runtime = 'nodejs'

type RivalrySide = {
  name: string
  wins: number
  avg_ppg: number
  reg_record: string
  playoff_record: string
  high_score: { score: number; year: number; week: number; is_playoff: boolean } | null
}

type Rivalry = RivalrySummary & {
  name: string
  last_meeting: { year: number; week: number } | null
  leader_name: string | null
  ties_count: number
  manager_a: RivalrySide
  manager_b: RivalrySide
}

type RivalriesBundle = {
  rivalries: Rivalry[]
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
  { params }: { params: Promise<{ slug: string; rivalryId: string }> }
) {
  const { slug, rivalryId } = await params

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
  const rivalriesData = bundle['rivalries.json'] as RivalriesBundle | undefined
  const rivalry = rivalriesData?.rivalries.find((r) => r.id === rivalryId)
  if (!rivalry) {
    return new Response('Rivalry not found', { status: 404 })
  }

  const themeCtx = buildThemeContext(rivalriesData!.rivalries)
  const { theme, pair } = pickRivalryTheme(rivalry, themeCtx)
  const fonts = await loadFonts()

  return renderRivalryCard(league.name, rivalry, theme, pair, fonts)
}

function renderRivalryCard(
  leagueName: string,
  rv: Rivalry,
  theme: ReturnType<typeof pickRivalryTheme>['theme'],
  pair: readonly [string, string],
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const aWins = rv.manager_a.wins
  const bWins = rv.manager_b.wins
  const ties = rv.ties_count
  const aLeads = aWins > bWins
  const bLeads = bWins > aWins
  const isDeadlocked = rv.is_deadlocked && rv.total_meetings > 0

  const verdict = rv.total_meetings === 0
    ? 'NEVER MET'
    : isDeadlocked
      ? `DEADLOCKED ${aWins}—${bWins}`
      : `${(rv.leader_name ?? '').toUpperCase()} LEADS`

  const meetingsLine = rv.total_meetings === 0
    ? 'NO MEETINGS ON RECORD'
    : [
        rv.first_meeting_year ? `FIRST MET ${rv.first_meeting_year}` : null,
        `${rv.total_meetings} MEETING${rv.total_meetings === 1 ? '' : 'S'}`,
        rv.last_meeting ? `LAST ${rv.last_meeting.year} W${rv.last_meeting.week}` : null,
      ].filter(Boolean).join(' · ')

  // Background: editorial dark wash with theme-accent corner glows + a
  // subtle gridiron rule pattern overlay so the card doesn't read as a
  // flat black rectangle.
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
        {/* Gridiron rule overlay */}
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
        {/* Theme-accent corner glows */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 10% 20%, ${theme.accent}33 0%, transparent 45%), radial-gradient(circle at 90% 80%, ${theme.accent}1f 0%, transparent 45%)`,
          }}
        />

        {/* TOP BAR: league kicker + masthead */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '32px 56px 0',
            fontSize: '17px',
            letterSpacing: '0.3em',
            color: theme.accent,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>{leagueName.toUpperCase()} · HEAD-TO-HEAD</span>
          <span style={{ display: 'flex', color: '#9ca3af', letterSpacing: '0.32em' }}>
            THE SUNDAY CHRONICLE
          </span>
        </div>

        {/* THEME BANNER */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '14px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '7px 22px',
              border: `1px solid ${theme.accent}66`,
              background: `${theme.accent}12`,
              fontSize: '15px',
              letterSpacing: '0.4em',
              color: theme.accent,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            <div style={{ display: 'flex', width: '24px', height: '1px', background: theme.accent }} />
            <span style={{ display: 'flex' }}>{theme.label}</span>
            <div style={{ display: 'flex', width: '24px', height: '1px', background: theme.accent }} />
          </div>
        </div>

        {/* MAIN TALE OF THE TAPE */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 60px',
            zIndex: 2,
          }}
        >
          {/* LEFT SIDE */}
          <Side
            emoji={pair[0]}
            name={rv.manager_a.name}
            wins={aWins}
            ppg={rv.manager_a.avg_ppg}
            highScore={rv.manager_a.high_score?.score ?? null}
            leading={aLeads}
            accent={theme.accent}
            align="left"
          />

          {/* CENTER: verdict block */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              minWidth: '260px',
            }}
          >
            <div
              style={{
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '34px',
                color: theme.accent,
                marginBottom: '4px',
                display: 'flex',
              }}
            >
              vs.
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                fontFamily: 'DMSerif',
              }}
            >
              <span style={{ display: 'flex', fontSize: '108px', lineHeight: 1, color: aLeads ? '#f3f4f6' : '#6b7280' }}>{aWins}</span>
              <div style={{ display: 'flex', width: '34px', height: '6px', background: '#4b5563', borderRadius: '3px' }} />
              <span style={{ display: 'flex', fontSize: '108px', lineHeight: 1, color: bLeads ? '#f3f4f6' : '#6b7280' }}>{bWins}</span>
              {ties > 0 && (
                <>
                  <div style={{ display: 'flex', width: '34px', height: '6px', background: '#4b5563', borderRadius: '3px' }} />
                  <span style={{ display: 'flex', fontSize: '108px', lineHeight: 1, color: '#6b7280' }}>{ties}</span>
                </>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                padding: '6px 14px',
                marginTop: '10px',
                border: `1px solid ${theme.accent}`,
                background: `${theme.accent}1a`,
                color: theme.accent,
                fontFamily: 'JetBrains',
                fontWeight: 700,
                fontSize: '15px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
              }}
            >
              {verdict}
            </div>
          </div>

          {/* RIGHT SIDE */}
          <Side
            emoji={pair[1]}
            name={rv.manager_b.name}
            wins={bWins}
            ppg={rv.manager_b.avg_ppg}
            highScore={rv.manager_b.high_score?.score ?? null}
            leading={bLeads}
            accent={theme.accent}
            align="right"
          />
        </div>

        {/* FOOTER */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 56px 28px',
            fontSize: '13px',
            letterSpacing: '0.28em',
            color: '#6b7280',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>{meetingsLine}</span>
          <span style={{ display: 'flex', color: theme.accent, fontWeight: 700 }}>TSC.FOOTBALL</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      emoji: 'twemoji',
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  )
}

function Side(props: {
  emoji: string
  name: string
  wins: number
  ppg: number
  highScore: number | null
  leading: boolean
  accent: string
  align: 'left' | 'right'
}) {
  const { emoji, name, wins, ppg, highScore, leading, accent, align } = props
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : 'flex-end',
        gap: '14px',
        width: '320px',
      }}
    >
      {/* Character emoji in a glowing ring */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          border: leading ? `3px solid ${accent}` : '2px solid #272727',
          background: leading
            ? `radial-gradient(circle, ${accent}33 0%, #0a0a0a 70%)`
            : 'radial-gradient(circle, #1a1a1a 0%, #0a0a0a 70%)',
          fontSize: '128px',
          lineHeight: 1,
          boxShadow: leading ? `0 0 60px ${accent}55` : 'none',
        }}
      >
        {emoji}
      </div>

      {/* Name */}
      <div
        style={{
          fontFamily: 'DMSerif',
          fontSize: '40px',
          lineHeight: 1,
          color: leading ? '#f3f4f6' : '#d1d5db',
          maxWidth: '320px',
          textAlign: align,
          display: 'flex',
        }}
      >
        {name}
      </div>

      {/* Stats line */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: align === 'left' ? 'flex-start' : 'flex-end',
          gap: '4px',
          fontFamily: 'JetBrains',
          fontSize: '15px',
          letterSpacing: '0.18em',
          color: '#9ca3af',
          textTransform: 'uppercase',
        }}
      >
        <div style={{ display: 'flex', gap: '12px' }}>
          <span style={{ display: 'flex', color: '#f3f4f6', fontWeight: 700 }}>{wins} W</span>
          <span style={{ display: 'flex' }}>·</span>
          <span style={{ display: 'flex' }}>{ppg.toFixed(1)} PPG</span>
        </div>
        {highScore !== null && (
          <div style={{ display: 'flex', color: '#6b7280' }}>
            BEST: {highScore.toFixed(1)}
          </div>
        )}
      </div>
    </div>
  )
}
