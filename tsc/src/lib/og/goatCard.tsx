// The picture the greatest-team bracket link unfurls into.
//
// Kept out of the route so the composition can be rendered and looked at
// without standing up a league, a token and a live round first.
//
// Same buff stock as the win-total ballot's card, ledger green where that one
// runs violet: the two events share an offseason and should unfurl as a set.

// Straight off goat.css, so the preview and the page are the same object.
const PAPER = '#e6e3d5'
const INK = '#1f221c'
const INK_2 = '#4a4d43'
const INK_3 = '#7c7f72'
const RULE = '#c3c1af'
const GREEN = '#2d6146'

/** Which of the link's lives the card is selling. */
export type GoatPhase = 'gone' | 'open' | 'between' | 'crowned'

export type GoatCardProps = {
  phase: GoatPhase
  /** Which round is live, so the headline can speak to it. */
  round: 'r16' | 'qf' | 'sf' | 'final' | null
  /** Cards in, and how many the room holds. */
  turnout: number
  roomSize: number
  /** Set once the final is settled. */
  champion: { name: string; team: string; record: string } | null
}

function Eyebrow({
  children, color = INK_3, size = 17, track = 0.28,
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

const COPY: Record<GoatPhase, { head: string; em: string; sub: string }> = {
  gone: {
    head: 'Wrong', em: 'door.',
    sub: 'This link is not the live one',
  },
  open: {
    head: 'Who had the', em: 'best team ever?',
    sub: 'Voting is open',
  },
  between: {
    head: 'Who had the', em: 'best team ever?',
    sub: 'Sixteen teams, one winner',
  },
  crowned: {
    head: 'It is', em: 'settled.',
    sub: 'The best team in league history',
  },
}

/** While a round is live the subhead says which one, and what it costs. */
const ROUND_SUB: Record<string, string> = {
  r16: 'Round of 16 · call all eight',
  qf: 'Quarterfinals · call all four',
  sf: 'Semifinals · call both',
  final: 'The final · one call',
}

export function GoatCard({ phase, round, turnout, roomSize, champion }: GoatCardProps) {
  const copy = COPY[phase]
  const sub = phase === 'open' && round ? ROUND_SUB[round] ?? copy.sub : copy.sub

  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: PAPER,
        padding: '48px 70px 44px',
        textAlign: 'center',
      }}
    >
      <Eyebrow color={GREEN} size={19}>PA Milk Society · 2026</Eyebrow>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {champion ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Eyebrow color={GREEN} size={17}>The best team in league history</Eyebrow>
            <div
              style={{
                display: 'flex',
                marginTop: '20px',
                fontFamily: 'DMSerif',
                fontSize: '116px',
                lineHeight: 1,
                color: INK,
              }}
            >
              {champion.name}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: '20px',
                fontFamily: 'DMSerif',
                fontStyle: 'italic',
                fontSize: '30px',
                color: INK_2,
              }}
            >
              {champion.team} · {champion.record}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              fontFamily: 'DMSerif',
              fontSize: '92px',
              lineHeight: 1.02,
              color: INK,
            }}
          >
            <div style={{ display: 'flex' }}>{copy.head}</div>
            <div style={{ display: 'flex', fontStyle: 'italic', color: GREEN }}>{copy.em}</div>
          </div>
        )}

        {!champion && (
          <div
            style={{
              display: 'flex',
              marginTop: '26px',
              paddingTop: '22px',
              borderTop: `2px solid ${INK}`,
              fontFamily: 'DMSerif',
              fontSize: '29px',
              color: INK_2,
            }}
          >
            {sub}
          </div>
        )}
      </div>

      {/* Turnout pips only while a round is actually taking cards. */}
      {phase === 'open' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex' }}>
            {Array.from({ length: roomSize }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  width: '26px',
                  height: '12px',
                  marginLeft: i ? '8px' : 0,
                  background: i < turnout ? GREEN : 'transparent',
                  border: `1.5px solid ${i < turnout ? GREEN : RULE}`,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', marginTop: '14px' }}>
            <Eyebrow size={15}>{turnout} of {roomSize} cards in</Eyebrow>
          </div>
        </div>
      ) : (
        <Eyebrow color={INK_3} size={15}>Sixteen teams · four rounds · one winner</Eyebrow>
      )}
    </div>
  )
}
