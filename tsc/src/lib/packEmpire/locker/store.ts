// The Locker's records: packs, cards, decks and wins. SERVER ONLY.
//
// Nothing in here knows what a game does with a card. A game reads what someone
// owns, saves their deck, and calls creditWin when they win; everything a Locker
// game gets for free (the daily pack, the bonus, the collection) lives here.

import { createAdminClient } from '@/lib/supabase/admin'
import { dayKey } from '../daily'
import { playerById } from '../pool'
import { RARITIES, type Player, type Rarity } from '../rules'
import { dealLockerPack, packRandom } from './deal'
import { DEFAULT_CALLS } from './calls'
import {
  BONUS_WINS,
  DECK_NAME_MAX,
  FAAB_SPARE,
  FAAB_WIN,
  LOCKER_PACKS,
  MAX_DECKS,
  autoDeck,
  deckProblem,
  deckThemes,
  isPackKind,
  lockerCost,
  lockerEventForDay,
  lockerGame,
  packPrice,
  type LockerEvent,
  type LockerPackKind,
} from './rules'

export type WaitingPack = { id: string; kind: LockerPackKind }
export type OwnedCard = Player & { count: number }

export type LockerHome = {
  day: string
  event: LockerEvent
  packs: WaitingPack[]
  wins: number
  need: number
  bonus: 'earning' | 'waiting' | 'opened'
  owned: number
  copies: number
  byRarity: Record<Rarity, number>
}

const PACK_ORDER: string[] = ['starter', 'daily', 'bonus']
const packRank = (kind: string) => (PACK_ORDER.includes(kind) ? PACK_ORDER.indexOf(kind) : PACK_ORDER.length)

/** The packs you're owed just for turning up: the starter once, and today's. Safe to
    call on every visit, a pack that's already been given is left alone. */
export async function grantPacks(userId: string, day = dayKey()) {
  await createAdminClient()
    .from('pe_locker_packs')
    .upsert(
      [
        { user_id: userId, kind: 'starter', grant_key: 'once' },
        { user_id: userId, kind: 'daily', grant_key: day },
      ],
      { onConflict: 'user_id,kind,grant_key', ignoreDuplicates: true }
    )
}

export async function ownedCards(userId: string): Promise<OwnedCard[]> {
  const { data } = await createAdminClient().from('pe_locker_cards').select('card_id, count').eq('user_id', userId)
  return ((data ?? []) as { card_id: string; count: number }[]).flatMap((r) => {
    const card = playerById(r.card_id)
    return card ? [{ ...card, count: r.count }] : []
  })
}

