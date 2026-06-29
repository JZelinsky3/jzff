// OG image generator for the live power rankings page.
// URL: /api/og/powerrank/<slug>
//
// "Almanac chart" — cream paper background with navy ink, deep gold leaf,
// and black detailing. Matches the cream chapter look of the on-page
// rankings, so the share preview reads as a continuation of the page.
// Surfaces the week label, "Power Rankings" title, and the top-three
// podium with each team's record + power-rank score.
//
// CDN-cached per slug; busted when the league bundle's `league-<id>` tag
// is revalidated by sync.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPowerRankings } from '@/lib/powerRankings'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

// Almanac chart palette — kept in sync with mobile-app.css :root tokens.
const CREAM       = '#f4ebd8'
const CREAM_DEEP  = '#ede0c2'
const INK         = '#0e1620'
const INK_SOFT    = '#16202c'
const GOLD        = '#e8c889'
const GOLD_DEEP   = '#a88a4a'
const BLACK       = '#000000'
const INK_MUTE    = 'rgba(14, 22, 32, 0.55)'
const INK_LINE    = 'rgba(14, 22, 32, 0.18)'

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

type Row = { teamName: string; manager: string; wins: number; losses: number; score: number }

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
    return new Response('Not found', { status: 404 })
  }

  const fonts = await loadFonts()
  const data = await getPowerRankings(slug)

  if (!data || data.status !== 'ok' || !data.weeks.length) {
    return renderQuietCard(league.name, fonts)
  }

  const latest = data.weeks[data.weeks.length - 1]!
  const top = latest.overall.slice(0, 3).map<Row>((t) => ({
    teamName: t.team_name,
    manager: t.manager,
    wins: t.wins,
    losses: t.losses,
    score: t.score,
  }))
  return renderPodiumCard(league.name, latest.week, top, fonts)
}

