// The social post card, 1080x1350 (4:5, which both X and Threads show
// uncropped in the feed). Drawn by /api/og/social/<id>/ from the `card` on a
// social_posts row.
//
// The stat cards rotate through designs (card.design, see content.ts), each
// on its own paper stock, so the feed isn't the same cream list every week:
// the ledger here, the charts and the poster in ./socialDesigns. The League
// Cup has its own card in ./socialCup. The typefaces and the foot never change.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import type { Card, Row } from '@/lib/social/content'
import { barsCard, columnsCard, posterCard, scatterCard, timelineCard } from './socialDesigns'
import { cupCard } from './socialCup'
import { CREAM, GRAPH, NAVY, NIGHT, SALMON, doubleRule, flag, type Stock } from './socialParts'

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

function foot(s: Stock) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
      <div style={{ display: 'flex', height: 2, background: s.ink }} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 18 }}>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 40, color: s.ink }}>The Sunday Chronicle.</div>
        <div style={{ display: 'flex', fontFamily: 'JetBrains', fontSize: 22, letterSpacing: 2, color: s.mute }}>thesundaychronicle.app</div>
      </div>
    </div>
  )
}

/** One agate line: rank, name over meta, value. */
function line(s: Stock, n: number, row: Row, big?: boolean) {
  return (
    <div key={n} style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${s.rule}`, padding: big ? '20px 0' : '14px 0' }}>
      <div style={{ display: 'flex', width: 70, fontFamily: 'DMSerif', fontSize: big ? 56 : 44, color: s.accent }}>{n}</div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: big ? 50 : 40, color: s.ink, lineHeight: 1.05 }}>{row.name}</div>
        <div style={{ display: 'flex', fontFamily: 'JetBrains', fontSize: 22, letterSpacing: 1, color: s.mute, marginTop: 6 }}>
          {[row.meta, row.note].filter(Boolean).join('  ·  ')}
        </div>
      </div>
      <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: big ? 56 : 44, color: s.ink }}>{row.value}</div>
    </div>
  )
}

type Drawn = { stock: Stock; body: React.ReactNode; /** Draws its own frame, foot included. */ bare?: boolean }

function draw(card: Card | null): Drawn {
  const s = CREAM
  if (!card) {
    return {
      stock: s,
      body: (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {flag(s, 'Drop Regret Index')}
          {doubleRule(s)}
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 92, lineHeight: 1, color: s.ink, marginTop: 60 }}>Written on the day.</div>
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: 40, color: s.mute, marginTop: 28 }}>
            This card is drawn from Sunday&apos;s scores once Monday night is final.
          </div>
        </div>
      ),
    }
  }

  if (card.template === 'cup') return { stock: s, body: cupCard(card), bare: true }

  if (card.template === 'history' || card.template === 'regret') {
    switch (card.design) {
      case 'bars': return { stock: SALMON, body: barsCard(SALMON, card) }
      case 'poster': return { stock: NIGHT, body: posterCard(NIGHT, card) }
      case 'columns': if (card.template === 'history' && card.seasons?.length) return { stock: NAVY, body: columnsCard(NAVY, card) }; break
      case 'timeline': if (card.template === 'history' && card.field?.length) return { stock: GRAPH, body: timelineCard(GRAPH, card) }; break
      case 'scatter': if (card.template === 'regret' && card.field?.length) return { stock: GRAPH, body: scatterCard(GRAPH, card) }; break
    }
  }

  if (card.template === 'history') {
    return {
      stock: s,
      body: (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {flag(s, 'This week in fantasy history', `Week ${card.week}`)}
          {doubleRule(s)}
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 92, lineHeight: 1.02, color: s.ink, marginTop: 40 }}>
            Top Week {card.week} Games Ever
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontFamily: 'JetBrains', fontWeight: 700, fontSize: 22, letterSpacing: 4, color: s.mute, marginTop: 28 }}>
            PPR
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 24 }}>
              <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: 24, letterSpacing: 3, color: s.accent }}>{card.hero.meta.toUpperCase()}</div>
              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 72, lineHeight: 1, color: s.ink, marginTop: 10 }}>{card.hero.name}</div>
              <div style={{ display: 'flex', fontFamily: 'JetBrains', fontSize: 24, color: s.mute, marginTop: 14 }}>{card.hero.line}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 170, lineHeight: 0.9, color: s.accent }}>{card.hero.value}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
            {card.rows.map((r, i) => line(s, i + 2, r))}
          </div>
        </div>
      ),
    }
  }

  if (card.template === 'regret') {
    return {
      stock: s,
      body: (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {flag(s, 'The Drop Regret Index', `Week ${card.week}`)}
          {doubleRule(s)}
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 84, lineHeight: 1.02, color: s.ink, marginTop: 40 }}>
            You let them go.
          </div>
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: 38, color: s.mute, marginTop: 14, marginBottom: 30 }}>
            The week&apos;s most-dropped players on Sleeper, and what they scored on Sunday.
          </div>
          {card.rows.map((r, i) => line(s, i + 1, r, i < 3))}
          <div style={{ display: 'flex', fontFamily: 'JetBrains', fontSize: 20, color: s.mute, marginTop: 18 }}>
            PPR points. Drops across all Sleeper leagues, Tuesday to Saturday.
          </div>
        </div>
      ),
    }
  }

  return {
    stock: s,
    body: (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {flag(s, card.kicker, card.right ?? 'Every Tuesday')}
        {doubleRule(s)}
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 120, lineHeight: 0.98, color: s.ink, marginTop: 56 }}>{card.title}</div>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: 46, color: s.mute, marginTop: 24, marginBottom: 44 }}>{card.dek}</div>
        {card.points.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', borderTop: `1px solid ${s.rule}`, padding: '22px 0' }}>
            <div style={{ display: 'flex', width: 70, fontFamily: 'JetBrains', fontWeight: 700, fontSize: 26, color: s.accent }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 44, color: s.ink }}>{p}</div>
          </div>
        ))}
        <div style={{ display: 'flex', marginTop: 36 }}>
          <div style={{ display: 'flex', border: `3px solid ${s.accent}`, color: s.accent, fontFamily: 'JetBrains', fontWeight: 700, fontSize: 26, letterSpacing: 4, padding: '12px 20px' }}>
            {card.stamp ?? '10 DAYS FREE'}
          </div>
        </div>
      </div>
    ),
  }
}

export async function renderSocialCard(card: Card | null): Promise<ImageResponse> {
  const fonts = await loadFonts()
  const { stock, body, bare } = draw(card)
  return new ImageResponse(
    bare ? (
      <div style={{ width: '1080px', height: '1350px', display: 'flex' }}>{body}</div>
    ) : (
      <div style={{ width: '1080px', height: '1350px', display: 'flex', flexDirection: 'column', background: stock.bg, padding: '64px 72px 56px' }}>
        {body}
        {foot(stock)}
      </div>
    ),
    {
      width: 1080,
      height: 1350,
      fonts,
      // Short: a Tuesday post's card changes once when it is filled.
      headers: { 'Cache-Control': 'public, max-age=300' },
    },
  )
}
