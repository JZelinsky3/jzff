// The picture the win-total ballot link unfurls into.
//
// Kept out of the route so the composition can be rendered and looked at
// without standing up a league, a token and a locked board first.
//
// Deliberately off the site's dark-and-gold house card: this is the buff
// carbon-copy stock of the ballot itself, so the preview looks like the
// thing you are about to open.

import { PAMS_ROSTER } from '@/lib/winBallot'

// Straight off ballot.css, so the preview and the page are the same object.
const PAPER = '#e4e2d5'
const PAPER_2 = '#edebe0'
const FIELD = '#f4f2e8'
const INK = '#21221c'
const INK_2 = '#4c4e44'
const INK_3 = '#7d7f72'
const RULE = '#c2c0af'
const CARBON = '#5c3e96'
const STAMP = '#b33a2b'

/** Which of the link's three lives the card is selling. */
export type CardPhase = 'gone' | 'ballot' | 'vote' | 'open'

export type BallotCardProps = {
  phase: CardPhase
  /** Filed ballots, or cast cards once the lines are up. */
  turnout: number
  /** The locked lines, highest first. Empty while the league is on ballots. */
  lines: { name: string; line: number }[]
  /** The roster and who has answered, for the panel before there are lines. */
  room: { name: string; done: boolean }[]
}

const COPY: Record<CardPhase, { form: string; head: string; em: string; sub: string; foot: string }> = {
  gone: {
    form: 'Form W/L', head: 'Wrong', em: 'door.',
    sub: 'This link is not the live one',
    foot: 'Open by invitation only',
  },
  ballot: {
    form: 'Form W/L', head: 'Call all', em: 'twelve.',
    sub: 'Win-total ballot · 14 games',
    foot: 'Twelve managers · fourteen games',
  },
  vote: {
    form: 'Form O/U', head: 'The board is', em: 'up.',
    sub: 'Over or under on all twelve',
    foot: 'No whole numbers · nothing pushes',
  },
  open: {
    form: 'Form O/U', head: 'The room has', em: 'spoken.',
    sub: 'Every pick, on the table',
    foot: 'Set before a snap was played',
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

/** The bordered slab on the right. Same frame whichever phase fills it. */
function Panel({ title, form, accent, children }: {
  title: string
  form: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: FIELD,
        border: `2px solid ${INK}`,
        boxShadow: `7px 7px 0 ${RULE}`,
        padding: '18px 22px 12px',
        marginBottom: '38px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow color={INK_2}>{title}</Eyebrow>
        <Eyebrow color={accent}>{form}</Eyebrow>
      </div>
      <div style={{ display: 'flex', width: '100%', height: '2px', background: INK, margin: '11px 0 2px' }} />
      <div style={{ display: 'flex', flex: 1 }}>{children}</div>
    </div>
  )
}

/**
 * Two columns of six, the shape both panels share. Returns one flex row
 * rather than a fragment: satori lays a fragment's children out as though
 * they were the same box, and the two columns print on top of each other.
 */
function Columns({ rows }: { rows: React.ReactNode[] }) {
  return (
    <div style={{ display: 'flex', flex: 1, width: '100%' }}>
      {[rows.slice(0, 6), rows.slice(6, 12)].map((col, ci) => (
        <div
          key={ci}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-around',
            marginLeft: ci ? '26px' : 0,
          }}
        >
          {col}
        </div>
      ))}
    </div>
  )
}

/**
 * The rotated seal in the corner. One word, and it carries the phase.
 *
 * Two nested solid rules rather than one `double` border, which satori
 * refuses to parse outright.
 */
function Seal({ word, color }: { word: string; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        border: `3px solid ${color}`,
        padding: '3px',
        transform: 'rotate(-11deg)',
        opacity: 0.9,
      }}
    >
      <div
        style={{
          display: 'flex',
          border: `2px solid ${color}`,
          color,
          fontFamily: 'JetBrains',
          fontSize: '23px',
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          padding: '8px 16px',
        }}
      >
        {word}
      </div>
    </div>
  )
}

/** A filled pip per manager: how much of the room has answered. */
function Turnout({ done, label }: { done: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex' }}>
        {Array.from({ length: PAMS_ROSTER.length }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              width: '24px',
              height: '11px',
              marginRight: '7px',
              background: i < done ? CARBON : 'transparent',
              border: `1.5px solid ${i < done ? CARBON : RULE}`,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: '13px' }}>
        <Eyebrow>{label}</Eyebrow>
      </div>
    </div>
  )
}

