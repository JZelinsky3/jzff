// OG image generator for individual rivalry pages.
// URL: /api/og/rivalry/<slug>/<rivalryId>
//
// Renders a 1200x630 "fight bill": both managers as monogram medallions
// either side of the series score, a tale of the tape underneath, and the
// meeting history along the foot. Oxblood and cream on near-black, the
// same room as the Rivalries chapter card.
//
// The theme from `pickRivalryTheme` still drives the accent and the stamp
// label, because it is chosen from rivalry STATS (blowout vs deadlocked vs
// high-scoring vs ancient feud) and is real signal. Its emoji character
// pairs are deliberately NOT rendered: emoji read as cheap next to the
// rest of the site.
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
  last_meeting: { year: number; week: number; a_score?: number; b_score?: number } | null
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
  // Only the theme is used; its emoji `pair` is intentionally ignored.
  const { theme } = pickRivalryTheme(rivalry, themeCtx)
  const fonts = await loadFonts()

  return renderRivalryCard(league.name, rivalry, theme, fonts)
}


const INK        = '#140d0b'
const INK_SOFT   = '#1d1310'
const CREAM      = '#f4ebd8'
const CREAM_SOFT = '#c9c0ad'
const CREAM_MUTE = '#96705f'
const OXBLOOD    = '#c86848'
const OXBLOOD_DEEP = '#7e3a26'
const DOMAIN     = 'thesundaychronicle.app'

function Star({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2z" />
    </svg>
  )
}