function backgroundLayers() {
  // Faint diamond grid in gold-deep + radial corner washes — same restraint
  // as the on-page glow so the cream paper stays the dominant surface.
  const diamond = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><path d="M22 0 44 22 22 44 0 22Z" fill="none" stroke="${GOLD_DEEP}" stroke-opacity="0.12" stroke-width="0.9"/></svg>`
  )
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          backgroundImage: `url("data:image/svg+xml;utf8,${diamond}")`,
          backgroundSize: '44px 44px',
          opacity: 0.6,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background:
            `radial-gradient(circle at 12% 8%, ${INK}18 0%, transparent 45%),` +
            `radial-gradient(circle at 88% 92%, ${GOLD_DEEP}24 0%, transparent 50%)`,
        }}
      />
      {/* Top + bottom rules — gold leaf on a dark spine */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, display: 'flex', background: `linear-gradient(90deg, transparent 0%, ${GOLD_DEEP} 30%, ${INK} 70%, transparent 100%)` }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, display: 'flex', background: `linear-gradient(90deg, transparent 0%, ${INK} 30%, ${GOLD_DEEP} 70%, transparent 100%)`, opacity: 0.8 }} />
    </>
  )
}

function renderPodiumCard(
  leagueName: string,
  week: number,
  rows: Row[],
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const weekLabel = week === 0 ? 'PRESEASON' : `WEEK ${week}`
  const leader = rows[0]

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: CREAM,
          color: INK,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        {backgroundLayers()}

        {/* Top bar — league + masthead */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '40px 60px 0',
            fontSize: '23px',
            fontWeight: 700,
            letterSpacing: '0.3em',
            color: GOLD_DEEP,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <span style={{ display: 'flex', width: 12, height: 12, borderRadius: 999, background: GOLD_DEEP }} />
            {leagueName.toUpperCase()}
          </span>
          <span style={{ display: 'flex', color: INK_MUTE, letterSpacing: '0.32em' }}>
            THE SUNDAY CHRONICLE
          </span>
        </div>

        {/* Headline lockup */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: '52px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              fontFamily: 'JetBrains',
              fontWeight: 700,
              fontSize: '26px',
              letterSpacing: '0.34em',
              color: BLACK,
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}
          >
            <span style={{ display: 'flex' }}>★</span>
            <span style={{ display: 'flex' }}>{weekLabel}</span>
            <span style={{ display: 'flex' }}>·</span>
            <span style={{ display: 'flex' }}>THE BOARD</span>
            <span style={{ display: 'flex' }}>★</span>
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontSize: '108px',
              lineHeight: 1,
              color: INK,
            }}
          >
            Power&nbsp;
            <span style={{ display: 'flex', fontStyle: 'italic', color: GOLD_DEEP }}>Rankings.</span>
          </div>
        </div>

        {/* Podium */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '32px 90px 0',
            zIndex: 2,
          }}
        >
          {rows.map((r, i) => podiumRow(r, i))}
        </div>

        {/* Footer line */}
        <div
          style={{
            position: 'absolute',
            bottom: 26,
            left: 60,
            right: 60,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '19px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            color: INK_MUTE,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex', color: GOLD_DEEP }}>
            {leader ? `LEADER · ${leader.manager.toUpperCase()} · ${leader.score.toFixed(1)} PTS` : 'AUTO-CALCULATED EACH WEEK'}
          </span>
          <span style={{ display: 'flex', textAlign: 'right', color: BLACK }}>
            TAP IN · SEE THE FULL BOARD
          </span>
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

function podiumRow(r: Row, idx: number) {
  const place = idx === 0 ? '1ST' : idx === 1 ? '2ND' : '3RD'
  const isLead = idx === 0
  return (
    <div
      key={`${r.manager}-${idx}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        padding: '14px 26px',
        border: `1px solid ${isLead ? INK : INK_LINE}`,
        background: isLead
          ? `linear-gradient(90deg, ${INK} 0%, ${INK_SOFT} 100%)`
          : CREAM_DEEP,
        color: isLead ? CREAM : INK,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '64px',
          height: '36px',
          background: isLead ? GOLD : 'transparent',
          border: isLead ? `1px solid ${GOLD_DEEP}` : `1px solid ${INK}`,
          fontFamily: 'JetBrains',
          fontWeight: 700,
          fontSize: '17px',
          letterSpacing: '0.22em',
          color: isLead ? INK : BLACK,
        }}
      >
        {place}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'DMSerif',
            fontSize: '40px',
            lineHeight: 1,
            color: isLead ? CREAM : INK,
            overflow: 'hidden',
          }}
        >
          {r.teamName}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '4px',
            fontFamily: 'JetBrains',
            fontWeight: 400,
            fontSize: '17px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: isLead ? GOLD : INK_MUTE,
          }}
        >
          {r.manager}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '4px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'JetBrains',
            fontWeight: 700,
            fontSize: '30px',
            letterSpacing: '0.04em',
            color: isLead ? GOLD : GOLD_DEEP,
          }}
        >
          {r.score.toFixed(1)}
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'JetBrains',
            fontWeight: 700,
            fontSize: '18px',
            letterSpacing: '0.16em',
            color: isLead ? CREAM : BLACK,
          }}
        >
          {r.wins}–{r.losses}
        </div>
      </div>
    </div>
  )
}

function renderQuietCard(
  leagueName: string,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
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
          background: CREAM,
          color: INK,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        {backgroundLayers()}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            fontSize: '23px',
            fontWeight: 700,
            letterSpacing: '0.34em',
            color: GOLD_DEEP,
            textTransform: 'uppercase',
            marginBottom: '28px',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex', width: 12, height: 12, borderRadius: 999, background: GOLD_DEEP }} />
          <span style={{ display: 'flex' }}>{leagueName.toUpperCase()}</span>
          <span style={{ display: 'flex' }}>·</span>
          <span style={{ display: 'flex' }}>POWER RANKINGS</span>
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'DMSerif',
            fontStyle: 'italic',
            fontSize: '108px',
            lineHeight: 1,
            color: INK,
            zIndex: 2,
          }}
        >
          The board is set.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '22px',
            fontFamily: 'DMSerif',
            fontSize: '34px',
            color: GOLD_DEEP,
            zIndex: 2,
          }}
        >
          Power Rankings appear once the season is live
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
