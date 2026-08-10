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

// ...and the same again for the final, which runs in the dark room.
const DARK = '#0c0f0d'
const SILVER = '#ece9db'
const SILVER_2 = '#b3b1a2'
const GOLD = '#d8b662'
const GOLD_2 = '#a3833c'
const DARK_RULE = '#3a4139'
const EMERALD = '#1f8059'

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
  /**
   * The two teams left, once the semifinals are settled. Their presence is what
   * flips this card into the dark room: a link pasted into the chat at that
   * point should not unfurl into the same buff card it has been all month.
   */
  finalists?: { home: Side; away: Side } | null
}

type Side = { name: string; seed: number; record: string; ppg: string; index: string }

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

export function GoatCard({ phase, round, turnout, roomSize, champion, finalists }: GoatCardProps) {
  const copy = COPY[phase]
  const sub = phase === 'open' && round ? ROUND_SUB[round] ?? copy.sub : copy.sub

  // The last round and its result get their own card entirely, not a recolour
  // of this one: the sell changes from "sixteen teams" to "these two".
  if (champion) return <CrownedCard champion={champion} />
  if (finalists) {
    return (
      <FinalCard
        finalists={finalists}
        open={phase === 'open' && round === 'final'}
        turnout={turnout}
        roomSize={roomSize}
      />
    )
  }

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
      </div>

      {/* Turnout pips only while a round is actually taking cards. */}
      {phase === 'open' && !champion ? (
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

/** The dark stock both final cards are printed on. */
function DarkStage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: `linear-gradient(160deg, #16211b 0%, ${DARK} 46%, #050806 100%)`,
        padding: '46px 70px 42px',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  )
}

/**
 * A hairline with a mark on it, which is most of what makes this feel bound.
 *
 * The mark is a drawn square rather than the ✦ the page itself uses: neither
 * font shipped to satori carries U+2726, so the glyph renders as tofu and the
 * renderer goes looking for an emoji asset over the network to fill it in.
 */
function GoldRule({ width = 520 }: { width?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: `${width}px` }}>
      <div style={{ display: 'flex', flex: 1, height: '1px', background: GOLD_2 }} />
      <div
        style={{
          display: 'flex',
          width: '7px',
          height: '7px',
          margin: '0 15px',
          background: GOLD,
          transform: 'rotate(45deg)',
        }}
      />
      <div style={{ display: 'flex', flex: 1, height: '1px', background: GOLD_2 }} />
    </div>
  )
}

/**
 * The final, as a poster. Two names and the three numbers anybody argues with,
 * because by this point the league knows the format and wants the matchup.
 */
function FinalCard({
  finalists, open, turnout, roomSize,
}: {
  finalists: { home: Side; away: Side }
  open: boolean
  turnout: number
  roomSize: number
}) {
  return (
    <DarkStage>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Eyebrow color={GOLD} size={18} track={0.34}>PA Milk Society · 2026</Eyebrow>
        <div
          style={{
            display: 'flex',
            marginTop: '10px',
            fontFamily: 'DMSerif',
            fontStyle: 'italic',
            fontSize: '52px',
            color: SILVER,
          }}
        >
          The Final
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <GoldRule />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '26px 0 24px',
          }}
        >
          <Corner side={finalists.home} align="flex-start" />
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontStyle: 'italic',
              fontSize: '34px',
              color: GOLD,
              padding: '0 22px',
            }}
          >
            vs
          </div>
          <Corner side={finalists.away} align="flex-end" />
        </div>
        <GoldRule />
      </div>

      {open ? (
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
                  background: i < turnout ? GOLD : 'transparent',
                  border: `1.5px solid ${i < turnout ? GOLD : DARK_RULE}`,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', marginTop: '14px' }}>
            <Eyebrow color={SILVER_2} size={15}>{turnout} of {roomSize} cards in · one call each</Eyebrow>
          </div>
        </div>
      ) : (
        <Eyebrow color={SILVER_2} size={15}>Fourteen are out · one call left</Eyebrow>
      )}
    </DarkStage>
  )
}

function Corner({ side, align }: { side: Side; align: 'flex-start' | 'flex-end' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, flex: 1, minWidth: 0 }}>
      <Eyebrow color={GOLD} size={14}>{side.seed} seed</Eyebrow>
      <div
        style={{
          display: 'flex',
          marginTop: '8px',
          fontFamily: 'DMSerif',
          fontSize: '74px',
          lineHeight: 1,
          color: SILVER,
        }}
      >
        {side.name}
      </div>
      <div style={{ display: 'flex', marginTop: '14px' }}>
        <Eyebrow color={SILVER_2} size={15} track={0.16}>
          {side.record} · {side.ppg} a week · {side.index}
        </Eyebrow>
      </div>
    </div>
  )
}

/** The answer. One name, in gold, and nothing competing with it. */
function CrownedCard({ champion }: { champion: { name: string; team: string; record: string } }) {
  return (
    <DarkStage>
      <Eyebrow color={SILVER_2} size={16} track={0.34}>PA Milk Society · settled</Eyebrow>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <GoldRule width={460} />
        <div style={{ display: 'flex', marginTop: '24px' }}>
          <Eyebrow color={GOLD} size={17}>The greatest team in league history</Eyebrow>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '18px',
            fontFamily: 'DMSerif',
            fontSize: '124px',
            lineHeight: 1,
            color: GOLD,
          }}
        >
          {champion.name}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '18px',
            fontFamily: 'DMSerif',
            fontStyle: 'italic',
            fontSize: '30px',
            color: SILVER_2,
          }}
        >
          {champion.team} · {champion.record}
        </div>
        <div style={{ display: 'flex', marginTop: '26px' }}>
          <GoldRule width={460} />
        </div>
      </div>

      <Eyebrow color={EMERALD} size={15}>Sixteen went in · four rounds · one came out</Eyebrow>
    </DarkStage>
  )
}
