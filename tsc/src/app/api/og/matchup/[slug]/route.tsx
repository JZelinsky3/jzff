// OG image generator for the live matchup preview page.
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

type RecentMeeting = { year: number; week: number; scoreA: number; scoreB: number; winner: 'a' | 'b' | 't' }

type MatchupCard = {
  a: Side
  b: Side
  h2h: {
    meetings: number
    winsA: number
    winsB: number
    ties: number
    lastYear: number | null
    recent: RecentMeeting[]
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

  // ?m=<uid> features that manager's game. A bare share deliberately does
  // NOT crown one fixture: it shows the whole slate, the same call as the
  // All-Time card, because a neutral card with a hook travels further than
  // one that puts a single game (and a single pair of names) on blast.
  //
  // NOTE: uid here is whatever id the preview was built with. In leagues
  // migrated from NFL.com the preview keys managers by their NFL.com id
  // while managers_directory.json keys them by their platform user_id, so
  // the two are NOT interchangeable when testing this by hand.
  const mUid = req.nextUrl.searchParams.get('m')
  const card = mUid
    ? preview.matchups.find((c) => c.a.uid === mUid || c.b.uid === mUid)
    : undefined

  if (!card) return renderSlateCard(league.name, preview.week, preview.matchups, fonts)
  return renderMatchupCard(league.name, preview.week, card, fonts)
}


/* ============================================================
   THE CARD — the neutral share. Petrol field, a fan of ticket
   stubs, one per fixture, nobody featured.
   ============================================================ */
const PETROL      = '#0c1812'  // --mp-bg
const PETROL_SOFT = '#142a20'  // --mp-card
const FOOT_GREEN  = '#1a3528'  // --mp-card-hi, the foot bar
const TICKET      = '#efe6d2'
const TICKET_INK  = '#16241c'
const BRASS       = '#c89d5c'  // --mp-brass
const BRASS_HI    = '#e6bb78'  // --mp-brass-hi
const BRASS_DEEP  = '#8d6a37'  // --mp-brass-deep
const CREAM_T     = '#f4ebd8'  // --mp-cream
const CREAM_TSOFT = '#9eb5a2'  // --mp-mute

function TStar({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2z" />
    </svg>
  )
}

function cut(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`
}

function renderSlateCard(
  leagueName: string,
  week: number,
  cards: MatchupCard[],
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const games = cards.slice(0, 6)

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(155deg, #081109 0%, ${PETROL} 46%, ${PETROL_SOFT} 100%)`,
          color: CREAM_T,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 20% 28%, ${BRASS}1c 0%, transparent 46%), radial-gradient(circle at 86% 84%, ${BRASS_DEEP}26 0%, transparent 44%)`,
          }}
        />

        <div style={{ display: 'flex', height: '16px', background: FOOT_GREEN }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 56px 0 84px' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingRight: '24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.4em',
                textTransform: 'uppercase',
                color: BRASS,
              }}
            >
              <TStar size={15} color={BRASS} />
              <span style={{ display: 'flex' }}>Week {week} · Admit One</span>
              <TStar size={15} color={BRASS} />
            </div>

            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '96px', lineHeight: 1.02, color: CREAM_T, marginTop: '24px' }}>
              This Week&apos;s
            </div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '96px', lineHeight: 1.02, color: BRASS }}>
              Card.
            </div>

            <div
              style={{
                display: 'flex',
                width: '120px',
                height: '3px',
                background: `linear-gradient(90deg, ${BRASS_DEEP}, transparent)`,
                marginTop: '26px',
              }}
            />

            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '29px',
                lineHeight: 1.32,
                color: CREAM_TSOFT,
                marginTop: '20px',
                maxWidth: '470px',
              }}
            >
              Every game in {cut(leagueName, 22)} this week, with the ledger behind it.
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '14px',
                fontWeight: 700,
                letterSpacing: '0.26em',
                textTransform: 'uppercase',
                color: CREAM_TSOFT,
                marginTop: '26px',
              }}
            >
              {games.length} GAME{games.length === 1 ? '' : 'S'} ON THE SLATE · SEE YOURS
            </div>
          </div>

          {/* Right — the stubs */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '452px', gap: '9px' }}>
            {games.map((g, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '11px 16px',
                  background: TICKET,
                  color: TICKET_INK,
                  borderRadius: '3px',
                  borderLeft: `4px solid ${g.gotw ? BRASS : 'rgba(23,35,38,0.25)'}`,
                  boxShadow: '0 10px 22px rgba(0,0,0,0.35)',
                }}
              >
                <span style={{ display: 'flex', width: '166px', fontFamily: 'DMSerif', fontSize: '24px' }}>
                  {cut(g.a.name, 11)}
                </span>
                <span
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    width: '48px',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: '#6b7a7d',
                  }}
                >
                  vs
                </span>
                <span style={{ display: 'flex', width: '166px', justifyContent: 'flex-end', fontFamily: 'DMSerif', fontSize: '24px' }}>
                  {cut(g.b.name, 11)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 84px',
            background: FOOT_GREEN,
            color: BRASS_HI,
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>Form · Projections · The All-Time Ledger</span>
          <span style={{ display: 'flex' }}>{'thesundaychronicle.app'}</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: {
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  )
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
  const projA = c.projected.a.toFixed(1)
  const projB = c.projected.b.toFixed(1)

  const favLine = (() => {
    const sp = Math.abs(c.projected.spread)
    if (sp < 0.5) return "PICK 'EM"
    if (c.projected.favorite === 'a') return `${cut(c.a.name, 12).toUpperCase()} BY ${sp.toFixed(1)}`
    if (c.projected.favorite === 'b') return `${cut(c.b.name, 12).toUpperCase()} BY ${sp.toFixed(1)}`
    return null
  })()

  const lastMeeting = (() => {
    const r = c.h2h.recent[0]
    if (!r) return null
    const a = r.scoreA.toFixed(1)
    const b = r.scoreB.toFixed(1)
    return `${r.year} W${r.week} · ${a}–${b}`
  })()

  // Current run in the series: how many in a row the last winner has taken.
  const streak = (() => {
    const rs = c.h2h.recent ?? []
    const first = rs[0]
    if (!first || first.winner === 't') return null
    let n = 0
    for (const r of rs) {
      if (r.winner !== first.winner) break
      n++
    }
    if (n < 1) return null
    const who = first.winner === 'a' ? c.a.name : c.b.name
    return `${cut(who, 10)} W${n}`
  })()

  const form = (s: Side, mirrored = false) => {
    const parts = [s.record, s.ppg5 ? `${s.ppg5.toFixed(1)} L5` : null, streakStr(s.streak)]
      .filter(Boolean)
    return (mirrored ? parts.reverse() : parts).join('  ·  ')
  }

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
          background: `linear-gradient(155deg, #081109 0%, ${PETROL} 46%, ${PETROL_SOFT} 100%)`,
          color: CREAM_T,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 20% 24%, ${BRASS}1c 0%, transparent 46%), radial-gradient(circle at 84% 86%, ${BRASS_DEEP}26 0%, transparent 44%)`,
          }}
        />

        {/* The ticket */}
        <div
          style={{
            display: 'flex',
            width: '1020px',
            background: TICKET,
            color: TICKET_INK,
            borderRadius: '4px',
            boxShadow: '0 30px 70px rgba(0,0,0,0.6)',
          }}
        >
          {/* Main body */}
          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '30px 34px 26px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: '#6b7a7d',
              }}
            >
              <span style={{ display: 'flex' }}>{cut(leagueName, 24).toUpperCase()}</span>
              <span style={{ display: 'flex', color: BRASS_DEEP }}>
                {c.gotw ? `WEEK ${week} · GAME OF THE WEEK` : `WEEK ${week} PREVIEW`}
              </span>
            </div>

            <div style={{ display: 'flex', height: '2px', background: 'rgba(23,35,38,0.65)', marginTop: '12px' }} />
            <div style={{ display: 'flex', height: '1px', background: 'rgba(23,35,38,0.3)', marginTop: '2px' }} />

            {/* The two sides */}
            <div style={{ display: 'flex', alignItems: 'center', marginTop: '26px' }}>
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: c.a.name.length > 11 ? '52px' : '66px', lineHeight: 1.02 }}>
                  {cut(c.a.name, 14)}
                </span>
                <span
                  style={{
                    display: 'flex',
                    fontSize: '13px',
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                    color: '#5d6c6f',
                    marginTop: '8px',
                  }}
                >
                  {form(c.a)}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '150px' }}>
                <span style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '30px', color: '#8a999c' }}>
                  vs
                </span>
              </div>

              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: c.b.name.length > 11 ? '52px' : '66px', lineHeight: 1.02 }}>
                  {cut(c.b.name, 14)}
                </span>
                <span
                  style={{
                    display: 'flex',
                    fontSize: '13px',
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                    color: '#5d6c6f',
                    marginTop: '8px',
                  }}
                >
                  {form(c.b, true)}
                </span>
              </div>
            </div>

            {/* Projection band */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '22px',
                marginTop: '28px',
                padding: '14px 0',
                borderTop: '1px solid rgba(23,35,38,0.18)',
                borderBottom: '1px solid rgba(23,35,38,0.18)',
              }}
            >
              <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '42px', color: BRASS_DEEP }}>{projA}</span>
              <span
                style={{
                  display: 'flex',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                  color: '#6b7a7d',
                }}
              >
                Projected
              </span>
              <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '42px', color: BRASS_DEEP }}>{projB}</span>
            </div>

            {favLine ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.26em',
                  textTransform: 'uppercase',
                  color: '#5d6c6f',
                  marginTop: '12px',
                }}
              >
                {favLine}
              </div>
            ) : null}
          </div>

          {/* Perforation + stub */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '250px',
              padding: '30px 26px 26px',
              borderLeft: '2px dashed rgba(23,35,38,0.28)',
            }}
          >
            <span
              style={{
                display: 'flex',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: '#6b7a7d',
              }}
            >
              The Ledger
            </span>

            <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '46px', lineHeight: 1.05, marginTop: '10px' }}>
              {c.h2h.meetings > 0 ? `${c.h2h.winsA}–${c.h2h.winsB}` : '·'}
            </span>
            <span
              style={{
                display: 'flex',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#5d6c6f',
                marginTop: '6px',
              }}
            >
              {c.h2h.meetings > 0
                ? `${c.h2h.meetings} meeting${c.h2h.meetings === 1 ? '' : 's'}`
                : 'First meeting'}
            </span>

            {streak ? (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: '16px' }}>
                <span
                  style={{
                    display: 'flex',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.26em',
                    textTransform: 'uppercase',
                    color: '#7b8a7f',
                  }}
                >
                  Current run
                </span>
                <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '22px', marginTop: '3px' }}>
                  {streak}
                </span>
              </div>
            ) : null}

            {lastMeeting ? (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
                <span
                  style={{
                    display: 'flex',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.26em',
                    textTransform: 'uppercase',
                    color: '#6b7a7d',
                  }}
                >
                  Last time
                </span>
                <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '20px', marginTop: '4px' }}>
                  {lastMeeting}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Foot */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '1200px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 84px 26px',
            color: BRASS_HI,
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>Form · Projections · The All-Time Ledger</span>
          <span style={{ display: 'flex' }}>thesundaychronicle.app</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: {
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  )
}

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
          Previews return when the season does, The Sunday Chronicle
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
