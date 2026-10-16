// Images for the Cup.
//   /api/og/cup/<slug>/               the link preview (1200x630): the Cup's
//                                     name, where it stands, this round's
//                                     games, the trophy on the right
//   /api/og/cup/<slug>/?format=post   the whole bracket on a tall card
//                                     (1080x1350) to post in the group chat
//
// Same draw-board palette as the page (cup.module.css). Satori rules from the
// other og routes: no fragments inside flex rows, thin divs need flexShrink 0,
// every glyph must exist in the loaded fonts, and helpers are called as plain
// functions, never as components.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCup } from '@/lib/cup/load'
import { loadCupPreview } from '@/lib/cup/preview'
import { DEMO_CUP_LEAGUE, demoCupPreview, demoCupView, isDemoCup } from '@/lib/cup/demo'
import { CUP_LAUNCH, drawDayShort } from '@/lib/cup/launch'
import type { CupBracket, CupMatch, CupRound, CupSide } from '@/lib/cup/bracket'
import { trophy } from '@/lib/cup/trophy'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

const BOARD = '#0c271f'
const BOARD_2 = '#10322a'
const SLOT = '#143c31'
const LINE = 'rgba(236,228,206,0.14)'
const LINE_2 = 'rgba(236,228,206,0.32)'
const IVORY = '#ece4ce'
const IVORY_2 = '#c9c1aa'
const MUTE = '#8fa597'
const BRASS = '#c8a35b'
const BRASS_HI = '#e6cb8e'
const BRASS_LO = '#7d6230'
const RED = '#e2694f'

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

// Character-class widths, as the champion plate does it, so a long Cup name
// shrinks instead of wrapping into the games.
function titleSize(name: string, width: number, max: number): number {
  const units = [...name].reduce((n, c) => n + (/[A-Z]/.test(c) ? 0.68 : /[mw]/.test(c) ? 0.85 : /[iljtfr ]/.test(c) ? 0.32 : 0.52), 0)
  return Math.max(48, Math.min(max, Math.floor(width / Math.max(units, 1))))
}

function short(name: string, n: number): string {
  return name.length > n ? `${name.slice(0, n - 1)}.` : name
}

