// OG image generator for The Weekly.
// URL: /api/og/weekly/<slug>
//
// "Night Edition" — the same near-black navy, bone ink and vermilion
// signal the page uses, so the preview reads as the page rather than a
// generic dark card.
//
// This is the one almanac link that actually gets pasted into a league
// group chat, so the card leads with the week's CONTENTS, not the page's
// name: the game of the week, how full the pick'em pool is, who's top of
// the board, and what's on the wire. Someone should be able to decide
// whether to tap from the preview alone.
//
// CDN-cached per slug; busted when the league bundle's `league-<id>` tag
// is revalidated by sync.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDemoSlug, DEMO_NAME } from '@/lib/og/demoBundle'
import { getWeeklyState } from '@/lib/weekly'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

// Night Edition palette — kept in sync with weekly.css :root tokens.
const BG        = '#0b0f16'
const BG2       = '#10161f'
const CARD      = '#141b26'
const LINE      = '#23303f'
const INK       = '#efe8da'
const INK_SOFT  = '#b7c0cc'
const MUTE      = '#76818f'
const NUM       = '#dee6f0'
const SIGNAL    = '#ff5a3c'
const GO        = '#5fbf8f'
const NOTE      = '#9d8cff'

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

// One line of the card's contents list.
type Entry = { label: string; value: string; sub: string; color: string }

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // The demo tree is a static page with no league row behind it, so it has
  // no live week — it gets the same quiet card an off-season league gets.
  if (isDemoSlug(slug)) {
    return renderQuietCard(DEMO_NAME, await loadFonts())
  }

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
  const state = await getWeeklyState(slug)
  if (state.status !== 'ok') {
    return renderQuietCard(league.name, fonts)
  }

  return renderWeeklyCard(league.name, state, fonts)
}

// Build the contents list. Every entry is a fact that changes week to
// week — a card that always says the same thing stops being worth
// re-sending, which is the whole point of this page.
function buildEntries(state: Extract<Awaited<ReturnType<typeof getWeeklyState>>, { status: 'ok' }>): Entry[] {
  const out: Entry[] = []

  // The game of the week, or the biggest mismatch when nothing is flagged.
  const games = state.board?.games ?? []
  const featured = games.find((g) => g.gotw)
    ?? games.slice().sort((a, b) => b.spread - a.spread)[0]
    ?? null
  if (featured) {
    out.push({
      label: featured.gotw ? 'Game of the week' : 'Widest line',
      value: `${short(featured.a.team)}  vs  ${short(featured.b.team)}`,
      sub: featured.favorite === 'pp' || featured.spread === 0
        ? 'Pick’em on season scoring'
        : `${short(featured.favorite === 'a' ? featured.a.team : featured.b.team)} by ${featured.spread.toFixed(1)}`,
      color: SIGNAL,
    })
  }

  if (state.picks) {
    const inCount = state.picks.submitted.length
    const total = state.picks.total
    const owed = Math.max(0, total - inCount)
    // Green only once the pool is actually filling up. A card that reads
    // "0 of 17 are in" in the same colour as "16 of 17 are in" is telling
    // the league the opposite of what it means.
    out.push({
      label: 'Pick’ems',
      value: state.picks.locked ? 'Board is locked' : `${inCount} of ${total} are in`,
      sub: state.picks.locked
        ? 'Results settle after Monday night'
        : `${owed} still owe their picks`,
      color: state.picks.locked ? MUTE : (inCount * 2 >= total ? GO : SIGNAL),
    })
  }

  const top = state.power?.rows[0]
  if (top) {
    out.push({
      label: 'Top of the board',
      value: short(top.team),
      sub: `${top.record}${state.power?.riser ? ` · ${short(state.power.riser.team)} up ${state.power.riser.delta}` : ''}`,
      color: NUM,
    })
  }

  // The wire + the record room share the last slot — whichever actually
  // has something to say wins, and when both do they combine.
  const trades = state.trades?.newThisWeek ?? 0
  const brink = (state.watch?.counts.brink ?? 0) + (state.watch?.counts.imminent ?? 0)
  const broken = state.watch?.counts.broken ?? 0
  if (trades > 0 || brink > 0 || broken > 0) {
    const bits: string[] = []
    if (trades > 0) bits.push(`${trades} new ${trades === 1 ? 'deal' : 'deals'}`)
    if (broken > 0) bits.push(`${broken} record${broken === 1 ? '' : 's'} broken`)
    out.push({
      label: 'On the wire',
      value: bits.length ? bits.join(' · ') : `${brink} within reach`,
      sub: brink > 0 ? `${brink} more mark${brink === 1 ? '' : 's'} one game away` : 'Graded and filed',
      color: NOTE,
    })
  }

  return out.slice(0, 4)
}

