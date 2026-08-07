// The picture the greatest-team bracket link unfurls into.
//
// Kept out of the route so the composition can be rendered and looked at
// without standing up a league, a token and a live round first.
//
// Off the site's house card on purpose: this is the oxblood-and-brass
// tournament programme of the bracket itself, so the preview looks like the
// thing you are about to open, and never like the buff carbon-copy ballot
// running in the same offseason.

// Straight off goat.css, so the preview and the page are the same object.
const BOARD = '#2a1518'
const BOARD_2 = '#351b1f'
const CARD = '#f2ece0'
const INK = '#23181a'
const INK_3 = '#8a7b7e'
const CREAM = '#efe6d6'
const CREAM_3 = '#9c9081'
const BRASS = '#c08a3e'
const BRASS_2 = '#e0ab5c'
const RULE = 'rgba(239, 230, 214, .28)'

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
  children, color = CREAM_3, size = 17, track = 0.28,
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

/** A seed chip. Brass on board, the same object as .gt-seed on the page. */
function Seed({ n, dim }: { n: number; dim?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '38px',
        height: '38px',
        background: dim ? 'transparent' : BOARD,
        border: `2px solid ${dim ? RULE : BRASS}`,
        color: dim ? CREAM_3 : BRASS_2,
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
          color: lost ? CREAM_3 : won ? BRASS_2 : CREAM,
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
        background: BOARD,
        // A brass hairline inside the bleed, the same rule the page runs under
        // its masthead.
        padding: '0',
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
          borderRight: `2px solid ${BRASS}`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Eyebrow color={BRASS} size={18}>PA Milk Society</Eyebrow>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: '26px',
              fontFamily: 'DMSerif',
              fontSize: '62px',
              lineHeight: 1.04,
              color: CREAM,
            }}
          >
            <div style={{ display: 'flex' }}>{copy.head}</div>
            <div style={{ display: 'flex', fontStyle: 'italic', color: BRASS_2 }}>{copy.em}</div>
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: '22px',
              fontFamily: 'DMSerif',
              fontSize: '25px',
              color: CREAM_3,
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
                      background: i < turnout ? BRASS : 'transparent',
                      border: `1.5px solid ${i < turnout ? BRASS : RULE}`,
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
              background: BOARD_2,
              border: `2px solid ${BRASS}`,
              padding: '44px 40px',
            }}
          >
            <Eyebrow color={BRASS} size={16}>The greatest team in league history</Eyebrow>
            <div
              style={{
                display: 'flex',
                marginTop: '18px',
                fontFamily: 'DMSerif',
                fontSize: '78px',
                lineHeight: 1,
                color: BRASS_2,
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
                color: CREAM_3,
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
                  borderBottom: i < ties.length - 1 ? `1px solid ${RULE}` : 'none',
                }}
              >
                <Side seed={t.seedA} name={t.nameA} won={t.wonA} decided={decided && (t.wonA || t.wonB) === true} />
                <Side seed={t.seedB} name={t.nameB} won={t.wonB} decided={decided && (t.wonA || t.wonB) === true} />
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                display: 'flex',
                background: CARD,
                color: INK,
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