function pts(n: number): string {
  return n.toFixed(2)
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

// The round the card is about: the one being played, else the next one.
function focusRound(b: CupBracket): CupRound | null {
  if (b.currentRound == null) return null
  return b.rounds[b.currentRound] ?? null
}

function roundTag(b: CupBracket, r: CupRound | null): { live: boolean; text: string } {
  if (b.status === 'done') return { live: false, text: `Decided in week ${b.finalWeek}` }
  if (!r) return { live: false, text: 'The draw is set' }
  const live = r.matches.some((m) => m.state === 'live')
  const waiting = r.matches.some((m) => m.state === 'waiting')
  return { live, text: `${r.name} · Week ${r.week}${waiting ? ' · Final scores pending' : ''}` }
}

function sideName(s: CupSide, n: number): string {
  if (s.kind === 'team') return short(s.entrant.name, n)
  return s.options.length ? `${short(s.options[0], 8)} / ${short(s.options[1], 8)}` : 'TBD'
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return new Response('Not found', { status: 404 })
  const search = new URL(req.url).searchParams
  const format = search.get('format') === 'post' ? 'post' : 'card'
  // A past season's Cup; the newest one when absent.
  const year = Number(search.get('year')) || null

  // The demo league has no row: its Cups come from lib/cup/demo.ts.
  const demo = isDemoCup(slug)
  let league: { id: string; name: string; published_at: string | null } | null = demo ? DEMO_CUP_LEAGUE : null
  if (!demo) {
    const db = createAdminClient()
    const { data } = await db.from('leagues').select('id, name, slug, published_at').eq('slug', slug).maybeSingle()
    league = data as typeof league
  }
  // Crawlers have no session: only published leagues get an image.
  if (!league || !league.published_at) return new Response('Not found', { status: 404 })
  const view = demo ? demoCupView(year) : await loadCup(league.id, year)
  const leagueName = league.name

  // No Cup yet this year: the launch preview's card, the bracket as today's
  // standings would draw it, under the draw date. The demo shows it only
  // when asked (?preview=1), since its own Cup is running.
  if (!year && format === 'card' && (search.get('preview') === '1' || (!demo && (!view || view.cup.season_year < CUP_LAUNCH.year)))) {
    const preview = demo ? await demoCupPreview() : await loadCupPreview(league.id)
    if (preview) {
      const fonts = await loadFonts()
      return cardImage(CUP_LAUNCH.name, leagueName, preview.year, preview.bracket, fonts, {
        live: false,
        text: `The draw: ${drawDayShort()} · ${preview.final ? 'The seeds' : 'If it were today'}`,
      })
    }
  }
  if (!view) return new Response('Not found', { status: 404 })

  const fonts = await loadFonts()
  // The demo's link goes out to people with no league on the site yet: the
  // card sells the Cup as a whole, not the week the demo is frozen in.
  if (demo && !year && format === 'card') return demoCardImage(fonts)
  return format === 'post'
    ? postImage(view.cup.name, leagueName, view.cup.season_year, view.bracket, slug, fonts)
    : cardImage(view.cup.name, leagueName, view.cup.season_year, view.bracket, fonts)
}

// ── Link preview ─────────────────────────────────────────────────────────

function cardImage(
  name: string,
  leagueName: string,
  year: number,
  b: CupBracket,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
  tagOverride?: { live: boolean; text: string },
) {
  const r = focusRound(b)
  const tag = tagOverride ?? roundTag(b, r)
  const games = (r?.matches ?? []).slice(0, 4)
  const more = (r?.matches.length ?? 0) - games.length
  const size = titleSize(name, 620, 116)

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '1200px', height: '630px', background: BOARD, padding: '22px' }}>
        <div
          style={{
            display: 'flex',
            flex: 1,
            border: `1px solid ${LINE_2}`,
            padding: '6px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flex: 1,
              border: `1px solid rgba(200,163,91,0.45)`,
              padding: '40px 46px 36px 50px',
              backgroundImage: `radial-gradient(circle at 70% 0%, #1b4a39 0%, ${BOARD} 62%)`,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'JetBrains',
                  fontWeight: 700,
                  fontSize: '17px',
                  letterSpacing: '0.24em',
                  textTransform: 'uppercase',
                  color: BRASS,
                }}
              >
                {`${leagueName} · ${year}`}
              </div>
              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: `${size}px`, lineHeight: 1, color: IVORY, marginTop: '14px' }}>
                {name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginTop: '22px' }}>
                {tag.live ? (
                  <div
                    style={{
                      display: 'flex',
                      padding: '5px 10px',
                      marginRight: '14px',
                      background: RED,
                      color: '#1b0d08',
                      fontFamily: 'JetBrains',
                      fontWeight: 700,
                      fontSize: '15px',
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                    }}
                  >
                    This week
                  </div>
                ) : null}
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'JetBrains',
                    fontWeight: 700,
                    fontSize: '17px',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: IVORY_2,
                  }}
                >
                  {tag.text}
                </div>
              </div>

              {b.status === 'done' && b.champion ? (
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '34px' }}>
                  <div style={{ display: 'flex', fontFamily: 'JetBrains', fontSize: '16px', letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTE }}>
                    Champion
                  </div>
                  <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '64px', lineHeight: 1.05, color: BRASS_HI }}>{b.champion.name}</div>
                  {b.runnerUp ? (
                    <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '26px', color: IVORY_2, marginTop: '6px' }}>
                      {`The ${ordinal(b.champion.seed)} seed, over ${b.runnerUp.name} in the final`}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '30px', width: '680px' }}>
                  {games.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        width: '326px',
                        marginRight: '14px',
                        marginBottom: '14px',
                        background: SLOT,
                        border: `1px solid ${LINE}`,
                      }}
                    >
                      {cardRow(m.a, false)}
                      <div style={{ display: 'flex', height: '1px', background: LINE, flexShrink: 0 }} />
                      {cardRow(m.b, false)}
                    </div>
                  ))}
                  {more > 0 || r?.byes.length ? (
                    <div
                      style={{
                        display: 'flex',
                        width: '666px',
                        marginTop: '4px',
                        fontFamily: 'JetBrains',
                        fontWeight: 700,
                        fontSize: '15px',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: MUTE,
                      }}
                    >
                      {more > 0
                        ? `and ${more} more ${more === 1 ? 'game' : 'games'}`
                        : `Byes: ${[...(r?.byes ?? [])].sort((x, y) => x.seed - y.seed).map((e) => short(e.name, 12)).join(', ')}`}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '300px', flexShrink: 0 }}>
              {trophy({ width: 230, brass: BRASS, light: BRASS_HI, dark: BRASS_LO, plate: BOARD })}
              <div
                style={{
                  display: 'flex',
                  marginTop: '18px',
                  padding: '8px 18px',
                  background: '#c19b52',
                  color: '#1d1708',
                  fontFamily: 'JetBrains',
                  fontWeight: 700,
                  fontSize: '14px',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                }}
              >
                {`${b.field} teams · Weeks ${b.startWeek}-${b.finalWeek}`}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}

