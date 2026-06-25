// OG image generator for the live pick'ems page.
// URL: /api/og/pickems/<slug>
//
// "After-Hours Sportsbook" — velvet plum surface, hot magenta + champagne
// neon. Same palette as pickems.css so the share preview reads as a
// continuation of the page, not a generic dark card. Surfaces the week,
// a leaderboard of the top three pickers (or a "picks are open" prompt
// when no week has been decided), and a clear call to action.
//
// CDN-cached per slug; busted when the league bundle's `league-<id>` tag
// is revalidated by sync.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPickemsState } from '@/lib/pickems'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

// Pickems palette — kept in sync with pickems.css :root tokens.
const PLUM        = '#160b1d'
const PLUM_SOFT   = '#1c1026'
const CARD        = '#241531'
const CARD_HI     = '#341f44'
const LINE        = '#3a2549'
const MAGENTA     = '#ff3d8b'
const MAGENTA_HI  = '#ff6aa6'
const MAGENTA_DEEP = '#b8205f'
const CHAMPAGNE   = '#f0c463'
const CHAMPAGNE_HI = '#f9d98a'
const CHALK       = '#f5ecf5'
const CHALK_MUTE  = '#8e7d9d'

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

type Row = { name: string; right: number; wrong: number }

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
  const state = await getPickemsState(slug)

  if (!state || state.status !== 'ok') {
    return renderQuietCard(league.name, fonts)
  }

  const rows = buildLeaderboard(state)
  return renderLeaderboardCard(league.name, state.currentWeek, rows, fonts)
}

// Mirror of the template's renderRecords() scoring: count correct/incorrect
// picks across all weeks with known winners, excluding the picker's own game.
// Sort by right desc, wrong asc, then name.
function buildLeaderboard(state: Extract<Awaited<ReturnType<typeof getPickemsState>>, { status: 'ok' }>): Row[] {
  const byUser = new Map<string, { name: string; teamId: string | null; right: number; wrong: number }>()
  for (const p of state.profiles) {
    byUser.set(p.profileId, { name: p.name, teamId: p.teamId, right: 0, wrong: 0 })
  }
  for (const w of state.weeks) {
    if (!w.winners) continue
    for (const pid of Object.keys(state.submissions)) {
      const sub = state.submissions[pid]?.[w.id]
      if (!sub) continue
      const row = byUser.get(pid)
      if (!row) continue
      for (const mid of Object.keys(sub.picks ?? {})) {
        const win = w.winners[mid]
        if (!win) continue
        const m = w.matchups.find((x) => x.id === mid)
        if (row.teamId && m && (m.home === row.teamId || m.away === row.teamId)) continue
        if (sub.picks[mid] === win) row.right++
        else row.wrong++
      }
    }
  }
  const rows = Array.from(byUser.values())
    .filter((r) => r.right + r.wrong > 0)
    .map((r) => ({ name: r.name, right: r.right, wrong: r.wrong }))
  rows.sort((a, b) => b.right - a.right || a.wrong - b.wrong || a.name.localeCompare(b.name))
  return rows
}

