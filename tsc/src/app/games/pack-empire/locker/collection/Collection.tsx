'use client'

// Everything you own. Filter by position, sort it how you like, and tap a card for
// the whole of it.

import { useMemo, useState } from 'react'
import { lockerCost, lockerPower, type LockerEvent } from '@/lib/packEmpire/locker/rules'
import type { OwnedCard } from '@/lib/packEmpire/locker/store'
import { RARITIES, surname } from '@/lib/packEmpire/rules'
import { CardSheet } from '../CardSheet'
import { LockerCard } from '../LockerCard'

const FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'OL'] as const
type Filter = (typeof FILTERS)[number]

const SORTS: { id: string; label: string; by: (a: OwnedCard, b: OwnedCard) => number }[] = [
  { id: 'rarity', label: 'Rarity', by: (a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.score - a.score },
  { id: 'power', label: 'Power Level', by: (a, b) => lockerPower(b) - lockerPower(a) || b.score - a.score },
  { id: 'cost', label: 'Price', by: (a, b) => lockerCost(a) - lockerCost(b) || lockerPower(b) - lockerPower(a) },
  { id: 'new', label: 'Newest', by: (a, b) => b.firstAt.localeCompare(a.firstAt) },
  { id: 'year', label: 'Season', by: (a, b) => (b.year ?? 0) - (a.year ?? 0) || b.score - a.score },
  { id: 'team', label: 'Team', by: (a, b) => a.team.localeCompare(b.team) || b.score - a.score },
  { id: 'name', label: 'Name', by: (a, b) => surname(a.name).localeCompare(surname(b.name)) },
  { id: 'copies', label: 'Copies', by: (a, b) => b.count - a.count || b.score - a.score },
]

export const inFilter = (card: { pos: string }, f: Filter) => f === 'All' || (f === 'OL' ? ['OT', 'OG', 'C'].includes(card.pos) : card.pos === f)

export function Collection({ cards, event }: { cards: OwnedCard[]; event: LockerEvent }) {
  const [filter, setFilter] = useState<Filter>('All')
  const [sort, setSort] = useState(SORTS[0].id)
  const [open, setOpen] = useState<OwnedCard | null>(null)
  const shown = useMemo(() => cards.filter((c) => inFilter(c, filter)).sort(SORTS.find((s) => s.id === sort)?.by), [cards, filter, sort])

  return (
    <>
      <div className="pe-lk-tools">
        <div className="pe-brd-diffs pe-lk-filter" role="group" aria-label="Position">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={f === filter} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <label className="pe-lk-sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
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