// ── The demo's link preview ──────────────────────────────────────────────

const PAPER = '#f5eedb'
const INK = '#1b1f18'
const INK_3 = '#7b745f'

const DEMO_FEATURES: [string, string][] = [
  ['Pick Every Game', 'Tap who wins, points each round'],
  ['Live Title Odds', 'Re-run after every week'],
  ['Collect Stamps', 'Giant Killer, Jinxed, Traitor'],
  ['A Hall of Fame', 'Every champion, year by year'],
]

function demoCardImage(fonts: Awaited<ReturnType<typeof loadFonts>>) {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '1200px', height: '630px', background: BOARD, padding: '22px' }}>
        <div style={{ display: 'flex', flex: 1, border: `1px solid ${LINE_2}`, padding: '6px' }}>
          <div
            style={{
              display: 'flex',
              flex: 1,
              border: `1px solid rgba(200,163,91,0.45)`,
              padding: '40px 46px 36px 50px',
              backgroundImage: `radial-gradient(circle at 70% 0%, #1b4a39 0%, ${BOARD} 62%)`,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, paddingBottom: '14px' }}>
              <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: '17px', letterSpacing: '0.24em', textTransform: 'uppercase', color: BRASS }}>
                Free for Sleeper and ESPN leagues
              </div>
              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: `${titleSize(CUP_LAUNCH.name, 690, 104)}px`, lineHeight: 1, color: IVORY, marginTop: '14px', whiteSpace: 'nowrap' }}>
                {CUP_LAUNCH.name}
              </div>
              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '30px', color: IVORY_2, marginTop: '14px' }}>
                A knockout bracket inside your fantasy season
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '30px', width: '690px' }}>
                {DEMO_FEATURES.map(([title, sub]) => (
                  <div
                    key={title}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      width: '330px',
                      height: '86px',
                      marginRight: '14px',
                      marginBottom: '14px',
                      padding: '0 20px',
                      background: PAPER,
                      borderLeft: `6px solid ${BRASS}`,
                    }}
                  >
                    <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '28px', lineHeight: 1.1, color: INK }}>{title}</div>
                    <div style={{ display: 'flex', fontFamily: 'JetBrains', fontSize: '14px', color: INK_3, marginTop: '5px' }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '300px', flexShrink: 0 }}>
              {trophy({ width: 230, brass: BRASS, light: BRASS_HI, dark: BRASS_LO, plate: BOARD })}
              <div
                style={{
                  display: 'flex',
                  marginTop: '18px',
                  padding: '8px 18px',
                  background: '#c19b52',
                  color: '#1d1708',
                  fontFamily: 'JetBrains',
                  fontWeight: 700,
                  fontSize: '14px',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                }}
              >
                Try the demo
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}

