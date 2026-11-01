'use client'

// Everything you own. Filter by position, and tap a card for the whole of it.

import { useMemo, useState } from 'react'
import { lockerCost, lockerPower, type LockerEvent } from '@/lib/packEmpire/locker/rules'
import type { OwnedCard } from '@/lib/packEmpire/locker/store'
import { RARITIES } from '@/lib/packEmpire/rules'
import { CardSheet } from '../CardSheet'
import { LockerCard } from '../LockerCard'

const FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'OL'] as const
type Filter = (typeof FILTERS)[number]

export const inFilter = (card: { pos: string }, f: Filter) => f === 'All' || (f === 'OL' ? ['OT', 'OG', 'C'].includes(card.pos) : card.pos === f)

export function Collection({ cards, event }: { cards: OwnedCard[]; event: LockerEvent }) {
  const [filter, setFilter] = useState<Filter>('All')
  const [open, setOpen] = useState<OwnedCard | null>(null)
  const shown = useMemo(
    () => cards.filter((c) => inFilter(c, filter)).sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.score - a.score),
    [cards, filter]
  )

  return (
    <>
      <div className="pe-brd-diffs pe-lk-filter" role="group" aria-label="Position">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={f === filter} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="pe-lk-none">Nothing here yet. Open a pack.</p>
      ) : (
        <div className="pe-lk-grid">
          {shown.map((c) => (
            <LockerCard key={c.id} card={c} cost={lockerCost(c)} power={lockerPower(c)} count={c.count} onClick={() => setOpen(c)} />
          ))}
        </div>
      )}
      {open && <CardSheet card={open} event={event} onClose={() => setOpen(null)} />}
    </>
  )
}
