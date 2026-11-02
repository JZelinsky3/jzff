'use client'

// The whole of a card, off a tap: the real thing, and what it does in a Locker game.

import { LANES, LEGAL_LANES, POSITION_RULE, stackCost, stackPower } from '@/lib/packEmpire/locker/fieldGeneral'
import { cardMatches, eventCost, eventPower, lockerCost, lockerPower, type LockerEvent } from '@/lib/packEmpire/locker/rules'
import type { Player } from '@/lib/packEmpire/rules'
import { PackCard } from '../cards'

export function CardSheet({ card, event, onClose }: { card: Player; event: LockerEvent | null; onClose: () => void }) {
  const lift = POSITION_RULE[card.pos].split('. ').slice(1).join('. ')
  return (
    <button type="button" className="pe-lk-sheet" onClick={onClose} aria-label="Close">
      <PackCard player={card} revealed />
      <span className="pe-lk-sheet-facts">
        <span>
          {card.year} season. Costs <b>{lockerCost(card)}</b>, Power Level <b>{lockerPower(card)}</b>
        </span>
        <span>
          {LEGAL_LANES[card.pos].map((l) => LANES[l].label).join(' or ')}. {lift}
        </span>
        {card.rarity === 'canton' ? <span>Always in your opening hand. Lifts its lane 2 for every teammate in it.</span> : <span>Stacks for {stackCost(card, null)}, adds {stackPower(card, null)}. Same position adds 2 more.</span>}
        {event && cardMatches(card, event.match) && (
          <span className="up">
            {event.title}: costs {eventCost(card, event)}, Power Level {eventPower(card, event)}
          </span>
        )}
        {event && !cardMatches(card, event.match) && eventPower(card, event) < lockerPower(card) && (
          <span className="down">
            {event.title}: Power Level {eventPower(card, event)}
          </span>
        )}
      </span>
    </button>
  )
}
