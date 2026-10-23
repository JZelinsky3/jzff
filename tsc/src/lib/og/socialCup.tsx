// The League Cup's social card: the Cup page's green draw board, the trophy,
// the draw date on a cream ticket, and a sample draw so a stranger sees at a
// glance that it's a bracket. Draws its whole 1080x1350 frame, foot included.
//
// The sample draw uses the demo league's cast (the Instagram carousel's
// "Lakeshore League"), never a real league's names.

import type { Card } from '@/lib/social/content'
import { trophy } from '@/lib/cup/trophy'

type CupCard = Extract<Card, { template: 'cup' }>

const BOARD = '#0c271f'
const SLOT = '#143c31'
const LINE = 'rgba(236,228,206,0.16)'
const LINE_2 = 'rgba(236,228,206,0.34)'
const IVORY = '#ece4ce'
const IVORY_2 = '#c9c1aa'
const MUTE = '#8fa597'
const BRASS = '#c8a35b'
const BRASS_HI = '#e6cb8e'
const BRASS_LO = '#7d6230'
const TICKET = '#f1e8d2'
const TICKET_INK = '#10291f'

const W = 1080
const H = 1350
const INNER = W - 2 * 28 - 2 * 8 - 2 * 52 // frame, inner frame gap, padding

// Seeds 1-12 from the demo cast; 12 teams, top 4 on a bye.
const CAST = ['Bryce', 'Owen', 'Matt', 'Reid', 'Cole', 'Nate', 'Tyler', 'Drew', 'Grant', 'Jack', 'Vince', 'John']
type Side = { seed: number } | { or: [number, number] } | null
const ROUNDS: { name: string; week: number; games: [Side, Side][] }[] = [
  { name: 'Round 1', week: 8, games: [[{ seed: 8 }, { seed: 9 }], [{ seed: 5 }, { seed: 12 }], [{ seed: 7 }, { seed: 10 }], [{ seed: 6 }, { seed: 11 }]] },
  { name: 'Quarters', week: 9, games: [[{ seed: 1 }, { or: [8, 9] }], [{ seed: 4 }, { or: [5, 12] }], [{ seed: 2 }, { or: [7, 10] }], [{ seed: 3 }, { or: [6, 11] }]] },
  { name: 'Semis', week: 10, games: [[null, null], [null, null]] },
  { name: 'Final', week: 11, games: [[null, null]] },
]

function mono(text: string, size: number, color: string, opts: { bold?: boolean; spacing?: number } = {}) {
  return (
    <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: opts.bold ? 700 : 400, fontSize: size, letterSpacing: opts.spacing ?? 0, color }}>
      {text}
    </div>
  )
}

function slotRow(side: Side, bye: boolean) {
  if (!side) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, paddingLeft: 46 }}>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: 22, color: MUTE }}>TBD</div>
      </div>
    )
  }
  if ('or' in side) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, paddingLeft: 46 }}>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: 21, color: MUTE }}>{`${CAST[side.or[0] - 1]} or ${CAST[side.or[1] - 1]}`}</div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, padding: '0 12px' }}>
      <div style={{ display: 'flex', width: 26, justifyContent: 'flex-end', marginRight: 10 }}>{mono(String(side.seed), 17, BRASS, { bold: true })}</div>
      <div style={{ display: 'flex', flex: 1, fontFamily: 'DMSerif', fontSize: 25, color: IVORY }}>{CAST[side.seed - 1]}</div>
      {bye ? mono('BYE', 13, MUTE, { bold: true, spacing: 2 }) : null}
    </div>
  )
}

