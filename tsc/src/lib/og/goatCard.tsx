// The picture the greatest-team bracket link unfurls into.
//
// Kept out of the route so the composition can be rendered and looked at
// without standing up a league, a token and a live round first.
//
// Same buff stock as the win-total ballot's card, ledger green where that one
// runs violet: the two events share an offseason and should unfurl as a set.

// Straight off goat.css, so the preview and the page are the same object.
const PAPER = '#e6e3d5'
const FIELD = '#f5f3e9'
const PAPER_3 = '#d8d5c5'
const INK = '#1f221c'
const INK_2 = '#4a4d43'
const INK_3 = '#7c7f72'
const RULE = '#c3c1af'
const GREEN = '#2d6146'
const GREEN_WASH = 'rgba(45, 97, 70, .10)'
const ON_GREEN = '#ffffff'

/** Which of the link's lives the card is selling. */
export type GoatPhase = 'gone' | 'open' | 'between' | 'crowned'

export type GoatCardProps = {
  phase: GoatPhase
  /** Round being sold, e.g. "Quarterfinals". */
  roundName: string | null
  /** Cards in, and how many the room holds. */
  turnout: number
  roomSize: number
  /** The games to show: up to four, whichever the phase makes interesting. */
  ties: { seedA: number; nameA: string; seedB: number; nameB: string; wonA?: boolean; wonB?: boolean }[]
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

/** A seed chip. The same object as .gt-seed on the page. */
function Seed({ n, dim }: { n: number; dim?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '38px',
        height: '38px',
        background: dim ? 'transparent' : GREEN,
        border: `2px solid ${dim ? RULE : GREEN}`,
        color: dim ? INK_3 : ON_GREEN,
        fontFamily: 'JetBrains',
        fontSize: '19px',
        fontWeight: 700,
        marginRight: '16px',
      }}
    >
      {n}
    </div>
  )
}

/** One side of one game. */
function Side({ seed, name, won, decided }: { seed: number; name: string; won?: boolean; decided: boolean }) {
  const lost = decided && !won
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '46px' }}>
      <Seed n={seed} dim={lost} />
      <div
        style={{
          display: 'flex',
          fontFamily: 'DMSerif',
          fontSize: '30px',
          color: lost ? INK_3 : won ? GREEN : INK,
        }}
      >
        {name}
      </div>
    </div>
  )
}

const COPY: Record<GoatPhase, { head: string; em: string; sub: string; foot: string }> = {
  gone: {
    head: 'Wrong', em: 'door.',
    sub: 'This link is not the live one',
    foot: 'Open by invitation only',
  },
  open: {
    head: 'Which one', em: 'survives?',
    sub: 'Voting is open',
    foot: 'Sixteen teams · one winner',
  },
  between: {
    head: 'The greatest', em: 'team we’ve had',
    sub: 'Sixteen team-seasons, seeded by resume',
    foot: 'Seven champions · nine at large',
  },
  crowned: {
    // Short enough to hold two lines in a 470px column at 62px. "The room has
    // decided" wraps to three and pushes the sub off its baseline.
    head: 'It is', em: 'settled.',
    sub: 'The greatest team in league history',
    foot: 'Sixteen teams · four rounds · one winner',
  },
}

export function GoatCard({ phase, roundName, turnout, roomSize, ties, champion }: GoatCardProps) {
  const copy = COPY[phase]
  const decided = phase === 'crowned' || phase === 'between'

  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        background: PAPER,
      }}
    >
      {/* Left: the masthead */}
      <div
        style={{
          width: '470px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '52px 40px 44px 56px',
          borderRight: `2px solid ${INK}`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Eyebrow color={GREEN} size={18}>PA Milk Society</Eyebrow>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: '26px',
              fontFamily: 'DMSerif',
              fontSize: '62px',
              lineHeight: 1.04,
              color: INK,
            }}
          >
            <div style={{ display: 'flex' }}>{copy.head}</div>
            <div style={{ display: 'flex', fontStyle: 'italic', color: GREEN }}>{copy.em}</div>
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: '22px',
              fontFamily: 'DMSerif',
              fontSize: '25px',
              color: INK_2,
            }}
          >
            {roundName && phase === 'open' ? roundName : copy.sub}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {phase === 'open' && (
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '22px' }}>
              <div style={{ display: 'flex' }}>
                {Array.from({ length: roomSize }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      width: '22px',
                      height: '11px',
                      marginRight: '7px',
                      background: i < turnout ? GREEN : 'transparent',
                      border: `1.5px solid ${i < turnout ? GREEN : RULE}`,
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', marginTop: '13px' }}>
                <Eyebrow>{turnout} of {roomSize} cards in</Eyebrow>
              </div>
            </div>
          )}
          <Eyebrow color={INK_3} size={15}>{copy.foot}</Eyebrow>
        </div>
      </div>

      {/* Right: the games, or the winner */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '46px 56px',
        }}
      >
        {champion ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: FIELD,
              border: `2px solid ${GREEN}`,
              boxShadow: `8px 8px 0 ${GREEN_WASH}`,
              padding: '44px 40px',
            }}
          >
            <Eyebrow color={GREEN} size={16}>The greatest team in league history</Eyebrow>
            <div
              style={{
                display: 'flex',
                marginTop: '18px',
                fontFamily: 'DMSerif',
                fontSize: '78px',
                lineHeight: 1,
                color: INK,
              }}
            >
              {champion.name}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: '18px',
                fontFamily: 'DMSerif',
                fontSize: '27px',
                fontStyle: 'italic',
                color: INK_2,
              }}
            >
              {champion.team} · {champion.record}
            </div>
          </div>
        ) : ties.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ties.map((t, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  paddingBottom: '16px',
                  marginBottom: '16px',
                  borderBottom: i < ties.length - 1 ? `1px solid ${PAPER_3}` : 'none',
                }}
              >
                <Side seed={t.seedA} name={t.nameA} won={t.wonA} decided={decided && (t.wonA || t.wonB) === true} />
                <Side seed={t.seedB} name={t.nameB} won={t.wonB} decided={decided && (t.wonA || t.wonB) === true} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div
              style={{
                display: 'flex',
                background: INK,
                color: PAPER,
                fontFamily: 'DMSerif',
                fontSize: '34px',
                padding: '22px 30px',
              }}
            >
              Ask Joey for the live link
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
