// OG card for the Games Page and Roster Roulette.
// URL: /api/og/games                          → neutral invitation
//      /api/og/games?w=12&ppg=118.4&pool=…    → a finished run, as a challenge
//
// Two states, one route. The neutral card is what gets scraped when someone
// drops a bare /games/roulette link in a group chat: it has to sell the game
// to a stranger without implying anyone's score. The result card is what the
// share button produces — a scoreboard with the record on it and the exact
// wheel named, so the reply is "I can beat that."
//
// Deliberately no player names or league data on either: a preview is seen
// by people who never opted into anything.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { GAMES } from '@/lib/minigames/record'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

const INK = '#0b1119'
const INK_SOFT = '#121c27'
const INK_RAISE = '#1e2d3d'
const CREAM = '#f4ebd8'
const CREAM_SOFT = '#c2bba9'
const GOLD = '#e8c889'
const GOLD_DEEP = '#a88a4a'

const POS = [
  { label: 'QB', color: '#8fb3d6' },
  { label: 'RB', color: '#7ac795' },
  { label: 'RB', color: '#7ac795' },
  { label: 'WR', color: '#e29278' },
  { label: 'WR', color: '#e29278' },
  { label: 'TE', color: '#c9a9ea' },
  { label: 'FLEX', color: GOLD },
]

// The bundled TTFs don't carry U+2605, so a literal ★ renders as tofu.
function Star({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2z" />
    </svg>
  )
}

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