function bracket() {
  const bodyH = 360
  const cardH = 62
  const gap = 26
  const cols = ROUNDS.length
  const colW = Math.floor((INNER - gap * (cols - 1)) / cols)
  const colX = (r: number) => r * (colW + gap)
  const centerY = (r: number, slot: number) => ((slot + 0.5) * bodyH) / ROUNDS[r].games.length

  const lines: { left: number; top: number; width: number; height: number }[] = []
  for (let r = 0; r < cols - 1; r++) {
    const next = ROUNDS[r + 1].games.length
    ROUNDS[r].games.forEach((_, slot) => {
      const y1 = centerY(r, slot)
      // Round 1 feeds the bottom row of the same quarter; later rounds pair up.
      const into = next === ROUNDS[r].games.length ? slot : Math.floor(slot / 2)
      const row = next === ROUNDS[r].games.length ? 1 : slot % 2
      const y2 = centerY(r + 1, into) + (row === 0 ? -cardH / 4 : cardH / 4)
      const x1 = colX(r) + colW
      const mid = x1 + gap / 2
      lines.push({ left: x1, top: y1, width: gap / 2, height: 1 })
      lines.push({ left: mid, top: Math.min(y1, y2), width: 1, height: Math.abs(y2 - y1) + 1 })
      lines.push({ left: mid, top: y2, width: gap / 2, height: 1 })
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex' }}>
        {ROUNDS.map((r, i) => (
          <div key={r.name} style={{ display: 'flex', flexDirection: 'column', width: colW, marginRight: i === cols - 1 ? 0 : gap, paddingBottom: 8, borderBottom: `1px solid ${LINE_2}` }}>
            {mono(r.name.toUpperCase(), 16, IVORY, { bold: true, spacing: 3 })}
            <div style={{ display: 'flex', marginTop: 2 }}>{mono(`Week ${r.week}`, 15, BRASS)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', position: 'relative', height: bodyH, marginTop: 14 }}>
        {lines.map((l, i) => (
          <div key={`l${i}`} style={{ display: 'flex', position: 'absolute', left: l.left, top: l.top, width: l.width, height: l.height, background: LINE_2 }} />
        ))}
        {ROUNDS.flatMap((r, ri) =>
          r.games.map(([a, b], slot) => (
            <div
              key={`${ri}-${slot}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                position: 'absolute',
                left: colX(ri),
                top: centerY(ri, slot) - cardH / 2,
                width: colW,
                height: cardH,
                background: SLOT,
                border: `1px solid ${ri === 0 ? 'rgba(200,163,91,0.55)' : LINE}`,
              }}
            >
              {slotRow(a, ri === 1)}
              <div style={{ display: 'flex', height: 1, background: LINE, flexShrink: 0 }} />
              {slotRow(b, false)}
            </div>
          )),
        )}
        {/* The trophy plate under the final */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            position: 'absolute',
            left: colX(cols - 1),
            top: centerY(cols - 1, 0) + cardH / 2 + 22,
            width: colW,
            padding: '10px 12px',
            background: '#c19b52',
          }}
        >
          {trophy({ width: 34, brass: TICKET_INK, light: '#3b4a33', dark: TICKET_INK, plate: '#c19b52' })}
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 12 }}>
            {mono('CHAMPION', 14, '#1d1708', { bold: true, spacing: 3 })}
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 24, color: '#1d1708', lineHeight: 1.1 }}>Week 11</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ticket(card: CupCard) {
  const notch = (side: 'top' | 'bottom') => (
    <div style={{ display: 'flex', position: 'absolute', left: 184, [side]: -15, width: 30, height: 30, borderRadius: 15, background: BOARD }} />
  )
  return (
    <div style={{ display: 'flex', position: 'relative', background: TICKET, height: 136 }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: 199, borderRight: `3px dashed rgba(16,41,31,0.35)` }}>
        {mono('THE DRAW', 18, '#7a5a22', { bold: true, spacing: 4 })}
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 52, lineHeight: 1, color: TICKET_INK, marginTop: 8 }}>{card.time.split(' ').slice(0, -1).join(' ')}</div>
        {mono(card.time.split(' ').slice(-1).join(' ').toUpperCase(), 16, TICKET_INK, { bold: true, spacing: 3 })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, paddingLeft: 34 }}>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 50, lineHeight: 1, color: TICKET_INK }}>{card.date}</div>
        <div style={{ display: 'flex', marginTop: 14 }}>{mono(card.note.toUpperCase(), 18, '#7a5a22', { bold: true, spacing: 3 })}</div>
      </div>
      {notch('top')}
      {notch('bottom')}
    </div>
  )
}

export function cupCard(card: CupCard) {
  return (
    <div style={{ display: 'flex', width: W, height: H, background: BOARD, padding: 28, backgroundImage: `radial-gradient(circle at 75% 8%, #1d4d3c 0%, ${BOARD} 58%)` }}>
      <div style={{ display: 'flex', flex: 1, border: `1px solid ${LINE_2}`, padding: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, border: '1px solid rgba(200,163,91,0.5)', padding: '44px 52px 34px' }}>
          {/* Masthead: words left, trophy right */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              {mono(card.kicker.toUpperCase(), 22, BRASS, { bold: true, spacing: 6 })}
              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: card.title.length > 16 ? 66 : 96, lineHeight: 1, color: IVORY, marginTop: 12 }}>{card.title}</div>
              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: 30, lineHeight: 1.15, color: IVORY_2, marginTop: 12 }}>{card.dek}</div>
            </div>
            <div style={{ display: 'flex', marginLeft: 16 }}>
              {trophy({ width: 150, brass: BRASS, light: BRASS_HI, dark: BRASS_LO, plate: BOARD })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34 }}>{ticket(card)}</div>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 36 }}>{bracket()}</div>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
            {card.steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${LINE}`, padding: '11px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 19, border: `2px solid ${BRASS}`, marginRight: 20 }}>
                  {mono(String(i + 1), 20, BRASS, { bold: true })}
                </div>
                <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 31, color: IVORY }}>{step}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRASS, padding: '16px 20px' }}>
              {mono(card.cta.toUpperCase(), 23, '#1d1708', { bold: true, spacing: 3 })}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 16 }}>
              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 34, color: IVORY }}>The Sunday Chronicle.</div>
              {mono('thesundaychronicle.app', 20, MUTE, { spacing: 2 })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── The teaser posters ────────────────────────────────────────────────────
// Few words and one big picture, so the feed reads it before the caption:
// 'trophy' is the trophy in a burst of brass light; 'bracket' is an empty
// twelve-team draw closing in on it from both sides. Same board, frame,
// typefaces and foot as the card above.

type TeaserCard = Extract<Card, { template: 'cupTeaser' }>

function frame(...children: React.ReactNode[]) {
  return (
    <div style={{ display: 'flex', width: W, height: H, background: BOARD, padding: 28, backgroundImage: `radial-gradient(circle at 50% 38%, #1f5240 0%, ${BOARD} 62%)` }}>
      <div style={{ display: 'flex', flex: 1, border: `1px solid ${LINE_2}`, padding: 8 }}>
        <div style={{ display: 'flex', flex: 1, border: '1px solid rgba(200,163,91,0.5)', padding: '46px 52px 34px' }}>
          {/* An explicit column: satori lays a fragment's children out in a row. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>{children}</div>
        </div>
      </div>
    </div>
  )
}

function kickerRow(text: string) {
  const diamond = <div style={{ display: 'flex', width: 10, height: 10, background: BRASS, transform: 'rotate(45deg)' }} />
  return (
    <div key="kicker" style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', width: 90, height: 1, background: 'rgba(200,163,91,0.6)', marginRight: 18 }} />
      {diamond}
      <div style={{ display: 'flex', margin: '0 22px' }}>{mono(text.toUpperCase(), 24, BRASS, { bold: true, spacing: 8 })}</div>
      {diamond}
      <div style={{ display: 'flex', width: 90, height: 1, background: 'rgba(200,163,91,0.6)', marginLeft: 18 }} />
    </div>
  )
}

function titleBlock(card: TeaserCard, size: number) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: size, lineHeight: 0.98, color: IVORY }}>{card.title}</div>
      <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: size, lineHeight: 0.98, color: BRASS_HI }}>{card.title2}</div>
    </div>
  )
}

function closing(card: TeaserCard) {
  return (
    <div key="close" style={{ display: 'flex', flexDirection: 'column', alignSelf: 'stretch', marginTop: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'center', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: 34, color: IVORY_2, marginBottom: 22 }}>{card.line}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRASS, padding: '16px 20px' }}>
        {mono(card.strip.toUpperCase(), 26, '#1d1708', { bold: true, spacing: 5 })}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 16 }}>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 34, color: IVORY }}>The Sunday Chronicle.</div>
        {mono('thesundaychronicle.app', 20, MUTE, { spacing: 2 })}
      </div>
    </div>
  )
}

function trophyPoster(card: TeaserCard) {
  const box = 560
  const rays = 18
  return frame(
      kickerRow(card.kicker),
      <div key="art" style={{ display: 'flex', position: 'relative', width: box, height: box, alignItems: 'center', justifyContent: 'center', marginTop: 18 }}>
        {Array.from({ length: rays }, (_, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              position: 'absolute',
              left: box / 2 - 2,
              top: 0,
              width: 4,
              height: box,
              backgroundImage: 'linear-gradient(180deg, rgba(200,163,91,0) 0%, rgba(230,203,142,0.30) 30%, rgba(200,163,91,0) 50%, rgba(230,203,142,0.30) 70%, rgba(200,163,91,0) 100%)',
              transform: `rotate(${(i * 180) / rays}deg)`,
            }}
          />
        ))}
        <div style={{ display: 'flex', position: 'absolute', left: box / 2 - 190, top: box / 2 - 190, width: 380, height: 380, borderRadius: 190, backgroundImage: 'radial-gradient(circle, rgba(230,203,142,0.28) 0%, rgba(230,203,142,0) 70%)' }} />
        <div style={{ display: 'flex', marginTop: 10 }}>{trophy({ width: 360, brass: BRASS, light: BRASS_HI, dark: BRASS_LO, plate: BOARD })}</div>
      </div>,
      <div key="title" style={{ display: 'flex', marginTop: 8 }}>{titleBlock(card, 132)}</div>,
      closing(card),
  )
}

// The twelve-team draw, mirrored: round one on the outside, the byes
// waiting in the quarters, the semis, and the final under the trophy.
function bracketPoster(card: TeaserCard) {
  const areaW = W - 2 * 28 - 2 * 8 - 2 * 52 - 4
  const areaH = 540
  const gap = 20
  const cols = 7
  const colW = Math.floor((areaW - gap * (cols - 1)) / cols)
  const x = (c: number) => c * (colW + gap)
  const cardH = 76
  type Slot = { col: number; y: number; top: string; bottom: string; lit?: boolean }
  const q1 = areaH * 0.2
  const q2 = areaH * 0.8
  const mid = areaH / 2
  const slots: Slot[] = [
    { col: 0, y: q1, top: '8', bottom: '9', lit: true },
    { col: 0, y: q2, top: '5', bottom: '12', lit: true },
    { col: 1, y: q1, top: '1', bottom: '' },
    { col: 1, y: q2, top: '4', bottom: '' },
    { col: 2, y: mid, top: '', bottom: '' },
    { col: 3, y: mid + 70, top: '', bottom: '' },
    { col: 4, y: mid, top: '', bottom: '' },
    { col: 5, y: q1, top: '2', bottom: '' },
    { col: 5, y: q2, top: '3', bottom: '' },
    { col: 6, y: q1, top: '7', bottom: '10', lit: true },
    { col: 6, y: q2, top: '6', bottom: '11', lit: true },
  ]
  const lines: { left: number; top: number; width: number; height: number }[] = []
  const h = (x1: number, x2: number, y: number) => lines.push({ left: Math.min(x1, x2), top: y, width: Math.abs(x2 - x1), height: 2 })
  const v = (xx: number, y1: number, y2: number) => lines.push({ left: xx, top: Math.min(y1, y2), width: 2, height: Math.abs(y2 - y1) + 2 })
  const low = (y: number) => y + cardH / 4
  const high = (y: number) => y - cardH / 4
  for (const side of [0, 1] as const) {
    const r1 = side ? 6 : 0
    const qf = side ? 5 : 1
    const sf = side ? 4 : 2
    const out = (c: number) => (side ? x(c) : x(c) + colW)
    const into = (c: number) => (side ? x(c) + colW : x(c))
    // Round one into the bottom row of its quarter, the bye on top.
    for (const y of [q1, q2]) h(out(r1), into(qf), low(y))
    // Quarters into the semi.
    const m = side ? x(sf) + colW + gap / 2 : x(qf) + colW + gap / 2
    h(out(qf), m, q1)
    h(out(qf), m, q2)
    v(m, q1, high(mid))
    v(m, q2, low(mid))
    h(m, into(sf), high(mid))
    h(m, into(sf), low(mid))
    // Semi into the final.
    const fy = side ? low(mid + 70) : high(mid + 70)
    const m2 = side ? x(3) + colW + gap / 2 : x(sf) + colW + gap / 2
    h(out(sf), m2, mid)
    v(m2, mid, fy)
    h(m2, into(3), fy)
  }
  const seed = (text: string, lit: boolean) =>
    text ? (
      <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: 26, color: lit ? BRASS_HI : IVORY }}>{text}</div>
    ) : (
      <div style={{ display: 'flex', width: 22, height: 2, background: LINE_2 }} />
    )
  return frame(
      kickerRow(card.kicker),
      <div key="title" style={{ display: 'flex', marginTop: 34 }}>{titleBlock(card, 124)}</div>,
      <div key="art" style={{ display: 'flex', position: 'relative', width: areaW, height: areaH, marginTop: 40 }}>
        {lines.map((l, i) => (
          <div key={`l${i}`} style={{ display: 'flex', position: 'absolute', left: l.left, top: l.top, width: l.width, height: l.height, background: 'rgba(200,163,91,0.55)' }} />
        ))}
        {slots.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              position: 'absolute',
              left: x(s.col),
              top: s.y - cardH / 2,
              width: colW,
              height: cardH,
              background: s.col === 3 ? '#c19b52' : SLOT,
              border: `2px solid ${s.lit ? 'rgba(200,163,91,0.8)' : s.col === 3 ? '#c19b52' : LINE_2}`,
            }}
          >
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>{seed(s.top, !!s.lit)}</div>
            <div style={{ display: 'flex', height: 1, background: s.col === 3 ? 'rgba(29,23,8,0.35)' : LINE, flexShrink: 0 }} />
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>{seed(s.bottom, !!s.lit)}</div>
          </div>
        ))}
        <div style={{ display: 'flex', position: 'absolute', left: x(3) + colW / 2 - 70, top: mid + 70 - cardH / 2 - 186 }}>
          {trophy({ width: 140, brass: BRASS, light: BRASS_HI, dark: BRASS_LO, plate: BOARD })}
        </div>
      </div>,
      closing(card),
  )
}

export function cupTeaserCard(card: TeaserCard) {
  return card.look === 'bracket' ? bracketPoster(card) : trophyPoster(card)
}
