// OG image generator for the Trade Desk's Rumor Mill.
// URL: /api/og/mill/<slug>   (?scene=column|quiet forces a variant)
//
// The Mill used to share the generic stamped league cover, on the theory
// that it had "no single deal to feature". It does: the column's own
// headlines ARE the hook. Nobody clicks a link that says "The Rumor Mill";
// they click one that says a specific player is on the move.
//
// Two scenes:
//   • COLUMN  — this week's slate exists: lead headline set as a scandal
//     sheet splash, the next two teased under it as a rumor list.
//   • QUIET   — no column yet, or the deadline has passed and the desk is
//     closed. A "the desk is working" plate instead of a broken card.
//
// Palette is the Mill's own oxblood + rose from rumor-mill.css, so the
// preview reads as a continuation of the page, not a sibling of the
// Grader's aubergine.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

// Straight off rumor-mill.css :root.
const BG        = '#1c0e10'
const BG_DEEP   = '#140a0b'
const CARD      = '#2c161a'
const LINE      = '#553036'
const MUTE      = '#9c7672'
const TEXT      = '#f7e9dd'
const ROSE      = '#de8a6b'
const ROSE_SOFT = '#e89a7a'
const GOLD      = '#e8c889'
const NEWSPRINT = '#efe3d4'
const INK       = '#2a1418'
const INK_SOFT  = '#6b4a44'

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
type Fonts = Awaited<ReturnType<typeof loadFonts>>

type MockTradeLite = { headline?: string }
type MocksPayload = {
  nflWeek?: number | null
  trades?: MockTradeLite[]
  deskClosed?: boolean
}

// The column is keyed by ISO calendar week, so "the current column" is
// simply the newest row this league has. Reading the newest rather than
// computing this week's key means a link shared on Tuesday still previews
// the column it points at.
async function loadColumn(leagueId: string): Promise<MocksPayload | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('trade_desk_mock_trades')
    .select('payload')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ payload: MocksPayload }>()
  return data?.payload ?? null
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const scene = new URL(req.url).searchParams.get('scene')

  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, name, slug, published_at')
    .eq('slug', slug)
    .maybeSingle()
  if (!league || !league.published_at) {
    return new Response('Not found', { status: 404 })
  }

  const payload = scene === 'quiet' ? null : await loadColumn(league.id as string)
  const headlines = (payload?.trades ?? [])
    .map((t) => (typeof t.headline === 'string' ? t.headline.trim() : ''))
    .filter((h) => h.length > 0)

  const fonts = await loadFonts()
  if (scene === 'column' && headlines.length === 0) {
    // Forced preview with nothing stored: show the layout with stand-ins
    // rather than silently falling through to the quiet card.
    return renderColumn(league.name as string, payload?.nflWeek ?? null, [
      'The deadline deal nobody saw coming',
      'Two contenders circle the same running back',
      'A quiet buy-low that could swing the season',
    ], fonts)
  }
  if (headlines.length === 0 || payload?.deskClosed) {
    return renderQuiet(league.name as string, !!payload?.deskClosed, fonts)
  }
  return renderColumn(league.name as string, payload?.nflWeek ?? null, headlines, fonts)
}

// Shared room: oxblood field, rose bloom at the top, deep vignette below.
function scandalSheet(children: React.ReactNode) {
  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: BG,
        fontFamily: 'JetBrains',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background: `radial-gradient(ellipse 70% 45% at 50% -8%, rgba(222,138,107,0.18) 0%, rgba(222,138,107,0) 62%), linear-gradient(180deg, #241316 0%, ${BG_DEEP} 100%)`,
        }}
      />
      {children}
    </div>
  )
}

/* ============================================================
   COLUMN — the week's slate, led by its own best headline.
   ============================================================ */
