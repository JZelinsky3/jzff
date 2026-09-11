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
// Palette: one image serves both trees, so it can't be two things. It
// used to mirror the DESKTOP wire room only (near-black + siren red),
// which read as a different product next to the mobile grader's
// aubergine and copper. The room is now aubergine and the accent copper,
// which still sits in the desktop card's family (dark room, one warm
// accent) while matching the phone page it is most often opened from.
// The cream newsprint stock is common to both and doesn't move.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

// Grader palette — the aubergine + copper of trades-grader-mobile.css.
const WIRE_BG    = '#14101c'
const WIRE_DEEP  = '#0d0a14'
const CREAM      = '#f0e8d2'
const CREAM_2    = '#e6dcc0'
const MANILA     = '#efe6cd'
const MANILA_2   = '#e2d5b0'
// SIREN is the card's one accent. Named for the old red; it is copper now.
const SIREN      = '#e8a26c'
const SIREN_DIM  = '#a2631f'
const AMBER      = '#d9a441'
const INK        = '#2c2417'
const INK_SOFT   = '#554833'
const INK_FAINT  = '#77684e'
// Same green and blue the page stamps an A and a B with, darkened for
// printing on cream rather than glowing on a dark panel.
const GRADE_A    = '#2f7a42'
const GRADE_B    = '#1f5f9e'

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
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  // Which scene renders depends on whether a deal cleared in the last 24h,
  // so the sealed card is otherwise only previewable on a trade day.
  // ?scene=sealed / ?scene=front forces one.
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
  const sealed = scene === 'sealed' || (scene !== 'front' && !!fresh && fresh.length > 0)
  return sealed
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
          background: `radial-gradient(ellipse 70% 45% at 50% -8%, rgba(232,162,108,0.16) 0%, rgba(232,162,108,0) 60%), linear-gradient(180deg, #1c1626 0%, ${WIRE_DEEP} 100%)`,
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
        border: `1px solid rgba(232,162,108,0.45)`,
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
          boxShadow: `0 0 12px rgba(232,162,108,0.9)`,
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
            // Off-square for the same reason as the front page: dead level,
            // it read as a UI panel instead of something sitting on a desk.
            transform: 'rotate(-0.7deg)',
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
              // Deeper than the page copper: a seal has to read as wax on
              // manila, and the flat accent tone washed into the stock.
              background: `radial-gradient(circle at 35% 30%, #e8a26c, #c0763a 55%, #8a4f18)`,
              boxShadow: '0 5px 14px rgba(0,0,0,0.35)',
              color: '#fdf3e4',
              fontFamily: 'DMSerif',
              fontSize: '38px',
              letterSpacing: '0.04em',
            }}
          >
            {/* A monogram, not a dingbat. This was "✦", which is in neither
                loaded font, so every sealed card shipped with a tofu box in
                the middle of the seal. Only visible on a trade day, which is
                why it survived. Anything drawn here must exist in DM Serif
                or JetBrains Mono. */}
            TT
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
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          width: '1200px',
          height: '630px',
        }}
      >
        {/* Two sheets under the front page, fanned a degree or two either
            way. The card used to be one dead-square rectangle centred in
            the frame, which read as a UI panel rather than a newspaper
            sitting on a desk. These never show more than an edge; their
            whole job is to break the silhouette. */}
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            width: '968px',
            height: '498px',
            background: '#cec4a6',
            borderRadius: '3px',
            transform: 'rotate(2.2deg)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            width: '968px',
            height: '498px',
            background: '#ddd3b6',
            borderRadius: '3px',
            transform: 'rotate(-1.4deg)',
            boxShadow: '0 18px 44px rgba(0,0,0,0.4)',
          }}
        />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '968px',
          padding: '34px 54px 30px',
          background: `linear-gradient(180deg, #f2ecda, ${CREAM_2})`,
          borderRadius: '3px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.55), 0 40px 90px rgba(0,0,0,0.5)',
          color: INK,
          position: 'relative',
          transform: 'rotate(-0.5deg)',
        }}
      >
        {/* Red corner tag, like the page's "Deal of the season". Sits above
            the paper's top edge as a tab: at its old y it landed on top of
            "Official wire edition" and clipped it. */}
        <div
          style={{
            position: 'absolute',
            top: '-18px',
            right: '-14px',
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
        {/* Stamps sit beside the headline, not above it. At their old y the
            pair floated up in the masthead and read as part of the
            nameplate. */}
        <Stamp grade="A-" color={GRADE_A} rotate="8deg" top="202px" right="60px" />
        <Stamp grade="B+" color={GRADE_B} rotate="-6deg" top="290px" right="96px" />

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
            fontSize: '48px',
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
            marginTop: '28px',
            fontFamily: 'DMSerif',
            fontSize: '90px',
            lineHeight: 0.98,
            textTransform: 'uppercase',
            color: INK,
          }}
        >
          Every trade, graded.
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
          Graded the day it lands. Revisited four weeks later.
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
      </div>
      </div>,
    ),
    { width: 1200, height: 630, fonts },
  )
}