/** Trim anything crawler-facing: user-supplied and shown at 1200px wide. */
function clean(raw: string | null, max: number): string | null {
  if (!raw) return null
  const t = raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

export async function GET(req: Request) {
  const fonts = await loadFonts()
  const params = new URL(req.url).searchParams

  // Number(null) is 0, which is a perfectly valid win count — so the
  // presence of the param has to be checked before its value, or a bare
  // /api/og/games renders a 0-17 scoreboard instead of the neutral card.
  const winsParam = params.get('w')
  const winsRaw = winsParam === null ? NaN : Number(winsParam)
  const hasResult = Number.isFinite(winsRaw) && winsRaw >= 0 && winsRaw <= GAMES
  const wins = hasResult ? Math.round(winsRaw) : 0
  const ppgRaw = Number(params.get('ppg'))
  const ppg = Number.isFinite(ppgRaw) && ppgRaw > 0 ? Math.round(ppgRaw * 10) / 10 : null
  const poolLabel = clean(params.get('pool'), 34)
  const perfect = hasResult && wins === GAMES

  // The lineup rides in one param: slot,name,ppg;slot,name,ppg;...
  // Surnames only, which keeps a shareable URL to a sane length and reads
  // like a depth chart anyway.
  const lineup = (clean(params.get('l'), 400) ?? '')
    .split(';')
    .map((row) => row.split(','))
    .filter((parts) => parts.length === 3 && parts[0] && parts[1])
    .slice(0, 7)
    .map(([slot, name, ppg]) => ({
      slot: slot.slice(0, 5),
      name: name.slice(0, 18),
      ppg: ppg.slice(0, 6),
      color:
        POS.find((p) => p.label === slot.replace(/\d/g, ''))?.color ?? GOLD,
    }))

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(155deg, ${INK} 0%, ${INK_SOFT} 55%, ${INK_RAISE} 100%)`,
          color: CREAM,
          fontFamily: 'JetBrains',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: `radial-gradient(circle at 22% 26%, ${GOLD}26 0%, transparent 46%), radial-gradient(circle at 82% 84%, ${GOLD_DEEP}22 0%, transparent 44%)`,
          }}
        />

        <div style={{ display: 'flex', height: '16px', background: GOLD }} />

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            padding: '0 68px',
          }}
        >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingRight: lineup.length > 0 ? '28px' : '0',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              fontSize: '16px',
              fontWeight: 700,
              letterSpacing: '0.36em',
              textTransform: 'uppercase',
              color: GOLD,
            }}
          >
            <Star size={15} color={GOLD} />
            <span style={{ display: 'flex' }}>
              The Games Page · Roster Roulette
            </span>
          </div>

          {hasResult ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '28px', marginTop: '18px' }}>
                <span
                  style={{
                    display: 'flex',
                    fontSize: '150px',
                    fontWeight: 700,
                    letterSpacing: '-0.04em',
                    lineHeight: 1,
                    color: perfect ? GOLD : CREAM,
                  }}
                >
                  {wins}-{GAMES - wins}
                </span>
                {ppg !== null && (
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      fontSize: '17px',
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      color: CREAM_SOFT,
                    }}
                  >
                    <span style={{ display: 'flex', fontSize: '40px', fontWeight: 700, color: GOLD, letterSpacing: '-0.01em' }}>
                      {ppg}
                    </span>
                    <span style={{ display: 'flex', marginTop: '6px' }}>PPG</span>
                  </span>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontStyle: 'italic',
                  fontSize: '46px',
                  color: CREAM,
                  marginTop: '10px',
                }}
              >
                {perfect ? 'A perfect season.' : 'Beat this lineup.'}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '17px',
                  letterSpacing: '0.1em',
                  color: CREAM_SOFT,
                  marginTop: '16px',
                }}
              >
                Same nine teams{poolLabel ? ` · ${poolLabel}` : ''}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontSize: '92px',
                  lineHeight: 1.02,
                  color: CREAM,
                  marginTop: '20px',
                }}
              >
                Can you go
              </div>
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontStyle: 'italic',
                  fontSize: '92px',
                  lineHeight: 1.02,
                  color: GOLD,
                }}
              >
                17-0?
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '21px',
                  lineHeight: 1.5,
                  color: CREAM_SOFT,
                  marginTop: '24px',
                  maxWidth: '760px',
                }}
              >
                Spin for a real fantasy team from a real season. Take one player off
                it. Fill seven slots and see what the lineup is worth.
              </div>
            </div>
          )}

          {/* Empty slots as a depth chart, only when there's no real lineup
              to show in its place. */}
          {lineup.length === 0 && (
            <div style={{ display: 'flex', gap: '9px', marginTop: '38px' }}>
              {POS.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '92px',
                    height: '46px',
                    border: `1px solid ${s.color}66`,
                    borderLeft: `3px solid ${s.color}`,
                    borderRadius: '4px',
                    background: '#00000038',
                    color: s.color,
                    fontSize: '16px',
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                  }}
                >
                  {s.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* The team you actually built. The right half was dead space, and
            the names are the part anyone in a league chat wants to argue
            with. */}
        {lineup.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '440px',
              border: `1px solid ${GOLD}44`,
              borderRadius: '6px',
              background: '#00000040',
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.26em',
                textTransform: 'uppercase',
                color: GOLD,
                paddingBottom: '9px',
                borderBottom: `1px solid ${GOLD}33`,
              }}
            >
              <span style={{ display: 'flex' }}>The lineup</span>
              <span style={{ display: 'flex' }}>PPG</span>
            </div>
            {lineup.map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '7px 0 6px',
                  borderBottom: i < lineup.length - 1 ? `1px solid ${CREAM}12` : 'none',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    width: '46px',
                    fontSize: '13px',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: row.color,
                  }}
                >
                  {row.slot}
                </span>
                <span
                  style={{
                    display: 'flex',
                    flex: 1,
                    fontSize: '20px',
                    color: CREAM,
                    overflow: 'hidden',
                  }}
                >
                  {row.name}
                </span>
                <span style={{ display: 'flex', fontSize: '19px', fontWeight: 700, color: GOLD }}>
                  {row.ppg}
                </span>
              </div>
            ))}
          </div>
        )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 84px',
            background: GOLD,
            color: INK,
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>Free · No account needed</span>
          <span style={{ display: 'flex' }}>thesundaychronicle.app/games</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    }
  )
}