function cardRow(s: CupSide, lost: boolean) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '50px', padding: '0 14px', opacity: lost ? 0.5 : 1 }}>
      <div style={{ display: 'flex', width: '30px', fontFamily: 'JetBrains', fontWeight: 700, fontSize: '17px', color: BRASS }}>
        {s.kind === 'team' ? String(s.entrant.seed) : ''}
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: 'DMSerif',
          fontSize: s.kind === 'team' ? '28px' : '22px',
          fontStyle: s.kind === 'team' ? 'normal' : 'italic',
          color: s.kind === 'team' ? IVORY : MUTE,
        }}
      >
        {sideName(s, 15)}
      </div>
    </div>
  )
}

// ── The bracket, for the group chat ──────────────────────────────────────

const POST_W = 1080
const POST_H = 1350
const PAD = 56
const GAP = 30
const CARD_H = 84
const BODY_TOP = 0
const BODY_H = 900

function postImage(
  name: string,
  leagueName: string,
  year: number,
  b: CupBracket,
  slug: string,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
) {
  const cols = b.rounds.length
  const colW = Math.floor((POST_W - PAD * 2 - GAP * (cols - 1)) / cols)
  const colX = (r: number) => r * (colW + GAP)
  const centerY = (r: number, slot: number) => BODY_TOP + ((slot + 0.5) * BODY_H) / b.rounds[r].slots
  const nameChars = colW > 220 ? 11 : 9

  // Bracket lines: each game in round r joins the row it fills in the game
  // it feeds (an even slot fills the top row, an odd slot the bottom one).
  const lines: { left: number; top: number; width: number; height: number }[] = []
  for (let r = 0; r < cols - 1; r++) {
    for (const m of b.rounds[r].matches) {
      const y1 = centerY(r, m.slot)
      const y2 = centerY(r + 1, Math.floor(m.slot / 2)) + (m.slot % 2 === 0 ? -CARD_H / 4 : CARD_H / 4)
      const x1 = colX(r) + colW
      const mid = x1 + GAP / 2
      lines.push({ left: x1, top: y1, width: GAP / 2, height: 1 })
      lines.push({ left: mid, top: Math.min(y1, y2), width: 1, height: Math.abs(y2 - y1) + 1 })
      lines.push({ left: mid, top: y2, width: GAP / 2, height: 1 })
    }
  }

  const tag = roundTag(b, focusRound(b))
  const size = titleSize(name, 640, 104)
  const finalCenter = centerY(cols - 1, 0)

  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: `${POST_W}px`, height: `${POST_H}px`, background: BOARD, padding: `${PAD - 14}px ${PAD}px ${PAD - 18}px` }}>
        {/* Header: words left, trophy right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: '18px', letterSpacing: '0.24em', textTransform: 'uppercase', color: BRASS }}>
              {`${leagueName} · ${year}`}
            </div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: `${size}px`, lineHeight: 1, color: IVORY, marginTop: '10px' }}>{name}</div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: '18px' }}>
              {tag.live ? (
                <div
                  style={{
                    display: 'flex',
                    padding: '4px 9px',
                    marginRight: '12px',
                    background: RED,
                    color: '#1b0d08',
                    fontFamily: 'JetBrains',
                    fontWeight: 700,
                    fontSize: '15px',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                  }}
                >
                  This week
                </div>
              ) : null}
              <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: '17px', letterSpacing: '0.12em', textTransform: 'uppercase', color: IVORY_2 }}>
                {tag.text}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexShrink: 0, marginLeft: '20px' }}>
            {trophy({ width: 150, brass: BRASS, light: BRASS_HI, dark: BRASS_LO, plate: BOARD })}
          </div>
        </div>

        {/* Column heads */}
        <div style={{ display: 'flex', marginTop: '30px', flexShrink: 0 }}>
          {b.rounds.map((r, i) => (
            <div
              key={r.round}
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: `${colW}px`,
                marginRight: i === cols - 1 ? '0px' : `${GAP}px`,
                paddingBottom: '9px',
                borderBottom: `1px solid ${LINE_2}`,
              }}
            >
              <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: '15px', letterSpacing: '0.16em', textTransform: 'uppercase', color: IVORY }}>
                {r.short}
              </div>
              <div style={{ display: 'flex', fontFamily: 'JetBrains', fontSize: '14px', color: r.matches.some((m) => m.state === 'live') ? RED : MUTE, marginTop: '2px' }}>
                {`Week ${r.week}${r.matches.some((m) => m.state === 'live') ? ' · now' : ''}`}
              </div>
            </div>
          ))}
        </div>

        {/* The bracket */}
        <div style={{ display: 'flex', position: 'relative', height: `${BODY_H}px`, marginTop: '14px', flexShrink: 0 }}>
          {lines.map((l, i) => (
            <div
              key={`l${i}`}
              style={{
                display: 'flex',
                position: 'absolute',
                left: `${l.left}px`,
                top: `${l.top}px`,
                width: `${l.width}px`,
                height: `${l.height}px`,
                background: LINE_2,
              }}
            />
          ))}
          {b.rounds.flatMap((r) =>
            r.matches.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'absolute',
                  left: `${colX(r.round)}px`,
                  top: `${centerY(r.round, m.slot) - CARD_H / 2}px`,
                  width: `${colW}px`,
                  height: `${CARD_H}px`,
                  background: SLOT,
                  border: `1px solid ${m.state === 'live' ? 'rgba(226,105,79,0.7)' : LINE}`,
                }}
              >
                {postRow(m, 'a', nameChars)}
                <div style={{ display: 'flex', height: '1px', background: LINE, flexShrink: 0 }} />
                {postRow(m, 'b', nameChars)}
              </div>
            )),
          )}
          {/* Champion plate under the final */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'absolute',
              left: `${colX(cols - 1)}px`,
              top: `${finalCenter + CARD_H / 2 + 26}px`,
              width: `${colW}px`,
              padding: '10px 8px 12px',
              background: b.champion ? '#c19b52' : BOARD_2,
              border: `1px solid rgba(200,163,91,0.5)`,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontFamily: 'JetBrains',
                fontWeight: 700,
                fontSize: '13px',
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: b.champion ? '#1d1708' : MUTE,
              }}
            >
              Champion
            </div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '28px', lineHeight: 1.15, color: b.champion ? '#1d1708' : IVORY_2, marginTop: '2px' }}>
              {b.champion ? short(b.champion.name, 12) : 'TBD'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 'auto',
            paddingTop: '14px',
            borderTop: `1px solid ${LINE}`,
            fontFamily: 'JetBrains',
            fontSize: '15px',
            letterSpacing: '0.08em',
            color: MUTE,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex' }}>{`thesundaychronicle.app/leagues/${slug}/cup`}</div>
          <div style={{ display: 'flex', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Tie goes to the higher seed</div>
        </div>
      </div>
    ),
    { width: POST_W, height: POST_H, fonts },
  )
}

function postRow(m: CupMatch, which: 'a' | 'b', nameChars: number) {
  const s = m[which]
  const lost = !!m.winner && m.winner !== which
  const won = !!m.winner && m.winner === which
  if (s.kind === 'tbd') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, padding: '0 12px 0 40px' }}>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: '19px', color: MUTE }}>
          {s.options.length ? `${short(s.options[0], 8)} or ${short(s.options[1], 8)}` : 'To be decided'}
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, padding: '0 12px', opacity: lost ? 0.48 : 1 }}>
      <div style={{ display: 'flex', width: '28px', justifyContent: 'flex-end', marginRight: '10px', fontFamily: 'JetBrains', fontWeight: 700, fontSize: '16px', color: BRASS }}>
        {String(s.entrant.seed)}
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          fontFamily: 'DMSerif',
          fontSize: '24px',
          color: won ? BRASS_HI : IVORY,
          textDecoration: lost ? 'line-through' : 'none',
        }}
      >
        {short(s.entrant.name, nameChars)}
      </div>
      <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: won ? 700 : 400, fontSize: '16px', color: won ? BRASS_HI : IVORY_2 }}>
        {s.score != null ? pts(s.score) : ''}
      </div>
    </div>
  )
}
