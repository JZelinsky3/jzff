'use client'

// Twelve cards under the cap. Tap a card to add it, tap it in the deck to take it
// out. The cap is the whole game of building: a Canton is a quarter of it.

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { autoDeck, deckProblem, lockerCost, lockerPower, type LockerGameDef } from '@/lib/packEmpire/locker/rules'
import type { OwnedCard } from '@/lib/packEmpire/locker/store'
import { RARITIES, personOf } from '@/lib/packEmpire/rules'
import { lockerPost } from '../../api'
import { inFilter } from '../../collection/Collection'
import { LockerCard } from '../../LockerCard'

const FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'OL'] as const

export function DeckBuilder({ owned, start, rule, game }: { owned: OwnedCard[]; start: string[]; rule: LockerGameDef['deck']; game: string }) {
  const router = useRouter()
  const [ids, setIds] = useState(start)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const byId = useMemo(() => new Map(owned.map((c) => [c.id, c])), [owned])
  const deck = ids.flatMap((id) => byId.get(id) ?? [])
  const cost = deck.reduce((sum, c) => sum + lockerCost(c), 0)
  const problem = deckProblem(deck, rule)

  const whyNot = (card: OwnedCard): string | null => {
    if (deck.length >= rule.size) return `A deck is ${rule.size} cards. Take one out first.`
    if (deck.some((c) => personOf(c) === personOf(card))) return 'One season of a man to a deck.'
    if (card.rarity === 'canton' && deck.some((c) => c.rarity === 'canton')) return 'One Canton to a deck.'
    if (cost + lockerCost(card) > rule.cap) return `That goes over the ${rule.cap} cap.`
    return null
  }

  const add = (card: OwnedCard) => {
    const why = whyNot(card)
    setNote(why)
    if (!why) setIds((d) => [...d, card.id])
  }

  const save = async () => {
    if (problem || busy) return
    setBusy(true)
    setNote(null)
    try {
      await lockerPost('', { action: 'deck', game, cards: ids })
      router.push('/games/pack-empire/locker/field-general/')
      router.refresh()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That deck did not save.')
      setBusy(false)
    }
  }

  const order = (a: OwnedCard, b: OwnedCard) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.score - a.score
  const inDeck = [...deck].sort(order)
  const bench = owned.filter((c) => !ids.includes(c.id) && inFilter(c, filter)).sort(order)

  return (
    <>
      <div className="pe-fg-deckbar">
        <div className="pe-fg-deckbar-nums">
          <b>
            {deck.length}/{rule.size}
          </b>
          <span>Cards</span>
          <b data-over={cost > rule.cap ? '' : undefined}>
            {cost}/{rule.cap}
          </b>
          <span>Cap</span>
        </div>
        <button type="button" className="pe-btn pe-btn--ghost pe-btn--sm" onClick={() => { setIds(autoDeck(owned, rule).map((c) => c.id)); setNote(null) }}>
          Auto
        </button>
        <button type="button" className="pe-btn pe-btn--sm" disabled={!!problem || busy} onClick={save}>
          Save
        </button>
      </div>
      {note && <p className="pe-fg-error">{note}</p>}

      <section className="pe-sec pe-lk-first">
        <div className="pe-sec-head">
          <span className="pe-sec-num">Your Deck</span>
        </div>
        {inDeck.length === 0 ? (
          <p className="pe-lk-none">Tap a card below to add him.</p>
        ) : (
          <div className="pe-lk-grid">
            {inDeck.map((c) => (
              <LockerCard key={c.id} card={c} cost={lockerCost(c)} power={lockerPower(c)} onClick={() => { setIds((d) => d.filter((id) => id !== c.id)); setNote(null) }} label={`Take ${c.name} out`} />
            ))}
          </div>
        )}
      </section>

      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">Your Cards</span>
        </div>
        <div className="pe-brd-diffs pe-lk-filter" role="group" aria-label="Position">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={f === filter} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <div className="pe-lk-grid">
          {bench.map((c) => (
            <LockerCard key={c.id} card={c} cost={lockerCost(c)} power={lockerPower(c)} state={whyNot(c) ? 'off' : undefined} onClick={() => add(c)} label={`Add ${c.name}`} />
          ))}
        </div>
      </section>
    </>
  )
}
