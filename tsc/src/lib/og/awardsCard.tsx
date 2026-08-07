// The picture the season-awards page unfurls into.
//
// The banquet programme of the page itself: cream stock, ink, one green seal.
// Deliberately the light card of the offseason set, because the greatest-team
// bracket running alongside it is the dark one, and a link dropped in a group
// chat should say which of the two it is before anybody reads a word.

// Straight off awards.module.css, so the preview and the page are the same
// object.
const PAPER = '#f4f1e8'
const PAPER_2 = '#eae5d8'
const INK = '#1d1f1c'
const INK_2 = '#4a4d47'
const INK_3 = '#7f837b'
const RULE = '#d3cfc0'
const SEAL = '#2f6144'
const GOLD = '#8a6a24'

export type AwardsCardProps = {
  leagueName: string
  year: number
  /** The three trophies worth putting on the card. */
  headline: { title: string; winner: string; value: string }[]
  /** How many were handed out in total. */
  count: number
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

export function AwardsCard({ leagueName, year, headline, count }: AwardsCardProps) {
  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        background: PAPER,
        padding: '54px 62px 44px',
      }}
    >
      {/* Masthead */}
      <div style={{ display: 'flex', flexDirection: 'column', borderBottom: `4px solid ${INK}`, paddingBottom: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Eyebrow color={GOLD} size={19}>{leagueName}</Eyebrow>
          <Eyebrow color={INK_3} size={15}>Settled by the data · no ballot</Eyebrow>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            marginTop: '16px',
            fontFamily: 'DMSerif',
            fontSize: '84px',
            lineHeight: 1,
            color: INK,
          }}
        >
          <div style={{ display: 'flex' }}>The {year}&nbsp;</div>
          <div style={{ display: 'flex', fontStyle: 'italic' }}>awards</div>
        </div>
      </div>

      {/* The three headline trophies */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '10px 0 18px' }}>
        {headline.map((a, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '18px 22px',
              marginBottom: i < headline.length - 1 ? '14px' : 0,
              background: PAPER_2,
              // The same green seal rule the page runs down its winner row.
              borderLeft: `6px solid ${SEAL}`,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <Eyebrow color={INK_3} size={14}>{a.title}</Eyebrow>
              <div
                style={{
                  display: 'flex',
                  marginTop: '8px',
                  fontFamily: 'DMSerif',
                  fontSize: '44px',
                  lineHeight: 1,
                  color: INK,
                }}
              >
                {a.winner}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'JetBrains',
                fontSize: '30px',
                fontWeight: 700,
                color: SEAL,
              }}
            >
              {a.value}
            </div>
          </div>
        ))}
      </div>

      {/* Footer rule */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `2px solid ${RULE}`,
          paddingTop: '18px',
        }}
      >
        <Eyebrow color={INK_2} size={15}>{count} trophies · regular season only</Eyebrow>
        <Eyebrow color={INK_3} size={15}>The Sunday Chronicle</Eyebrow>
      </div>
    </div>
  )
}