// Team names run long and this column is fixed-width; clip rather than let
// satori push the row off the card.
function short(s: string, max = 20): string {
  const t = String(s ?? '').trim()
  return t.length <= max ? t : t.slice(0, max - 1) + '…'
}

function backgroundLayers() {
  // Newsprint tooth: a faint hairline grid, plus the two corner washes the
  // page carries (vermilion top-left, violet bottom-right).
  const grid = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path d="M0 0H40M0 0V40" fill="none" stroke="${LINE}" stroke-opacity="0.45" stroke-width="1"/></svg>`,
  )
  return (
    <>
      <div
        style={{
          position: 'absolute', inset: 0, display: 'flex',
          backgroundImage: `url("data:image/svg+xml;utf8,${grid}")`,
          backgroundSize: '40px 40px',
          opacity: 0.45,
        }}
      />
      <div
        style={{
          position: 'absolute', inset: 0, display: 'flex',
          background:
            `radial-gradient(circle at 8% 4%, ${SIGNAL}24 0%, transparent 46%),` +
            `radial-gradient(circle at 94% 96%, ${NOTE}1f 0%, transparent 52%)`,
        }}
      />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, display: 'flex', background: SIGNAL }} />
      <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 2, display: 'flex', background: LINE }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, display: 'flex', background: `linear-gradient(90deg, ${SIGNAL} 0%, ${NOTE} 55%, transparent 100%)`, opacity: 0.75 }} />
    </>
  )
}

function TopBar({ leagueName }: { leagueName: string }) {
  return (
    <div
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '38px 62px 0',
        fontSize: '21px', fontWeight: 700, letterSpacing: '0.3em',
        textTransform: 'uppercase', color: SIGNAL, zIndex: 2,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ display: 'flex', width: 11, height: 11, borderRadius: 999, background: SIGNAL }} />
        {short(leagueName, 26).toUpperCase()}
      </span>
      <span style={{ display: 'flex', color: MUTE, letterSpacing: '0.32em' }}>THE SUNDAY CHRONICLE</span>
    </div>
  )
}

function renderWeeklyCard(
  leagueName: string,
  state: Extract<Awaited<ReturnType<typeof getWeeklyState>>, { status: 'ok' }>,
  fonts: Fonts,
) {
  const entries = buildEntries(state)

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px', height: '630px',
          display: 'flex', flexDirection: 'column',
          background: BG, color: INK, fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        {backgroundLayers()}
        <TopBar leagueName={leagueName} />

        {/* Fixed height, not flex:1 — the contents column has to be sized
            against the space that's actually left between the top bar and
            the footer rule, or a fourth entry runs straight over it. */}
        <div style={{ display: 'flex', height: '466px', padding: '24px 62px 0', gap: '48px', zIndex: 2 }}>
          {/* Masthead column — the week is the headline. */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '392px', paddingTop: '10px' }}>
            <div
              style={{
                display: 'flex', alignItems: 'baseline', gap: '14px',
                fontSize: '22px', fontWeight: 700, letterSpacing: '0.26em',
                textTransform: 'uppercase', color: MUTE,
              }}
            >
              <span style={{ display: 'flex', color: INK_SOFT }}>WEEK</span>
              <span style={{ display: 'flex', color: SIGNAL, fontSize: '92px', letterSpacing: '0', lineHeight: 1 }}>
                {state.week}
              </span>
            </div>
            <div
              style={{
                display: 'flex', fontFamily: 'DMSerif', fontSize: '76px',
                lineHeight: 1, color: INK, marginTop: '16px',
              }}
            >
              The
            </div>
            <div
              style={{
                display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic',
                fontSize: '76px', lineHeight: 1, color: SIGNAL, marginTop: '2px',
              }}
            >
              Weekly.
            </div>
            <div style={{ display: 'flex', width: '150px', height: '3px', background: LINE, marginTop: '26px' }} />
            <div
              style={{
                display: 'flex', marginTop: '20px', fontSize: '20px',
                lineHeight: 1.45, color: MUTE, maxWidth: '360px',
              }}
            >
              Everything worth checking before Sunday, on one page.
            </div>
          </div>

          {/* Contents column — what's actually inside this week. Centred so
              a three-entry week (no trades yet) sits balanced rather than
              hanging off the top. */}
          <div
            style={{
              display: 'flex', flexDirection: 'column', flex: 1,
              gap: '10px', justifyContent: 'center',
            }}
          >
            {entries.map((e, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', flexDirection: 'column',
                  background: i % 2 === 0 ? CARD : BG2,
                  border: `1px solid ${LINE}`,
                  borderLeft: `4px solid ${e.color}`,
                  borderRadius: '10px',
                  padding: '11px 20px 13px',
                }}
              >
                <div
                  style={{
                    display: 'flex', fontSize: '14px', fontWeight: 700,
                    letterSpacing: '0.24em', textTransform: 'uppercase', color: MUTE,
                  }}
                >
                  {e.label}
                </div>
                <div
                  style={{
                    display: 'flex', fontFamily: 'DMSerif', fontSize: '30px',
                    lineHeight: 1.12, color: INK, marginTop: '5px',
                  }}
                >
                  {e.value}
                </div>
                <div style={{ display: 'flex', fontSize: '16px', color: e.color, marginTop: '5px' }}>
                  {e.sub}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer rule — the page's own contents, spelled out. */}
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '20px 62px 30px',
            fontSize: '16px', fontWeight: 700, letterSpacing: '0.24em',
            textTransform: 'uppercase', color: MUTE, zIndex: 2,
          }}
        >
          <span style={{ display: 'flex' }}>
            Pick’ems · Matchup · Power rankings · Trades · Records
          </span>
          <span style={{ display: 'flex', color: INK_SOFT }}>{state.year} Season</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}

// Off-season / no-week variant. Same house, no contents to list.
function renderQuietCard(leagueName: string, fonts: Fonts) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px', height: '630px',
          display: 'flex', flexDirection: 'column',
          background: BG, color: INK, fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        {backgroundLayers()}
        <TopBar leagueName={leagueName} />

        <div
          style={{
            display: 'flex', flexDirection: 'column', flex: 1,
            alignItems: 'center', justifyContent: 'center',
            padding: '0 80px', zIndex: 2,
          }}
        >
          <div
            style={{
              display: 'flex', fontSize: '20px', fontWeight: 700,
              letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTE,
            }}
          >
            ★ Between editions ★
          </div>
          <div
            style={{
              display: 'flex', fontFamily: 'DMSerif', fontSize: '96px',
              lineHeight: 1, color: INK, marginTop: '22px',
            }}
          >
            The
            <span style={{ display: 'flex', fontStyle: 'italic', color: SIGNAL, marginLeft: '22px' }}>
              Weekly.
            </span>
          </div>
          <div style={{ display: 'flex', width: '190px', height: '3px', background: LINE, marginTop: '30px' }} />
          <div
            style={{
              display: 'flex', marginTop: '26px', fontSize: '24px',
              lineHeight: 1.45, color: MUTE, textAlign: 'center', maxWidth: '760px',
            }}
          >
            Picks, matchups, power rankings, the trade wire and every record within reach. Back the week the season opens.
          </div>
        </div>

        <div
          style={{
            display: 'flex', justifyContent: 'center',
            padding: '0 62px 42px',
            fontSize: '16px', fontWeight: 700, letterSpacing: '0.26em',
            textTransform: 'uppercase', color: MUTE, zIndex: 2,
          }}
        >
          The Sunday Chronicle
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
