// A table laid out for a game you're about to start: three cards dealt the way
// its difficulty deals them, in the middle of a lit felt. Empire Builder's picker
// has the cards alone; the Versus, Mega Draft and League setup cards sit a player
// either side of them, you and whoever you're about to play. Keyed on the table
// by whoever uses it, so a switch deals a new hand. Nothing here moves but the
// deal-in, which is transform and opacity.

import type { Player } from '@/lib/packEmpire/rules'
import { PackCard } from './cards'

/** A seat at the table: head and shoulders, drawn in stroke like the nav's icons. */
function Sitter() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8.6" r="3.6" />
      <path d="M4.8 20.2c.8-4 3.7-6.3 7.2-6.3s6.4 2.3 7.2 6.3" />
    </svg>
  )
}

export function TableArt({
  cards,
  seats,
  tag,
}: {
  cards: Player[]
  /** A player either side: the label under each seat. */
  seats?: [string, string]
  /** A short line along the top of the felt. */
  tag?: string
}) {
  return (
    <span className="pe-bp-table" aria-hidden>
      <span className="pe-bp-glow" />
      {tag && <span className="pe-bp-tag">{tag}</span>}
      {seats && (
        <>
          <span className="pe-bp-seat l">
            <i>
              <Sitter />
            </i>
            <small>{seats[0]}</small>
          </span>
          <span className="pe-bp-seat r">
            <i>
              <Sitter />
              <b>?</b>
            </i>
            <small>{seats[1]}</small>
          </span>
        </>
      )}
      <span className="pe-bp-hand">
        {cards.map((c, i) => (
          <span key={c.id} className="pe-bp-held" style={{ '--n': i } as React.CSSProperties}>
            <PackCard player={c} revealed index={0} still disabled />
          </span>
        ))}
      </span>
    </span>
  )
}
