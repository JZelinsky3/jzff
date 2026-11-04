// A table laid out for a game you're about to start: three cards dealt the way
// its difficulty deals them, on a lit felt. Empire Builder's picker stands them
// in front of the packs they came out of; the Versus and Mega Draft setup cards
// sit a player either side of them instead, you and whoever you're about to
// play. Keyed on the table by whoever uses it, so a switch deals a new hand.
// Nothing here moves but the deal-in, which is transform and opacity.

import type { Player } from '@/lib/packEmpire/rules'
import { PackCard } from './cards'

export function TableArt({
  cards,
  packs,
  seats,
  mystery = false,
  tag,
}: {
  cards: Player[]
  /** The pack art standing either side of the hand. */
  packs?: [string, string]
  /** Or a player either side: the label under each seat. */
  seats?: [string, string]
  /** Mystery's black packs, which get a cold glow. */
  mystery?: boolean
  /** A short line along the top of the felt. */
  tag?: string
}) {
  return (
    <span className={`pe-bp-table${mystery ? ' pe-bp-table--mys' : ''}`} aria-hidden>
      <span className="pe-bp-glow" />
      {tag && <span className="pe-bp-tag">{tag}</span>}
      {packs && (
        <>
          <span className="pe-bp-pack l" style={{ backgroundImage: `url(${packs[0]})` }} />
          <span className="pe-bp-pack r" style={{ backgroundImage: `url(${packs[1]})` }} />
        </>
      )}
      {seats && (
        <>
          <span className="pe-bp-seat l">
            <i>{seats[0].charAt(0)}</i>
            <small>{seats[0]}</small>
          </span>
          <span className="pe-bp-seat r">
            <i>?</i>
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
