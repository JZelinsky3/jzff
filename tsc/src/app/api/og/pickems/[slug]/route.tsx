// OG image generator for the live pick'ems page.
// URL: /api/og/pickems/<slug>
//
// Renders a 1200x630 leaderboard card for the league's pick'ems pool — week #,
// the top three pickers with their season record, and a "picks open" prompt
// when no week has been decided yet. Offseason or UDFA (free) leagues get a
// quiet fallback so shared links never lose their preview.
//
// CDN-cached per slug; busted when the league bundle's `league-<id>` tag is
// revalidated by sync.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPickemsState } from '@/lib/pickems'

export const runtime = 'nodejs'

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

const GOLD = '#e8c889'

function renderLeaderboardCard(
  leagueName: string,
  currentWeek: number,
  rows: Row[],
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const gridiron = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path d="M0 40h80M40 0v80" stroke="#1e1e1e" stroke-width="1"/></svg>`
  )
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
            background: `radial-gradient(circle at 12% 18%, ${GOLD}26 0%, transparent 50%), radial-gradient(circle at 88% 88%, ${GOLD}14 0%, transparent 50%)`,
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
            color: GOLD,
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>{leagueName.toUpperCase()} · WEEK {currentWeek} PICK&apos;EMS</span>
          <span style={{ display: 'flex', color: '#9ca3af', letterSpacing: '0.32em' }}>
            THE SUNDAY CHRONICLE
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: '38px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontSize: '78px',
              lineHeight: 1,
              color: '#f3f4f6',
            }}
          >
            {hasRows ? 'The Pool' : 'Picks are open.'}
          </div>
          {hasRows && (
            <div
              style={{
                display: 'flex',
                marginTop: '10px',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '26px',
                color: '#9ca3af',
              }}
            >
              Standings through Week {currentWeek - 1}
            </div>
          )}
          {!hasRows && (
            <div
              style={{
                display: 'flex',
                marginTop: '10px',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '26px',
                color: '#9ca3af',
              }}
            >
              Lock in your Week {currentWeek} picks before kickoff
            </div>
          )}
        </div>

        {/* Leaderboard */}
        {hasRows && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              padding: '40px 96px 0',
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
            bottom: 28,
            left: 56,
            right: 56,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            color: '#9ca3af',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          {hasRows ? (
            <>
              <span style={{ display: 'flex' }}>
                LEADER · {leader!.name.toUpperCase()} · {pct}% CORRECT
              </span>
              <span style={{ display: 'flex' }}>
                {rows.length} PICKER{rows.length === 1 ? '' : 'S'}
              </span>
            </>
          ) : (
            <>
              <span style={{ display: 'flex' }}>EVERY MATCHUP · HIGHEST · LOWEST</span>
              <span style={{ display: 'flex' }}>NO LOGIN REQUIRED</span>
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
  const accent = idx === 0 ? GOLD : '#d1d5db'
  return (
    <div
      key={`${r.name}-${idx}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '28px',
        padding: '14px 26px',
        border: `1px solid ${idx === 0 ? `${GOLD}88` : '#272727'}`,
        background: idx === 0 ? `${GOLD}10` : 'rgba(20,20,20,0.55)',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: '64px',
          fontFamily: 'JetBrains',
          fontWeight: 700,
          fontSize: '20px',
          letterSpacing: '0.22em',
          color: accent,
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
          color: '#f3f4f6',
        }}
      >
        {r.name}
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: 'JetBrains',
          fontWeight: 700,
          fontSize: '30px',
          letterSpacing: '0.06em',
          color: accent,
        }}
      >
        {r.right}<span style={{ display: 'flex', color: '#6b7280' }}>-</span>{r.wrong}
      </div>
    </div>
  )
}

function renderQuietCard(
  leagueName: string,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
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
            color: GOLD,
            textTransform: 'uppercase',
            marginBottom: '26px',
          }}
        >
          {leagueName.toUpperCase()} · PICK&apos;EMS
        </div>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '84px', lineHeight: 1 }}>
          The pool is closed.
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
          Pick&apos;ems opens when the season does — The Sunday Chronicle
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