function monogram(name: string): string {
  return (
    (name ?? '')
      .replace(/[^A-Za-z\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '★'
  )
}

function clip(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`
}

function renderRivalryCard(
  leagueName: string,
  rv: Rivalry,
  theme: ReturnType<typeof pickRivalryTheme>['theme'],
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const a = rv.manager_a
  const b = rv.manager_b
  const aWins = a.wins
  const bWins = b.wins
  const aLeads = aWins > bWins
  const bLeads = bWins > aWins
  const isDeadlocked = rv.is_deadlocked && rv.total_meetings > 0
  // The theme palette is web red/amber; warm it into the oxblood room so
  // the accent reads editorial rather than alert-box.
  const ACCENT_MAP: Record<string, string> = {
    '#ef4444': '#c4553a',
    '#dc2626': '#b8462f',
    '#d97706': '#c07a2e',
    '#9ca3af': '#a08d80',
    '#e8c889': '#d8a962',
  }
  const accent = ACCENT_MAP[theme.accent] ?? theme.accent

  const verdict = rv.total_meetings === 0
    ? 'Never met'
    : isDeadlocked
      ? 'Dead level'
      : `${clip(rv.leader_name ?? '', 12)} leads`

  const meetingsLine = rv.total_meetings === 0
    ? 'NO MEETINGS ON RECORD'
    : [
        rv.first_meeting_year ? `FIRST MET ${rv.first_meeting_year}` : null,
        `${rv.total_meetings} MEETING${rv.total_meetings === 1 ? '' : 'S'}`,
        rv.last_meeting ? `LAST ${rv.last_meeting.year} W${rv.last_meeting.week}` : null,
      ].filter(Boolean).join('  ·  ')

  // Tale of the tape. Each row is [left, label, right]; the winning side
  // of each row is tinted so the card can be read at a glance.
  const lm = rv.last_meeting
  const lmA = typeof lm?.a_score === 'number' ? lm.a_score : null
  const lmB = typeof lm?.b_score === 'number' ? lm.b_score : null
  const lmWinner: 'a' | 'b' | null =
    lmA == null || lmB == null ? null : lmA === lmB ? null : lmA > lmB ? 'a' : 'b'

  const tape: Array<[string, string, string, 'a' | 'b' | null]> = [
    // The series score already sits above, so a Wins row would just repeat
    // it. The last meeting is the fact the card was missing.
    [
      lmA != null ? lmA.toFixed(1) : '—',
      'Last game',
      lmB != null ? lmB.toFixed(1) : '—',
      lmWinner,
    ],
    [
      a.avg_ppg ? a.avg_ppg.toFixed(1) : '—',
      'Avg PPG',
      b.avg_ppg ? b.avg_ppg.toFixed(1) : '—',
      a.avg_ppg === b.avg_ppg ? null : a.avg_ppg > b.avg_ppg ? 'a' : 'b',
    ],
    [
      a.high_score ? a.high_score.score.toFixed(1) : '—',
      'Best',
      b.high_score ? b.high_score.score.toFixed(1) : '—',
      !a.high_score || !b.high_score
        ? null
        : a.high_score.score === b.high_score.score
          ? null
          : a.high_score.score > b.high_score.score
            ? 'a'
            : 'b',
    ],
  ]

  const side = (name: string, leads: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '300px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '104px',
          height: '104px',
          borderRadius: '104px',
          border: `2px solid ${leads ? accent : OXBLOOD_DEEP}`,
          background: leads ? `${accent}1a` : 'rgba(200,104,72,0.06)',
          boxShadow: leads ? `0 0 0 6px ${accent}12` : 'none',
          fontFamily: 'DMSerif',
          fontSize: '42px',
          color: leads ? accent : CREAM_SOFT,
        }}
      >
        {monogram(name)}
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: 'DMSerif',
          fontSize: '44px',
          lineHeight: 1.05,
          color: CREAM,
          marginTop: '16px',
        }}
      >
        {clip(name, 12)}
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
          background: `linear-gradient(155deg, ${INK} 0%, #17100d 46%, ${INK_SOFT} 100%)`,
          color: CREAM,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 20% 26%, ${accent}20 0%, transparent 46%), radial-gradient(circle at 82% 84%, ${OXBLOOD_DEEP}2e 0%, transparent 46%)`,
          }}
        />

        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '26px 60px 0',
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: CREAM_MUTE,
          }}
        >
          <span style={{ display: 'flex' }}>{clip(leagueName, 26).toUpperCase()} · HEAD-TO-HEAD</span>
          <span style={{ display: 'flex' }}>THE SUNDAY CHRONICLE</span>
        </div>

        {/* Theme stamp */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '18px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '7px 20px',
              border: `1px solid ${accent}`,
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: accent,
            }}
          >
            <Star size={12} color={accent} />
            <span style={{ display: 'flex' }}>{clip(rv.name || theme.label, 26)}</span>
            <Star size={12} color={accent} />
          </div>
        </div>

        {/* Bill + tape, centred in the space between bar and foot. */}
        <div style={{ display: 'flex', flexGrow: 1, flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {side(a.name, aLeads)}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '220px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '76px', lineHeight: 1, color: aLeads ? accent : CREAM }}>
                {aWins}
              </span>
              <span
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontSize: '58px',
                  lineHeight: 1,
                  color: CREAM_MUTE,
                  padding: '0 6px',
                }}
              >
                &#8211;
              </span>
              <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '76px', lineHeight: 1, color: bLeads ? accent : CREAM }}>
                {bWins}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '22px',
                color: CREAM_MUTE,
                marginTop: '8px',
              }}
            >
              {verdict}
            </div>
          </div>

          {side(b.name, bLeads)}
        </div>

        {/* Tale of the tape */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '760px',
            marginTop: '30px',
            marginLeft: '220px',
          }}
        >
          {tape.map(([left, label, right, winner], i) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '9px 0',
                borderTop: i === 0 ? `1px solid rgba(200,104,72,0.22)` : 'none',
                borderBottom: `1px solid rgba(200,104,72,0.22)`,
              }}
            >
              <span
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  width: '290px',
                  fontSize: '20px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: winner === 'a' ? accent : CREAM_SOFT,
                }}
              >
                {left}
              </span>
              <span
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  width: '180px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.28em',
                  textTransform: 'uppercase',
                  color: CREAM_MUTE,
                }}
              >
                {label}
              </span>
              <span
                style={{
                  display: 'flex',
                  width: '290px',
                  fontSize: '20px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: winner === 'b' ? accent : CREAM_SOFT,
                }}
              >
                {right}
              </span>
            </div>
          ))}
        </div>
        </div>

        {/* Foot */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 60px 26px',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.26em',
            textTransform: 'uppercase',
            color: CREAM_MUTE,
          }}
        >
          <span style={{ display: 'flex' }}>{meetingsLine}</span>
          <span style={{ display: 'flex', color: OXBLOOD }}>{DOMAIN}</span>
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
