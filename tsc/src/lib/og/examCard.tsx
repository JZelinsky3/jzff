// The picture THE MILK EXAM link unfurls into.
//
// Kept out of the route so the composition can be rendered and looked at
// without standing up a league and a token first.
//
// Off the MILK ORDER stock rather than the site's house card, so the preview
// looks like the thing you are about to open: warm near-black, cream ink, and
// gold on nothing but the number and the one lit answer.
//
// Satori rules that bite here: every container needs an explicit
// `display: flex`, `gap` is unreliable so spacing is margins, and only the
// two families loaded by the route exist (DMSerif, JetBrains). The countdown
// cards are set in Helvetica Neue Condensed, which is not among them, so the
// headline is the serif instead. Same ground, same gold, different face.

const BG = '#0e0d0c'
const INK = '#f2ece0'
const INK_2 = '#9c9486'
const INK_3 = '#6b645b'
const LAB = '#bdb2a1'
const HAIR = '#2b2824'
const GOLD = '#cfa54b'
const GOLD_2 = '#7d642c'
const GOLDWASH = 'rgba(207,165,75,0.10)'

/** Which of the link's lives the card is selling. */
export type ExamPhase = 'gone' | 'fresh' | 'running' | 'full'

export type ExamCardProps = {
  phase: ExamPhase
  /** Questions in the edition, so the card never hardcodes twenty. */
  count: number
  /** How many have filed a run. */
  turnout: number
  /** Roster size, for the "n of twelve" line. */
  seats: number
  /** The top of the board, if anyone has played. */
  top: { name: string; score: number }[]
}

const COPY: Record<ExamPhase, { head: string; em: string; sub: string; foot: string }> = {
  gone: {
    head: 'Wrong',
    em: 'door.',
    sub: 'This link is not the live one',
    foot: 'Open by invitation only',
  },
  fresh: {
    head: 'The Milk',
    em: 'Exam.',
    sub: 'Seven years of this league, in twenty questions',
    foot: 'Four names a question',
  },
  running: {
    head: 'The Milk',
    em: 'Exam.',
    sub: 'The board is filling up',
    foot: 'Four names a question',
  },
  full: {
    head: 'Everybody',
    em: 'played.',
    sub: 'Every score is in',
    foot: 'The room, graded',
  },
}

function Eyebrow({
  children, color = INK_3, size = 17, track = 0.3,
}: {
  children: React.ReactNode
  color?: string
  size?: number
  track?: number
}) {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: 'JetBrains',
        fontSize: `${size}px`,
        fontWeight: 700,
        letterSpacing: `${track}em`,
        textTransform: 'uppercase',
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  )
}

export function ExamCard({ phase, count, turnout, seats, top }: ExamCardProps) {
  const copy = COPY[phase]
  const showBoard = phase !== 'gone' && top.length > 0

  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: BG,
        color: INK,
        padding: '52px 60px 46px',
      }}
    >
      {/* masthead */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontSize: '30px',
              letterSpacing: '0.01em',
              color: INK,
            }}
          >
            PA Milk Society
          </div>
          <Eyebrow color={GOLD}>
            {phase === 'gone' ? 'Retired link' : `${count} questions`}
          </Eyebrow>
        </div>
        <div style={{ display: 'flex', width: '100%', height: '1px', background: GOLD_2, marginTop: '15px' }} />
      </div>

      {/* the middle: headline left, board or pitch right */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: showBoard ? '600px' : '760px' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'DMSerif',
              fontSize: '118px',
              lineHeight: 0.92,
              letterSpacing: '-0.02em',
              color: INK,
            }}
          >
            <div style={{ display: 'flex' }}>{copy.head}</div>
            <div style={{ display: 'flex', fontStyle: 'italic', color: GOLD }}>{copy.em}</div>
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontSize: '25px',
              color: INK_2,
              marginTop: '20px',
            }}
          >
            {copy.sub}
          </div>
        </div>

        {showBoard ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '330px',
              border: `1px solid ${HAIR}`,
              background: 'rgba(242,236,224,0.02)',
              padding: '18px 20px 14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Eyebrow color={LAB} size={14} track={0.22}>Leading</Eyebrow>
              <Eyebrow color={GOLD} size={14} track={0.22}>{turnout} of {seats}</Eyebrow>
            </div>
            <div style={{ display: 'flex', width: '100%', height: '1px', background: HAIR, margin: '13px 0 4px' }} />
            {top.slice(0, 3).map((r) => (
              <div
                key={r.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginTop: '11px',
                }}
              >
                <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '30px', color: INK }}>
                  {r.name}
                </div>
                <div style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '30px', color: GOLD }}>
                  {r.score}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Four slabs, one lit: the shape of a question on the page itself. */
          <div style={{ display: 'flex', flexDirection: 'column', width: '300px', marginBottom: '8px' }}>
            {[0, 1, 2, 3].map((n) => (
              <div
                key={n}
                style={{
                  display: 'flex',
                  height: '46px',
                  marginTop: n === 0 ? 0 : '10px',
                  border: `1px solid ${n === 1 ? GOLD : HAIR}`,
                  background: n === 1 ? GOLDWASH : 'rgba(242,236,224,0.02)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* foot */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', width: '100%', height: '1px', background: HAIR, marginBottom: '16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Eyebrow color={INK_3} size={15} track={0.24}>{copy.foot}</Eyebrow>
          <Eyebrow color={INK_3} size={15} track={0.24}>The Sunday Chronicle</Eyebrow>
        </div>
      </div>
    </div>
  )
}
