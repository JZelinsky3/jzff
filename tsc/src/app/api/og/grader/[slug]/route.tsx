// OG image generator for the Trade Desk Grader page.
// URL: /api/og/grader/<slug>
//
// Two scenes, chosen by the wire itself:
//   • A deal cleared in the last 24h → the SEALED DISPATCH: a manila
//     envelope under the wax seal, "a deal crossed the wire today" —
//     and deliberately nothing about who or what, so the link tease
//     matches the on-page reveal.
//   • Quiet wire → the Transaction Times front page: masthead, double
//     rule, giant headline, grade stamps inked in the corner.
//
// Palette mirrors the grader page (wire-room dark, cream stock, siren
// red, desk amber) so the share preview reads as a continuation of the
// page, the same way the almanac chapter cards do.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

// Grader palette — kept in sync with grader/index.html :root tokens.
const WIRE_BG    = '#101216'
const WIRE_DEEP  = '#0a0c0f'
const CREAM      = '#f0e8d2'
const CREAM_2    = '#e6dcc0'
const MANILA     = '#efe6cd'
const MANILA_2   = '#e2d5b0'
const SIREN      = '#d5382b'
const SIREN_DIM  = '#8e2820'
const AMBER      = '#d9a441'
const INK        = '#2c2417'
const INK_SOFT   = '#554833'
const INK_FAINT  = '#77684e'
const GRADE_A    = '#2e6b4f'
const GRADE_B    = '#3e639a'

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

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [{ data: fresh }, { count }] = await Promise.all([
    db
      .from('trades')
      .select('id')
      .eq('league_id', league.id)
      .eq('status', 'completed')
      .gte('executed_at', dayAgo)
      .limit(1),
    db
      .from('trades')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', league.id)
      .eq('status', 'completed'),
  ])

  const fonts = await loadFonts()
  return fresh && fresh.length > 0
    ? renderSealedCard(league.name, fonts)
    : renderFrontPageCard(league.name, count ?? 0, fonts)
}

// Shared wire-room backdrop: near-black, a siren glow bleeding in from
// the top, vignette at the foot — same body treatment as the page.
function wireRoom(children: React.ReactNode) {
  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: WIRE_BG,
        fontFamily: 'JetBrains',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background: `radial-gradient(ellipse 70% 45% at 50% -8%, rgba(213,56,43,0.16) 0%, rgba(213,56,43,0) 60%), linear-gradient(180deg, #12151a 0%, ${WIRE_DEEP} 100%)`,
        }}
      />
      {children}
    </div>
  )
}

function WireChip({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '15px',
        fontWeight: 700,
        letterSpacing: '0.38em',
        textTransform: 'uppercase',
        color: SIREN,
        border: `1px solid rgba(213,56,43,0.45)`,
        borderRadius: '999px',
        padding: '10px 22px 10px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: '11px',
          height: '11px',
          borderRadius: '50%',
          background: SIREN,
          boxShadow: `0 0 12px rgba(213,56,43,0.9)`,
        }}
      />
      <span style={{ display: 'flex' }}>{text}</span>
    </div>
  )
}

/* ============================================================
   SEALED DISPATCH — a deal cleared today. Envelope, wax seal,
   and not one detail more.
   ============================================================ */
function renderSealedCard(leagueName: string, fonts: Fonts) {
  return new ImageResponse(
    wireRoom(
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '26px',
        }}
      >
        <WireChip text="Breaking · on the wire" />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '820px',
            padding: '40px 60px 44px',
            background: `linear-gradient(180deg, ${MANILA}, ${MANILA_2})`,
            borderRadius: '4px',
            border: `1px solid rgba(60,40,20,0.35)`,
            boxShadow: '0 4px 10px rgba(0,0,0,0.55), 0 40px 90px rgba(0,0,0,0.5)',
            position: 'relative',
          }}
        >
          {/* string-and-button envelope hatching */}
          <div
            style={{
              position: 'absolute',
              top: '12px',
              bottom: '12px',
              left: '12px',
              right: '12px',
              display: 'flex',
              border: '1px dashed rgba(60,40,20,0.35)',
              borderRadius: '3px',
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: '17px',
              fontWeight: 700,
              letterSpacing: '0.42em',
              textTransform: 'uppercase',
              color: SIREN_DIM,
            }}
          >
            Sealed dispatch
          </div>
          {/* wax seal */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '104px',
              height: '104px',
              marginTop: '26px',
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, #e05244, ${SIREN} 55%, #99271d)`,
              boxShadow: '0 5px 14px rgba(0,0,0,0.35)',
              color: '#fdf3e4',
              fontFamily: 'DMSerif',
              fontSize: '40px',
            }}
          >
            ✦
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: '26px',
              fontFamily: 'DMSerif',
              fontSize: '58px',
              lineHeight: 1.05,
              color: INK,
              textAlign: 'center',
            }}
          >
            A deal crossed the wire today.
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: '16px',
              fontFamily: 'DMSerif',
              fontStyle: 'italic',
              fontSize: '25px',
              color: INK_SOFT,
            }}
          >
            Terms under seal until you break it.
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: '30px',
              gap: '26px',
              fontSize: '15px',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: INK_FAINT,
            }}
          >
            <span style={{ display: 'flex' }}>{leagueName}</span>
            <span style={{ display: 'flex' }}>·</span>
            <span style={{ display: 'flex' }}>The Transaction Times</span>
          </div>
        </div>
      </div>,
    ),
    { width: 1200, height: 630, fonts },
  )
}

