'use client'

// A deck under the cap, to whatever size the game asks for. Tap a card to add it, tap
// it in the deck to take it out. The cap is the whole game of building: a Canton is a
// quarter of it. Pick a theme and the cards narrow to it, and Auto builds from those;
// a deck that all fits a theme wears its name.

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { callOf } from '@/lib/packEmpire/locker/calls'
import { DECK_NAME_MAX, DECK_THEMES, autoDeck, cardMatches, deckProblem, deckThemes, lockerCost, lockerPower, type DeckRule } from '@/lib/packEmpire/locker/rules'
import type { DeckDraft, OwnedCard } from '@/lib/packEmpire/locker/store'
import { RARITIES, personOf } from '@/lib/packEmpire/rules'
import { lockerPost } from '../../api'
import { CallCard } from '../../CallCard'
import { inFilter } from '../../collection/Collection'
import { LockerCard } from '../../LockerCard'

const FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'OL'] as const
const THEME_GROUPS = ['Conference', 'Division', 'Era'] as const

export function DeckBuilder({ owned, draft, rule, game, home }: { owned: OwnedCard[]; draft: DeckDraft; rule: DeckRule; game: string; home: string }) {
  const router = useRouter()
  const [ids, setIds] = useState(draft.cards)
  const [name, setName] = useState(draft.name)
  const [calls, setCalls] = useState(draft.calls)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [themeId, setThemeId] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const byId = useMemo(() => new Map(owned.map((c) => [c.id, c])), [owned])
  const deck = ids.flatMap((id) => byId.get(id) ?? [])
  const cost = deck.reduce((sum, c) => sum + lockerCost(c), 0)
  const problem = deckProblem(deck, rule)
  const theme = DECK_THEMES.find((t) => t.id === themeId) ?? null
  const fitting = theme ? owned.filter((c) => cardMatches(c, theme.match)) : owned
  const worn = deckThemes(deck)

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

  const auto = () => {
    const built = autoDeck(fitting, rule)
    setIds(built.map((c) => c.id))
    setNote(built.length < rule.size ? `You have ${fitting.length} ${theme?.label ?? ''} cards that fit, and a deck is ${rule.size}.` : null)
  }

  const toggleCall = (id: string) => {
    const max = rule.calls?.max ?? 0
    if (calls.includes(id)) setCalls((c) => c.filter((x) => x !== id))
    else if (calls.length >= max) setNote(`A deck holds ${max} play calls. Take one out first.`)
    else setCalls((c) => [...c, id])
  }

  const send = async (body: Record<string, unknown>) => {
    setBusy(true)
    setNote(null)
    try {
      await lockerPost('', { game, ...body })
      router.push(home)
      router.refresh()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not go through.')
      setBusy(false)
    }
  }

  const save = () => {
    if (!problem && !busy) send({ action: 'deck', id: draft.id, name, cards: ids, calls })
  }

  const remove = () => {
    if (!deleting) {
      setDeleting(true)
      return
    }
    if (draft.id && !busy) send({ action: 'deck-delete', id: draft.id })
  }

  const order = (a: OwnedCard, b: OwnedCard) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.score - a.score
  const inDeck = [...deck].sort(order)
  const bench = fitting.filter((c) => !ids.includes(c.id) && inFilter(c, filter)).sort(order)

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
        <button type="button" className="pe-btn pe-btn--ghost pe-btn--sm" onClick={auto}>
          Auto
        </button>
        <button type="button" className="pe-btn pe-btn--sm" disabled={!!problem || busy} onClick={save}>
          Save
        </button>
      </div>
      <div className="pe-fg-deckname">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={DECK_NAME_MAX} placeholder="Name this deck" aria-label="Deck name" />
        {draft.id && (
          <button type="button" className="pe-btn pe-btn--ghost pe-btn--sm" disabled={busy} onClick={remove}>
            {deleting ? 'Tap Again To Delete' : 'Delete'}
          </button>
        )}
      </div>
      {note && <p className="pe-fg-error">{note}</p>}

      <section className="pe-sec pe-lk-first">
        <div className="pe-sec-head">
          <span className="pe-sec-num">Your Deck</span>
          {worn.length > 0 && <span className="pe-fg-themed">{worn.map((t) => t.label).join(' · ')} Theme</span>}
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

      {rule.calls && (
        <section className="pe-sec">
          <div className="pe-sec-head">
            <span className="pe-sec-num">Your Playbook</span>
            <span className="pe-sec-title">
              {calls.length} of {rule.calls.max} Play Calls
            </span>
          </div>
          <div className="pe-fg-calls">
            {rule.calls.ids.flatMap((id) => {
              const call = callOf(id)
              return call
                ? [
                    <button key={id} type="button" className="pe-fg-pickcall" aria-pressed={calls.includes(id)} onClick={() => toggleCall(id)} aria-label={`${call.title}, costs ${call.cost}. ${call.line}`}>
                      <CallCard call={call} />
                    </button>,
                  ]
                : []
            })}
          </div>
        </section>
      )}

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
        <select className="pe-fg-theme" value={themeId} onChange={(e) => setThemeId(e.target.value)} aria-label="Theme">
          <option value="">Any Theme</option>
          {THEME_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {DECK_THEMES.filter((t) => t.group === group).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({owned.filter((c) => cardMatches(c, t.match)).length})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {bench.length === 0 ? (
          <p className="pe-lk-none">Nothing here yet.</p>
        ) : (
          <div className="pe-lk-grid">
            {bench.map((c) => (
              <LockerCard key={c.id} card={c} cost={lockerCost(c)} power={lockerPower(c)} state={whyNot(c) ? 'off' : undefined} onClick={() => add(c)} label={`Add ${c.name}`} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