// Common background layers (plum gradient + faint diamond grid + corner
// magenta + champagne glows). Kept on every card so the share preview is
// instantly recognizable as a pick'ems link.
function backgroundLayers() {
  const diamond = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><path d="M22 0 44 22 22 44 0 22Z" fill="none" stroke="${MAGENTA_DEEP}" stroke-opacity="0.18" stroke-width="0.9"/></svg>`
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
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background:
            `radial-gradient(circle at 10% 0%, ${MAGENTA}38 0%, transparent 45%),` +
            `radial-gradient(circle at 92% 100%, ${CHAMPAGNE}26 0%, transparent 50%),` +
            `radial-gradient(circle at 50% 50%, ${PLUM_SOFT}cc 0%, transparent 70%)`,
        }}
      />
      {/* Neon top + bottom rules — magenta over champagne gradient */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, display: 'flex', background: `linear-gradient(90deg, transparent 0%, ${MAGENTA} 30%, ${CHAMPAGNE} 70%, transparent 100%)` }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, display: 'flex', background: `linear-gradient(90deg, transparent 0%, ${CHAMPAGNE} 30%, ${MAGENTA} 70%, transparent 100%)`, opacity: 0.7 }} />
    </>
  )
}

function renderLeaderboardCard(
  leagueName: string,
  currentWeek: number,
  rows: Row[],
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const hasRows = rows.length > 0
  const top = rows.slice(0, 3)
  const leader = top[0] ?? null
  const totalPicks = leader ? leader.right + leader.wrong : 0
  const pct = leader && totalPicks > 0 ? Math.round((leader.right / totalPicks) * 100) : 0

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: PLUM,
          color: CHALK,
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
            padding: '38px 60px 0',
            fontSize: '17px',
            fontWeight: 700,
            letterSpacing: '0.32em',
            color: CHAMPAGNE,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ display: 'flex', width: 10, height: 10, borderRadius: 999, background: MAGENTA, boxShadow: `0 0 18px ${MAGENTA}` }} />
            {leagueName.toUpperCase()}
          </span>
          <span style={{ display: 'flex', color: CHALK_MUTE, letterSpacing: '0.34em' }}>
            THE SUNDAY CHRONICLE
          </span>
        </div>

        {/* Headline lockup */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: '34px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'JetBrains',
              fontWeight: 700,
              fontSize: '20px',
              letterSpacing: '0.42em',
              color: MAGENTA_HI,
              textTransform: 'uppercase',
              marginBottom: '12px',
            }}
          >
            ★ WEEK {currentWeek} PICK&apos;EMS ★
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontStyle: 'italic',
              fontSize: '96px',
              lineHeight: 1,
              color: CHALK,
              textShadow: `0 0 28px ${MAGENTA}66`,
            }}
          >
            {hasRows ? 'The Pool.' : 'Picks are open.'}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: '14px',
              fontFamily: 'DMSerif',
              fontSize: '28px',
              color: CHAMPAGNE_HI,
            }}
          >
            {hasRows
              ? `Standings through Week ${currentWeek - 1}`
              : `Lock your Week ${currentWeek} picks before kickoff`}
          </div>
        </div>

        {/* Leaderboard */}
        {hasRows && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              padding: '36px 110px 0',
              zIndex: 2,
            }}
          >
            {top.map((r, i) => leaderRow(r, i))}
          </div>
        )}

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
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.3em',
            color: CHALK_MUTE,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          {hasRows ? (
            <>
              <span style={{ display: 'flex', color: CHAMPAGNE }}>
                LEADER · {leader!.name.toUpperCase()} · {pct}% RIGHT
              </span>
              <span style={{ display: 'flex' }}>
                {rows.length} PICKER{rows.length === 1 ? '' : 'S'} · NO LOGIN
              </span>
            </>
          ) : (
            <>
              <span style={{ display: 'flex', color: CHAMPAGNE }}>
                EVERY MATCHUP · HIGHEST · LOWEST
              </span>
              <span style={{ display: 'flex' }}>TAP IN · NO LOGIN</span>
            </>
          )}
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

function leaderRow(r: Row, idx: number) {
  const place = idx === 0 ? '1ST' : idx === 1 ? '2ND' : '3RD'
  const isLead = idx === 0
  const accent = isLead ? CHAMPAGNE_HI : CHALK
  const placeColor = isLead ? PLUM : MAGENTA_HI
  return (
    <div
      key={`${r.name}-${idx}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '26px',
        padding: '14px 26px',
        border: `1px solid ${isLead ? CHAMPAGNE : LINE}`,
        background: isLead
          ? `linear-gradient(90deg, ${MAGENTA_DEEP}66 0%, ${CARD_HI} 70%)`
          : CARD,
        boxShadow: isLead ? `0 0 24px ${MAGENTA}40, inset 0 0 0 1px ${MAGENTA}30` : 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '60px',
          height: '34px',
          background: isLead ? CHAMPAGNE : 'transparent',
          border: isLead ? `1px solid ${CHAMPAGNE_HI}` : `1px solid ${MAGENTA_DEEP}`,
          fontFamily: 'JetBrains',
          fontWeight: 700,
          fontSize: '17px',
          letterSpacing: '0.22em',
          color: placeColor,
        }}
      >
        {place}
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          fontFamily: 'DMSerif',
          fontSize: '44px',
          lineHeight: 1,
          color: CHALK,
          overflow: 'hidden',
        }}
      >
        {r.name}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '4px',
          fontFamily: 'JetBrains',
          fontWeight: 700,
          fontSize: '32px',
          letterSpacing: '0.04em',
          color: accent,
        }}
      >
        <span style={{ display: 'flex' }}>{r.right}</span>
        <span style={{ display: 'flex', color: CHALK_MUTE, fontSize: '24px' }}>—</span>
        <span style={{ display: 'flex', color: CHALK_MUTE }}>{r.wrong}</span>
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
          background: PLUM,
          color: CHALK,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        {backgroundLayers()}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            fontSize: '17px',
            fontWeight: 700,
            letterSpacing: '0.4em',
            color: CHAMPAGNE,
            textTransform: 'uppercase',
            marginBottom: '28px',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex', width: 10, height: 10, borderRadius: 999, background: MAGENTA, boxShadow: `0 0 18px ${MAGENTA}` }} />
          {leagueName.toUpperCase()} · PICK&apos;EMS
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'DMSerif',
            fontStyle: 'italic',
            fontSize: '96px',
            lineHeight: 1,
            zIndex: 2,
            textShadow: `0 0 28px ${MAGENTA}66`,
          }}
        >
          The pool is closed.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '22px',
            fontFamily: 'DMSerif',
            fontSize: '28px',
            color: CHAMPAGNE_HI,
            zIndex: 2,
          }}
        >
          Pick&apos;ems opens when the season does — The Sunday Chronicle
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
