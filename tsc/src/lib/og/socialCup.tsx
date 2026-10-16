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
