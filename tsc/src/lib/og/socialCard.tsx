// The social post card, 1080x1350 (4:5, which both X and Threads show
// uncropped in the feed). Newsprint: cream paper, ink, one red. Drawn by
// /api/og/social/<id>/ from the `card` on a social_posts row.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import type { Card, Row } from '@/lib/social/content'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

const PAPER = '#f2e9d6'
const INK = '#16130f'
const MUTE = '#6b5d44'
const RULE = '#cdbf9f'
const RED = '#a3271d'

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

function Flag({ label, right }: { label: string; right?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', background: RED, color: PAPER, fontFamily: 'JetBrains', fontWeight: 700, fontSize: 26, letterSpacing: 4, padding: '10px 18px' }}>
        {label.toUpperCase()}
      </div>
      {right ? (
        <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: 26, letterSpacing: 4, color: INK }}>{right.toUpperCase()}</div>
      ) : null}
    </div>
  )
}

function DoubleRule() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26 }}>
      <div style={{ display: 'flex', height: 4, background: INK }} />
      <div style={{ display: 'flex', height: 1, background: INK, marginTop: 4 }} />
    </div>
  )
}

function Foot() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
      <div style={{ display: 'flex', height: 2, background: INK }} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 18 }}>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 40, color: INK }}>The Sunday Chronicle.</div>
        <div style={{ display: 'flex', fontFamily: 'JetBrains', fontSize: 22, letterSpacing: 2, color: MUTE }}>thesundaychronicle.app</div>
      </div>
    </div>
  )
}

/** One agate line: rank, name over meta, value. */
function Line({ n, row, big }: { n: number; row: Row; big?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${RULE}`, padding: big ? '20px 0' : '14px 0' }}>
      <div style={{ display: 'flex', width: 70, fontFamily: 'DMSerif', fontSize: big ? 56 : 44, color: RED }}>{n}</div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: big ? 50 : 40, color: INK, lineHeight: 1.05 }}>{row.name}</div>
        <div style={{ display: 'flex', fontFamily: 'JetBrains', fontSize: 22, letterSpacing: 1, color: MUTE, marginTop: 6 }}>
          {[row.meta, row.note].filter(Boolean).join('  ·  ')}
        </div>
      </div>
      <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: big ? 56 : 44, color: INK }}>{row.value}</div>
    </div>
  )
}

function Body({ card }: { card: Card | null }) {
  if (!card) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Flag label="Drop Regret Index" />
        <DoubleRule />
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 92, lineHeight: 1, color: INK, marginTop: 60 }}>Written on the day.</div>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: 40, color: MUTE, marginTop: 28 }}>
          This card is drawn from Sunday&apos;s scores once Monday night is final.
        </div>
      </div>
    )
  }

  if (card.template === 'history') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Flag label="This week in fantasy history" right={`Week ${card.week}`} />
        <DoubleRule />
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 92, lineHeight: 1.02, color: INK, marginTop: 40 }}>
          Top Week {card.week} Games Ever
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', fontFamily: 'JetBrains', fontWeight: 700, fontSize: 22, letterSpacing: 4, color: MUTE, marginTop: 28 }}>
          PPR
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 24 }}>
            <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: 24, letterSpacing: 3, color: RED }}>{card.hero.meta.toUpperCase()}</div>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 72, lineHeight: 1, color: INK, marginTop: 10 }}>{card.hero.name}</div>
            <div style={{ display: 'flex', fontFamily: 'JetBrains', fontSize: 24, color: MUTE, marginTop: 14 }}>{card.hero.line}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 170, lineHeight: 0.9, color: RED }}>{card.hero.value}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
          {card.rows.map((r, i) => <Line key={i} n={i + 2} row={r} />)}
        </div>
      </div>
    )
  }

  if (card.template === 'regret') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Flag label="The Drop Regret Index" right={`Week ${card.week}`} />
        <DoubleRule />
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 84, lineHeight: 1.02, color: INK, marginTop: 40 }}>
          You let them go.
        </div>
        <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: 38, color: MUTE, marginTop: 14, marginBottom: 30 }}>
          The week&apos;s most-dropped players on Sleeper, and what they scored on Sunday.
        </div>
        {card.rows.map((r, i) => <Line key={i} n={i + 1} row={r} big={i < 3} />)}
        <div style={{ display: 'flex', fontFamily: 'JetBrains', fontSize: 20, color: MUTE, marginTop: 18 }}>
          PPR points. Drops across all Sleeper leagues, Tuesday to Saturday.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Flag label={card.kicker} right="Every Tuesday" />
      <DoubleRule />
      <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 120, lineHeight: 0.98, color: INK, marginTop: 56 }}>{card.title}</div>
      <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: 'italic', fontSize: 46, color: MUTE, marginTop: 24, marginBottom: 44 }}>{card.dek}</div>
      {card.points.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', borderTop: `1px solid ${RULE}`, padding: '22px 0' }}>
          <div style={{ display: 'flex', width: 70, fontFamily: 'JetBrains', fontWeight: 700, fontSize: 26, color: RED }}>{String(i + 1).padStart(2, '0')}</div>
          <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: 44, color: INK }}>{p}</div>
        </div>
      ))}
      <div style={{ display: 'flex', marginTop: 36 }}>
        <div style={{ display: 'flex', border: `3px solid ${RED}`, color: RED, fontFamily: 'JetBrains', fontWeight: 700, fontSize: 26, letterSpacing: 4, padding: '12px 20px' }}>
          10 DAYS FREE
        </div>
      </div>
    </div>
  )
}

export async function renderSocialCard(card: Card | null): Promise<ImageResponse> {
  const fonts = await loadFonts()
  return new ImageResponse(
    (
      <div style={{ width: '1080px', height: '1350px', display: 'flex', flexDirection: 'column', background: PAPER, padding: '64px 72px 56px' }}>
        <Body card={card} />
        <Foot />
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