export function BallotCard({ phase, turnout, lines, room }: BallotCardProps) {
  const copy = COPY[phase]
  const hasPanel = phase !== 'gone'
  const seal = phase === 'ballot' ? { word: 'Sealed', color: STAMP }
    : phase === 'vote' ? { word: 'Open', color: CARBON }
    : phase === 'open' ? { word: 'Final', color: STAMP }
    : null

  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        background: PAPER,
        color: INK,
        fontFamily: 'JetBrains',
        position: 'relative',
      }}
    >
      {/* Carbon edge: the violet band down the left, as on a duplicate slip. */}
      <div
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0, width: '18px',
          display: 'flex',
          background: phase === 'gone' ? STAMP : CARBON,
        }}
      />

      <div style={{ flex: 1, display: 'flex', padding: '54px 62px 0 80px' }}>
        {/* ── Left: the masthead ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: hasPanel ? '540px' : '100%',
            paddingRight: '34px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <Eyebrow color={INK_2}>PA Milk Society</Eyebrow>
            {!hasPanel && <Eyebrow>{copy.form} · 2026</Eyebrow>}
          </div>

          <div style={{ display: 'flex', width: '100%', height: '3px', background: INK, margin: '14px 0 26px' }} />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'DMSerif',
              fontSize: hasPanel ? '78px' : '92px',
              lineHeight: 1.02,
              letterSpacing: '-0.02em',
            }}
          >
            <span style={{ display: 'flex' }}>{copy.head}</span>
            {/* A dead link is red all the way through, to match the edge. */}
            <span style={{ display: 'flex', fontStyle: 'italic', color: phase === 'gone' ? STAMP : CARBON }}>
              {copy.em}
            </span>
          </div>

          <div style={{ display: 'flex', fontSize: '21px', color: INK_2, marginTop: '20px' }}>
            {copy.sub}
          </div>

          {/* The seal sits in the gap under the masthead. In the corner it
              landed on the header, and beside the turnout its rotation hung
              into the footer. */}
          {seal && (
            <div style={{ display: 'flex', marginTop: '40px' }}>
              <Seal word={seal.word} color={seal.color} />
            </div>
          )}

          <div style={{ display: 'flex', flex: 1 }} />

          {phase === 'gone' ? (
            <div style={{ display: 'flex', width: '470px', fontSize: '19px', color: INK_2, lineHeight: 1.5, marginBottom: '48px' }}>
              Ask Joey for the link he sent the group and open that one instead.
            </div>
          ) : (
            <div style={{ display: 'flex', marginBottom: '46px' }}>
              <Turnout
                done={turnout}
                label={`${turnout} of ${PAMS_ROSTER.length} ${phase === 'ballot' ? 'ballots filed' : 'cards in'}`}
              />
            </div>
          )}
        </div>

        {/* ── Right: the room before the lines exist, the lines after ── */}
        {phase === 'ballot' && (
          <Panel title="The room" form={copy.form} accent={INK_3}>
            <Columns
              rows={room.map((m) => (
                <div
                  key={m.name}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    borderBottom: `1px dashed ${RULE}`,
                    paddingBottom: '4px',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      fontFamily: 'DMSerif',
                      fontSize: '29px',
                      color: m.done ? INK : INK_3,
                    }}
                  >
                    {m.name}
                  </span>
                  {m.done && <Eyebrow color={CARBON} size={13} track={0.2}>in</Eyebrow>}
                </div>
              ))}
            />
          </Panel>
        )}

        {(phase === 'vote' || phase === 'open') && (
          <Panel title="The lines" form={copy.form} accent={seal ? seal.color : INK_3}>
            <Columns
              rows={lines.map((l) => (
                <div
                  key={l.name}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    // satori only knows solid and dashed.
                    borderBottom: `1px dashed ${RULE}`,
                    paddingBottom: '4px',
                  }}
                >
                  <span style={{ display: 'flex', fontFamily: 'DMSerif', fontSize: '29px' }}>{l.name}</span>
                  <span style={{ display: 'flex', fontWeight: 700, fontSize: '26px', color: CARBON }}>
                    {l.line.toFixed(1)}
                  </span>
                </div>
              ))}
            />
          </Panel>
        )}
      </div>

      {/* ── Footer rule ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `2px solid ${INK}`,
          background: PAPER_2,
          padding: '18px 62px 18px 80px',
        }}
      >
        <Eyebrow color={INK_2}>{copy.foot}</Eyebrow>
        <Eyebrow color={INK_3}>thesundaychronicle.app</Eyebrow>
      </div>
    </div>
  )
}