export async function winsOn(userId: string, day = dayKey()): Promise<number> {
  const { count } = await createAdminClient()
    .from('pe_locker_matches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('day', day)
    .eq('status', 'won')
  return count ?? 0
}

export async function lockerHome(userId: string): Promise<LockerHome> {
  const day = dayKey()
  await grantPacks(userId, day)
  const db = createAdminClient()
  const [{ data: waiting }, { data: bonus }, wins, cards] = await Promise.all([
    db.from('pe_locker_packs').select('id, kind').eq('user_id', userId).is('opened_at', null),
    db.from('pe_locker_packs').select('opened_at').eq('user_id', userId).eq('kind', 'bonus').eq('grant_key', day).maybeSingle(),
    winsOn(userId, day),
    ownedCards(userId),
  ])
  const packs = ((waiting ?? []) as { id: string; kind: string }[])
    .filter((p): p is WaitingPack => isPackKind(p.kind))
    .sort((a, b) => packRank(a.kind) - packRank(b.kind))
  const byRarity = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>
  for (const c of cards) byRarity[c.rarity]++
  return {
    day,
    event: lockerEventForDay(day),
    packs,
    wins,
    need: BONUS_WINS,
    bonus: !bonus ? 'earning' : bonus.opened_at ? 'opened' : 'waiting',
    owned: cards.length,
    copies: cards.reduce((sum, c) => sum + c.count, 0),
    byRarity,
  }
}

const cardsOf = (ids: string[] | null) => (ids ?? []).flatMap((id) => playerById(id) ?? [])

export type Opened = { ok: true; cards: Player[]; fresh: string[] } | { ok: false; error: string; status: number }

/** Opens a pack. A pack already open just hands its cards back, so a double tap or a
    refresh mid-rip finds the same five. */
export async function openPack(userId: string, packId: string): Promise<Opened> {
  const db = createAdminClient()
  const { data: row } = await db
    .from('pe_locker_packs')
    .select('kind, cards, opened_at')
    .eq('id', packId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!row) return { ok: false, error: 'That pack is not yours to open.', status: 404 }
  if (row.opened_at) return { ok: true, cards: cardsOf(row.cards), fresh: [] }
  if (!isPackKind(row.kind)) return { ok: false, error: 'That pack can no longer be opened.', status: 400 }

  const { data: had } = await db.from('pe_locker_cards').select('card_id').eq('user_id', userId)
  const known = new Set(((had ?? []) as { card_id: string }[]).map((r) => r.card_id))
  const cards = dealLockerPack(LOCKER_PACKS[row.kind], packRandom(), known)
  const ids = cards.map((c) => c.id)

  const { data: filed, error } = await db.rpc('pe_locker_open', { p_user: userId, p_pack: packId, p_cards: ids })
  if (error) return { ok: false, error: 'The pack would not open. Try again.', status: 500 }
  if (!filed) {
    const { data: again } = await db.from('pe_locker_packs').select('cards').eq('id', packId).maybeSingle()
    return { ok: true, cards: cardsOf(again?.cards ?? null), fresh: [] }
  }
  return { ok: true, cards, fresh: ids.filter((id) => !known.has(id)) }
}

// ============================================================
// Decks
// ============================================================
//
// One row per player per game. `cards` is the deck they're playing, `saved` is every
// deck they've built, and `active` says which of those is in `cards`. Someone who's
// only ever had the one deck has an empty `saved`, and that deck reads as Deck 1.

export type SavedDeck = { id: string; name: string; cards: string[]; calls: string[] }

type DeckRow = { cards: string[]; saved: SavedDeck[] | null; active: string | null }

const FIRST_DECK = 'deck-1'

async function deckRow(userId: string, game: string): Promise<DeckRow | null> {
  const { data } = await createAdminClient().from('pe_locker_decks').select('cards, saved, active').eq('user_id', userId).eq('game', game).maybeSingle()
  return (data as DeckRow | null) ?? null
}

function shelf(row: DeckRow | null): { decks: SavedDeck[]; active: string | null } {
  if (!row) return { decks: [], active: null }
  if (row.saved?.length) return { decks: row.saved, active: row.active }
  if (!row.cards.length) return { decks: [], active: null }
  return { decks: [{ id: FIRST_DECK, name: 'Deck 1', cards: row.cards, calls: DEFAULT_CALLS }], active: FIRST_DECK }
}

async function writeShelf(userId: string, game: string, decks: SavedDeck[], active: string | null): Promise<boolean> {
  const playing = decks.find((d) => d.id === active)
  const { error } = await createAdminClient()
    .from('pe_locker_decks')
    .upsert({ user_id: userId, game, cards: playing?.cards ?? [], saved: decks, active, updated_at: new Date().toISOString() }, { onConflict: 'user_id,game' })
  return !error
}

export type DeckShelf = { decks: SavedDeck[]; active: string | null }

export async function deckShelf(userId: string, game: string): Promise<DeckShelf> {
  return shelf(await deckRow(userId, game))
}

/** A saved deck, as a row in a list. */
export type DeckSummary = { id: string; name: string; cards: number; cost: number; themes: string[]; active: boolean }

export function deckSummaries({ decks, active }: DeckShelf): DeckSummary[] {
  return decks.map((d) => {
    const men = d.cards.flatMap((id) => playerById(id) ?? [])
    return { id: d.id, name: d.name, cards: men.length, cost: men.reduce((sum, c) => sum + lockerCost(c), 0), themes: deckThemes(men).map((t) => t.label), active: d.id === active }
  })
}

/** The deck someone plays: the one they picked, if they still hold it, or the best
    their cards make. Empty until they've got enough cards for one. */
export async function deckFor(userId: string, game: string, cards?: OwnedCard[]): Promise<Player[]> {
  const def = lockerGame(game)
  if (!def) return []
  const [owned, row] = await Promise.all([cards ?? ownedCards(userId), deckRow(userId, game)])
  const held = new Map(owned.map((c) => [c.id, c]))
  const deck = (row?.cards ?? []).flatMap((id) => held.get(id) ?? [])
  if (!deckProblem(deck, def.deck)) return deck
  const best = autoDeck(owned, def.deck)
  return deckProblem(best, def.deck) ? [] : best
}

/** The non-player cards the deck in play shuffles in. */
export async function deckCalls(userId: string, game: string): Promise<string[]> {
  const rule = lockerGame(game)?.deck.calls
  if (!rule) return []
  const { decks, active } = await deckShelf(userId, game)
  return (decks.find((d) => d.id === active)?.calls ?? DEFAULT_CALLS).filter((id) => rule.ids.includes(id)).slice(0, rule.max)
}

export type DeckDraft = { id: string | null; name: string; cards: string[]; calls: string[] }

/** Saves a deck, new or edited, and makes it the one in play. */
export async function saveDeck(userId: string, game: string, draft: DeckDraft): Promise<string | null> {
  const def = lockerGame(game)
  if (!def) return 'No such game.'
  const owned = await ownedCards(userId)
  const held = new Map(owned.map((c) => [c.id, c]))
  const cards = draft.cards.flatMap((id) => held.get(id) ?? [])
  if (cards.length !== draft.cards.length) return "You don't own one of those cards."
  const problem = deckProblem(cards, def.deck)
  if (problem) return problem
  const allowed = def.deck.calls
  const calls = [...new Set(draft.calls)]
  if (calls.length > (allowed?.max ?? 0)) return `A deck holds ${allowed?.max ?? 0} play calls.`
  if (!calls.every((id) => allowed?.ids.includes(id))) return 'No such play call.'

  const { decks } = await deckShelf(userId, game)
  const at = decks.findIndex((d) => d.id === draft.id)
  if (at < 0 && decks.length >= MAX_DECKS) return `You can keep ${MAX_DECKS} decks. Delete one first.`
  const themed = deckThemes(cards)[0]?.label
  const name = draft.name.trim().slice(0, DECK_NAME_MAX) || (themed ? `${themed} Deck` : `Deck ${decks.length + 1}`)
  const deck: SavedDeck = { id: at >= 0 ? decks[at].id : crypto.randomUUID(), name, cards: draft.cards, calls }
  const next = at >= 0 ? decks.map((d, i) => (i === at ? deck : d)) : [...decks, deck]
  return (await writeShelf(userId, game, next, deck.id)) ? null : 'That deck did not save. Try again.'
}

/** Puts a saved deck in play. */
export async function chooseDeck(userId: string, game: string, id: string): Promise<string | null> {
  const { decks } = await deckShelf(userId, game)
  if (!decks.some((d) => d.id === id)) return 'No such deck.'
  return (await writeShelf(userId, game, decks, id)) ? null : 'That did not go through. Try again.'
}

/** Deletes a saved deck. If it was in play, the first one left takes over. */
export async function deleteDeck(userId: string, game: string, id: string): Promise<string | null> {
  const { decks, active } = await deckShelf(userId, game)
  const next = decks.filter((d) => d.id !== id)
  if (next.length === decks.length) return 'No such deck.'
  return (await writeShelf(userId, game, next, active === id ? next[0]?.id ?? null : active)) ? null : 'That did not go through. Try again.'
}

export type WinCredit = { wins: number; need: number; earned: boolean }

/** A win, from any game. Call it after the match row says 'won'. It pays FAAB, and the
    fifth of the day drops the bonus pack, once, however many more come after it. */
export async function creditWin(userId: string): Promise<WinCredit> {
  const day = dayKey()
  const wins = await winsOn(userId, day)
  await createAdminClient().rpc('pe_locker_earn', { p_user: userId, p_amount: FAAB_WIN })
  let earned = false
  if (wins >= BONUS_WINS) {
    const { data } = await createAdminClient()
      .from('pe_locker_packs')
      .upsert({ user_id: userId, kind: 'bonus', grant_key: day, source: 'reward' }, { onConflict: 'user_id,kind,grant_key', ignoreDuplicates: true })
      .select('id')
    earned = (data ?? []).length > 0
  }
  return { wins, need: BONUS_WINS, earned }
}

// ============================================================
// The Shop
// ============================================================

export async function walletOf(userId: string): Promise<number> {
  const { data } = await createAdminClient().from('pe_locker_wallets').select('faab').eq('user_id', userId).maybeSingle()
  return data?.faab ?? 0
}

/** What someone has spare, a rarity at a time, and what it would all sell for. */
export type Spares = { rarity: Rarity; copies: number; worth: number }[]

export function sparesOf(cards: OwnedCard[]): Spares {
  return [...RARITIES].reverse().flatMap((rarity) => {
    const copies = cards.filter((c) => c.rarity === rarity).reduce((sum, c) => sum + c.count - 1, 0)
    return copies ? [{ rarity, copies, worth: copies * FAAB_SPARE[rarity] }] : []
  })
}

/** Sells every spare of a rarity. Returns the new balance, or what went wrong. */
export async function sellSpares(userId: string, rarity: Rarity): Promise<{ faab: number } | { error: string }> {
  const cards = (await ownedCards(userId)).filter((c) => c.rarity === rarity && c.count > 1)
  if (!cards.length) return { error: 'You have no spares of that rarity.' }
  const { error } = await createAdminClient().rpc('pe_locker_sell', { p_user: userId, p_cards: cards.map((c) => c.id), p_each: FAAB_SPARE[rarity] })
  return error ? { error: 'That did not go through. Try again.' } : { faab: await walletOf(userId) }
}

/** Buys a pack into the Locker, unopened. Returns what went wrong, if anything. */
export async function buyPack(userId: string, kind: string): Promise<string | null> {
  const price = packPrice(kind)
  if (price == null) return 'That pack is not for sale.'
  const { data, error } = await createAdminClient().rpc('pe_locker_buy', { p_user: userId, p_kind: kind, p_price: price })
  if (error) return 'That did not go through. Try again.'
  return data ? null : 'You need more FAAB for that.'
}
