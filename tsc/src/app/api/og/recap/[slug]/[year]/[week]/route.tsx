// OG image for a weekly recap.
// URL: /api/og/recap/<slug>/<year>/<week>
//
// The recap is the league's paper, so its preview is the paper's front page:
// cream newsprint in the page's own colours, the league as the nameplate,
// the week's headline and deck, and three key games down the side. The
// headline is the hook; a card that only said "Week 3 Recap" gives nobody a
// reason to tap.
//
// Satori rules learned elsewhere (see the other og routes): no fragments
// inside flex rows, no double borders (two 1px rules instead), every glyph
// must exist in the loaded fonts, inline the JSX rather than mapping inside
// a custom component.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRecap } from '@/lib/recap/load'
import { pts, recapSections } from '@/lib/recap/facts'
import { writeEdition } from '@/lib/recap/story'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

// recap.module.css's newsprint tokens.
const DESK = '#ddd4bf'
const PAPER = '#f6f1e4'
const PAPER_2 = '#ece4d0'
const INK = '#1c1915'
const INK_2 = '#463f35'
const MUTE = '#776e5f'
const RULE = '#cdc2a8'
const RED = '#a3302a'

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

// The nameplate fills the sheet's width whatever the league is called.
function nameplateSize(name: string): number {
  const units = [...name].reduce((n, c) => n + (/[A-Z]/.test(c) ? 0.68 : /[mw]/.test(c) ? 0.85 : /[iljtfr ]/.test(c) ? 0.32 : 0.52), 0)
  return Math.max(44, Math.min(96, Math.floor(1000 / Math.max(units, 1))))
}