/* ============================================================
   FRONT PAGE — the quiet-wire card. Transaction Times masthead,
   double rule, big headline, grade stamps inked in the corner.
   ============================================================ */
function Stamp({ grade, color, rotate, top, right }: {
  grade: string
  color: string
  rotate: string
  top: string
  right: string
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        right,
        display: 'flex',
        padding: '6px 18px',
        border: `5px solid ${color}`,
        borderRadius: '5px',
        color,
        fontSize: '44px',
        fontWeight: 700,
        transform: `rotate(${rotate})`,
        opacity: 0.8,
      }}
    >
      {grade}
    </div>
  )
}

function renderFrontPageCard(leagueName: string, tradeCount: number, fonts: Fonts) {
  const foot = tradeCount > 0
    ? `${tradeCount} deal${tradeCount === 1 ? '' : 's'} on the wire`
    : 'Watching the wire'
  return new ImageResponse(
    wireRoom(
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '1020px',
          padding: '38px 60px 34px',
          background: `linear-gradient(180deg, #f2ecda, ${CREAM_2})`,
          borderRadius: '3px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.55), 0 40px 90px rgba(0,0,0,0.5)',
          color: INK,
          position: 'relative',
        }}
      >
        {/* red corner tag, like the page's "Deal of the season" */}
        <div
          style={{
            position: 'absolute',
            top: '26px',
            right: '-12px',
            display: 'flex',
            background: SIREN,
            color: '#fdf3e4',
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            padding: '10px 20px',
            transform: 'rotate(2deg)',
            boxShadow: '0 6px 14px rgba(0,0,0,0.4)',
          }}
        >
          The Grader
        </div>
        <Stamp grade="A-" color={GRADE_A} rotate="8deg" top="150px" right="60px" />
        <Stamp grade="B+" color={GRADE_B} rotate="-6deg" top="238px" right="96px" />

        {/* masthead */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '14px',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: INK_FAINT,
          }}
        >
          <span style={{ display: 'flex' }}>{leagueName.toUpperCase()}</span>
          <span style={{ display: 'flex' }}>Official wire edition</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '10px',
            fontFamily: 'DMSerif',
            fontSize: '52px',
            letterSpacing: '0.04em',
            color: INK,
          }}
        >
          The Transaction Times
        </div>
        {/* double rule */}
        <div style={{ display: 'flex', marginTop: '14px', height: '3px', background: 'rgba(60,45,25,0.6)' }} />
        <div style={{ display: 'flex', marginTop: '3px', height: '1px', background: 'rgba(60,45,25,0.6)' }} />

        <div
          style={{
            display: 'flex',
            marginTop: '34px',
            fontFamily: 'DMSerif',
            fontSize: '96px',
            lineHeight: 0.98,
            textTransform: 'uppercase',
            color: INK,
          }}
        >
          Every deal, announced.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '20px',
            fontFamily: 'DMSerif',
            fontStyle: 'italic',
            fontSize: '27px',
            color: INK_SOFT,
          }}
        >
          Graded on arrival. Revisited four weeks later.
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '34px',
            paddingTop: '14px',
            borderTop: '1px dashed rgba(60,45,25,0.35)',
            fontSize: '14px',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: INK_FAINT,
          }}
        >
          <span style={{ display: 'flex' }}>{foot}</span>
          <span style={{ display: 'flex', color: SIREN_DIM }}>The Trade Desk · The Grader</span>
        </div>
      </div>,
    ),
    { width: 1200, height: 630, fonts },
  )
}
