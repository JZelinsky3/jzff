'use client'

// A card as the Locker's games play it: the game's own Foil Stock, small enough for a
// lane. All it has to say is who he is, what he costs and how strong he is. Any Locker
// game can draw one, so it takes its numbers as given rather than working them out.

import { surname, type Player } from '@/lib/packEmpire/rules'
import { CardEdge, Headshot } from '../cards'

export function LockerCard({
  card,
  cost,
  power,
  base,
  count,
  fresh = false,
  index = 0,
  state,
  onClick,
  label,
}: {
  card: Player
  cost: number
  power: number
  /** What he's worth with no event on, so an event's change can show. */
  base?: number
  /** How many you hold, past one. */
  count?: number
  /** Just turned over. */
  fresh?: boolean
  index?: number
  state?: 'pending' | 'off'
  onClick?: () => void
  label?: string
}) {
  const inner = (
    <>
      <CardEdge rarity={card.rarity} field />
      <span className="pe-lkc-in">
        <span className="pe-lkc-top">
          <span className="pe-lkc-pos">{card.pos}</span>
        </span>
        <span className="pe-lkc-art">
          <Headshot player={card} className="pe-lkc-img" />
        </span>
        <span className="pe-lkc-foot">
          <span className="pe-lkc-name">{surname(card.name)}</span>
          <b className="pe-lkc-power" data-move={base == null || base === power ? undefined : power > base ? 'up' : 'down'}>
            {power}
          </b>
        </span>
      </span>
      <span className="pe-lkc-cost">{cost}</span>
      {count != null && count > 1 && <span className="pe-lkc-count">x{count}</span>}
    </>
  )
  const props = {
    className: `pe-lkc${fresh ? ' fresh' : ''}`,
    'data-r': card.rarity,
    'data-state': state,
    style: { '--i': index } as React.CSSProperties,
  }
  return onClick ? (
    <button type="button" {...props} onClick={onClick} aria-label={label ?? `${card.name}, costs ${cost}, strength ${power}`}>
      {inner}
    </button>
  ) : (
    <div {...props}>{inner}</div>
  )
}