function headlineSize(text: string): number {
  if (text.length <= 34) return 62
  if (text.length <= 52) return 54
  if (text.length <= 70) return 46
  return 40
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; year: string; week: string }> },
) {
  const { slug, year: y, week: w } = await params
  const year = Number(y)
  const week = Number(w)
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 18) {
    return new Response('Not found', { status: 404 })
  }

  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, name, slug, owner_id, published_at')
    .eq('slug', slug)
    .maybeSingle()
  // Crawlers have no session, so only published leagues get a card, the
  // same rule as the page for everyone but the owner.
  if (!league || !league.published_at) return new Response('Not found', { status: 404 })

  const fonts = await loadFonts()
  const loaded = await loadRecap({ id: league.id as string, owner_id: league.owner_id as string | null }, year, week)
  const name = league.name as string

  let headline = `Week ${week} isn't over yet`
  let deck: string | null = 'The paper comes out the Tuesday after Monday night.'
  let scores: { tag: string; w: string; ws: string; l: string; ls: string }[] = []
  let label = `Week ${week}`
  if (loaded.status === 'ok') {
    const f = loaded.facts
    const show = recapSections(loaded.tier)
    const facts = show.paid
      ? f
      : { ...f, book: undefined, starts: undefined, yearAgo: undefined, weekRecord: undefined, totals: undefined, star: undefined }
    const ed = writeEdition(facts)
    headline = ed.front.headline
    deck = ed.front.deck
    label = f.phase === 'playoffs' ? `Playoffs, week ${week}` : `Week ${week}`
    // Three games, each for a reason, rather than the first few of a slate
    // that leaves a league's sixth (or eighth) game off: the week's top team
    // score, the lowest winning score, the closest game. When one game wins
    // two of those, the highest-scoring game (both sides combined) and then
    // the biggest win fill in, so there are always three different games.
    const decided = f.games.filter((g) => g.winner === 'a' || g.winner === 'b')
    const win = (g: (typeof decided)[number]) => (g.winner === 'a' ? g.a : g.b)
    const lose = (g: (typeof decided)[number]) => (g.winner === 'a' ? g.b : g.a)
    const by = <T,>(list: T[], f: (x: T) => number) => [...list].sort((x, y) => f(x) - f(y))
    const picks: { tag: string; g: (typeof decided)[number] }[] = []
    const add = (tag: string, g: (typeof decided)[number] | undefined) => {
      if (g && !picks.some((p) => p.g === g)) picks.push({ tag, g })
    }
    // Each label only ever goes on the one game that earns it.
    add('Top score', by(decided, (g) => -Math.max(g.a.score, g.b.score))[0])
    add('Lowest winning score', by(decided, (g) => win(g).score)[0])
    add('Closest game', by(decided, (g) => g.margin)[0])
    add('Highest-scoring game', by(decided, (g) => -(g.a.score + g.b.score))[0])
    add('Biggest win', by(decided, (g) => -g.margin)[0])
    for (const g of decided) add('Final', g)
    scores = picks.slice(0, 3).map(({ tag, g }) => ({
      tag,
      w: win(g).name,
      ws: pts(win(g).score),
      l: lose(g).name,
      ls: pts(lose(g).score),
    }))
  }

  const npSize = nameplateSize(name)
  const hlSize = headlineSize(headline)

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '1200px',
          height: '630px',
          background: DESK,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '1110px',
            height: '570px',
            padding: '26px 44px 30px',
            background: PAPER,
            boxShadow: '0 2px 0 #c9bea4, 0 30px 60px rgba(40,30,10,0.28)',
            transform: 'rotate(-0.5deg)',
          }}
        >
          {/* Masthead */}
          <div style={{ display: 'flex', height: '3px', background: INK, flexShrink: 0 }} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: '12px',
              fontFamily: 'JetBrains',
              fontWeight: 700,
              fontSize: '14px',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: RED,
            }}
          >
            {`The ${label.toLowerCase()} paper`}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              fontFamily: 'DMSerif',
              fontSize: `${npSize}px`,
              lineHeight: 1.02,
              color: INK,
              marginTop: '2px',
            }}
          >
            {name}
          </div>
          <div style={{ display: 'flex', height: '1px', background: INK, marginTop: '10px', flexShrink: 0 }} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '7px 0',
              fontFamily: 'JetBrains',
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: INK_2,
            }}
          >
            <span style={{ display: 'flex' }}>The Sunday Chronicle</span>
            <span style={{ display: 'flex' }}>{`${label} · ${year}`}</span>
          </div>
          <div style={{ display: 'flex', height: '1px', background: INK, flexShrink: 0 }} />
          <div style={{ display: 'flex', height: '1px', background: INK, marginTop: '3px', flexShrink: 0 }} />

          {/* Front page: headline left, scoreboard right */}
          <div style={{ display: 'flex', flex: 1, marginTop: '22px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: '34px' }}>
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontSize: `${hlSize}px`,
                  lineHeight: 1.04,
                  color: INK,
                }}
              >
                {headline}
              </div>
              {deck ? (
                <div
                  style={{
                    display: 'flex',
                    marginTop: '14px',
                    fontFamily: 'DMSerif',
                    fontStyle: 'italic',
                    fontSize: '25px',
                    lineHeight: 1.3,
                    color: INK_2,
                  }}
                >
                  {deck}
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  marginTop: '20px',
                  paddingTop: '10px',
                  borderTop: `1px solid ${RULE}`,
                  fontFamily: 'JetBrains',
                  fontWeight: 700,
                  fontSize: '13px',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: MUTE,
                }}
              >
                By the Chronicle staff
              </div>
            </div>

            {scores.length ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '330px',
                  flexShrink: 0,
                  padding: '0 18px 12px',
                  background: PAPER_2,
                }}
              >
                <div style={{ display: 'flex', height: '3px', background: RED, flexShrink: 0 }} />
                <div
                  style={{
                    display: 'flex',
                    flexShrink: 0,
                    padding: '9px 0 8px',
                    borderBottom: `1px solid ${INK}`,
                    fontFamily: 'JetBrains',
                    fontWeight: 700,
                    fontSize: '12px',
                    letterSpacing: '0.24em',
                    textTransform: 'uppercase',
                    color: INK,
                  }}
                >
                  Key games
                </div>
                {scores.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      flexShrink: 0,
                      padding: '12px 0',
                      borderBottom: i === scores.length - 1 ? 'none' : `1px solid ${RULE}`,
                      fontFamily: 'JetBrains',
                      fontSize: '17px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        marginBottom: '4px',
                        fontWeight: 700,
                        fontSize: '11px',
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: RED,
                      }}
                    >
                      {s.tag}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: INK, fontWeight: 700 }}>
                      <span style={{ display: 'flex' }}>{s.w.length > 16 ? `${s.w.slice(0, 15)}.` : s.w}</span>
                      <span style={{ display: 'flex' }}>{s.ws}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: MUTE }}>
                      <span style={{ display: 'flex' }}>{s.l.length > 16 ? `${s.l.slice(0, 15)}.` : s.l}</span>
                      <span style={{ display: 'flex' }}>{s.ls}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