function renderColumn(
  leagueName: string,
  nflWeek: number | null,
  headlines: string[],
  fonts: Fonts,
) {
  const lead = headlines[0]
  const rest = headlines.slice(1, 3)
  // The splash is set in one size for short headlines and a smaller one
  // for long, because satori cannot shrink text to fit a box.
  const leadSize = lead.length > 46 ? 64 : lead.length > 32 ? 76 : 88

  return new ImageResponse(
    scandalSheet(
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '1010px',
          padding: '34px 54px 30px',
          background: `linear-gradient(180deg, #f4ead9, ${NEWSPRINT})`,
          borderRadius: '3px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.55), 0 40px 90px rgba(0,0,0,0.55)',
          color: INK,
          position: 'relative',
          transform: 'rotate(-0.5deg)',
        }}
      >
        {/* Corner tab, same idiom as the Grader's */}
        <div
          style={{
            position: 'absolute',
            top: '-18px',
            right: '-14px',
            display: 'flex',
            background: ROSE,
            color: '#2a1418',
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            padding: '10px 20px',
            transform: 'rotate(2deg)',
            boxShadow: '0 6px 14px rgba(0,0,0,0.45)',
          }}
        >
          Unconfirmed
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '14px',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: INK_SOFT,
          }}
        >
          <span style={{ display: 'flex' }}>{leagueName.toUpperCase()}</span>
          <span style={{ display: 'flex' }}>
            {nflWeek ? `Week ${nflWeek}` : 'This week'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '8px',
            fontFamily: 'DMSerif',
            fontSize: '46px',
            letterSpacing: '0.04em',
            color: INK,
          }}
        >
          The Rumor Mill
        </div>
        <div style={{ display: 'flex', marginTop: '12px', height: '3px', background: 'rgba(60,30,30,0.55)' }} />
        <div style={{ display: 'flex', marginTop: '3px', height: '1px', background: 'rgba(60,30,30,0.55)' }} />

        {/* The splash */}
        <div
          style={{
            display: 'flex',
            marginTop: '26px',
            fontFamily: 'DMSerif',
            fontSize: `${leadSize}px`,
            lineHeight: 1.02,
            color: INK,
          }}
        >
          {lead}
        </div>

        {/* Two more rumors, set as a column of leads */}
        {rest.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '22px', gap: '10px' }}>
            {rest.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
                <span
                  style={{
                    display: 'flex',
                    fontSize: '13px',
                    fontWeight: 700,
                    letterSpacing: '0.22em',
                    color: '#a8503c',
                  }}
                >
                  {['II', 'III'][i]}
                </span>
                <span
                  style={{
                    display: 'flex',
                    fontFamily: 'DMSerif',
                    fontStyle: 'italic',
                    fontSize: '25px',
                    color: INK_SOFT,
                  }}
                >
                  {h.length > 58 ? `${h.slice(0, 56)}…` : h}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            // NOT margin-top:auto. The card has no fixed height, so auto
            // collapses to nothing and the dashed rule landed on top of the
            // last rumor line.
            marginTop: '26px',
            paddingTop: '16px',
            borderTop: '1px dashed rgba(60,30,30,0.32)',
            fontSize: '14px',
            letterSpacing: '0.26em',
            textTransform: 'uppercase',
            color: INK_SOFT,
          }}
        >
          <span style={{ display: 'flex' }}>Nobody proposed these</span>
          <span style={{ display: 'flex', color: '#a8503c' }}>The Trade Desk · The Rumor Mill</span>
        </div>
      </div>,
    ),
    { width: 1200, height: 630, fonts },
  )
}

/* ============================================================
   QUIET — no column on file, or the deadline has closed the desk.
   ============================================================ */
function renderQuiet(leagueName: string, deskClosed: boolean, fonts: Fonts) {
  return new ImageResponse(
    scandalSheet(
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '820px',
          padding: '48px 60px 52px',
          background: CARD,
          border: `1px solid ${LINE}`,
          borderRadius: '4px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.5), 0 40px 90px rgba(0,0,0,0.5)',
          position: 'relative',
          transform: 'rotate(-0.6deg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.4em',
            textTransform: 'uppercase',
            color: ROSE_SOFT,
          }}
        >
          {deskClosed ? 'Desk closed' : 'The Rumor Mill'}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '24px',
            fontFamily: 'DMSerif',
            fontSize: '58px',
            lineHeight: 1.06,
            color: TEXT,
            textAlign: 'center',
          }}
        >
          {deskClosed
            ? 'The deadline has passed.'
            : 'The desk is still working.'}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '18px',
            fontFamily: 'DMSerif',
            fontStyle: 'italic',
            fontSize: '25px',
            color: MUTE,
            textAlign: 'center',
          }}
        >
          {deskClosed
            ? 'The Mill resumes when trades reopen.'
            : 'A fresh slate of mock deals lands every week.'}
        </div>
        <div
          style={{
            display: 'flex',
            gap: '22px',
            marginTop: '34px',
            paddingTop: '22px',
            borderTop: `1px solid ${LINE}`,
            fontSize: '14px',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: MUTE,
          }}
        >
          <span style={{ display: 'flex' }}>{leagueName}</span>
          <span style={{ display: 'flex', color: GOLD }}>·</span>
          <span style={{ display: 'flex' }}>The Trade Desk</span>
        </div>
      </div>,
    ),
    { width: 1200, height: 630, fonts },
  )
}
