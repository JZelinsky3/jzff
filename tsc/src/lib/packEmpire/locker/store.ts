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
import { BONUS_WINS, LOCKER_GAMES, LOCKER_PACKS, autoDeck, deckProblem, isPackKind, lockerEventForDay, lockerGame, type LockerEvent, type LockerPackKind } from './rules'

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

const PACK_ORDER: LockerPackKind[] = ['starter', 'daily', 'bonus']

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
    .sort((a, b) => PACK_ORDER.indexOf(a.kind) - PACK_ORDER.indexOf(b.kind))
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

  const cards = dealLockerPack(LOCKER_PACKS[row.kind], packRandom())
  const ids = cards.map((c) => c.id)
  const { data: had } = await db.from('pe_locker_cards').select('card_id').eq('user_id', userId).in('card_id', ids)
  const known = new Set(((had ?? []) as { card_id: string }[]).map((r) => r.card_id))

  const { data: filed, error } = await db.rpc('pe_locker_open', { p_user: userId, p_pack: packId, p_cards: ids })
  if (error) return { ok: false, error: 'The pack would not open. Try again.', status: 500 }
  if (!filed) {
    const { data: again } = await db.from('pe_locker_packs').select('cards').eq('id', packId).maybeSingle()
    return { ok: true, cards: cardsOf(again?.cards ?? null), fresh: [] }
  }
  return { ok: true, cards, fresh: ids.filter((id) => !known.has(id)) }
}

export async function loadDeck(userId: string, game: string): Promise<string[] | null> {
  const { data } = await createAdminClient().from('pe_locker_decks').select('cards').eq('user_id', userId).eq('game', game).maybeSingle()
  return (data?.cards as string[] | undefined) ?? null
}

/** The deck someone plays: the one they saved, if they still hold it, or the best
    their cards make. Empty until they've got enough cards for one. */
export async function deckFor(userId: string, game: string, cards?: OwnedCard[]): Promise<Player[]> {
  const def = lockerGame(game)
  if (!def) return []
  const [owned, saved] = await Promise.all([cards ?? ownedCards(userId), loadDeck(userId, game)])
  const held = new Map(owned.map((c) => [c.id, c]))
  const deck = (saved ?? []).flatMap((id) => held.get(id) ?? [])
  if (!deckProblem(deck, def.deck)) return deck
  const best = autoDeck(owned, def.deck)
  return deckProblem(best, def.deck) ? [] : best
}

export async function saveDeck(userId: string, game: string, ids: string[]): Promise<string | null> {
  const def = LOCKER_GAMES.find((g) => g.id === game)
  if (!def) return 'No such game.'
  const owned = await ownedCards(userId)
  const held = new Map(owned.map((c) => [c.id, c]))
  const cards = ids.flatMap((id) => held.get(id) ?? [])
  if (cards.length !== ids.length) return "You don't own one of those cards."
  const problem = deckProblem(cards, def.deck)
  if (problem) return problem
  const { error } = await createAdminClient()
    .from('pe_locker_decks')
    .upsert({ user_id: userId, game, cards: ids, updated_at: new Date().toISOString() }, { onConflict: 'user_id,game' })
  return error ? 'That deck did not save. Try again.' : null
}

export type WinCredit = { wins: number; need: number; earned: boolean }

/** A win, from any game. Call it after the match row says 'won'. The fifth of the day
    drops the bonus pack, once, however many more come after it. */
export async function creditWin(userId: string): Promise<WinCredit> {
  const day = dayKey()
  const wins = await winsOn(userId, day)
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
