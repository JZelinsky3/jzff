// Versus Challenge. SERVER ONLY.
//
// Two seats, one draft each, highest accolades total wins. The host opens it
// (an account, so a challenge always has somebody to come back to); whoever
// opens the link first takes the other seat, account or not.
//
// What each side can see is decided here, never in the browser:
//   · your own seat's seed, so you can draft (and resume on another device);
//   · the other side's SCORE once they have finished, so a challenger knows
//     the number to beat, which is the fun of being second;
//   · both lineups only once both are in.
//
// Against the CPU, the other seat is the server. Its seed is dealt the moment
// the challenge opens, before you open a pack, and it keeps the best card in
// each of its own eleven, which is what a person playing for the high score
// does. So it can't see your draft and can't react to it: its lineup is
// settled before yours starts. It drafts when you lock yours in, and the two
// go up together.

import { randomInt } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { newCaptainSeed, readCaptainSeed } from './deal'
import { friendOf } from '@/lib/friends'
import { hashKey, nameForUser, cleanGuestName, newId, isId } from './people'
import { recordSoloRun } from './binder'
import { replaySolo, soloPack, type SoloPick } from './solo'
import { SLOT_COUNT, tierFor, type Player } from './rules'

export type Seat = 'host' | 'guest'

export type VersusResult = {
  lineup: Player[]
  score: number
  tier: string
  captain: number
  picks: SoloPick[]
  at: string
}

type Row = {
  id: string
  created_at: string
  host_id: string
  host_name: string
  host_seed: string | null
  host_result: VersusResult | null
  guest_id: string | null
  guest_key: string | null
  guest_name: string | null
  guest_seed: string | null
  guest_result: VersusResult | null
  status: 'open' | 'playing' | 'done'
  completed_at: string | null
  /** A challenge sent to one friend: only that account can take the seat. */
  invited_id: string | null
  /** The other seat is the CPU. */
  guest_bot: boolean
}

export type SideView = {
  name: string | null
  /** Started a draft (a seed was issued). */
  started: boolean
  done: boolean
  score: number | null
  tier: string | null
  /** Only once both sides are in. */
  lineup: Player[] | null
  captain: number | null
}

export type VersusView = {
  id: string
  status: Row['status']
  createdAt: string
  host: SideView
  guest: SideView
  you: Seat | null
  /** The viewer's own seed, for resuming their draft. Never the other's. */
  yourSeed: string | null
  /** True when the guest seat is empty and the viewer isn't the host. */
  canJoin: boolean
  /** Sent to one friend, who hasn't taken the seat yet. The guest's name is
      already theirs, so the seat reads as held rather than open. */
  reserved: boolean
  /** The other seat is the CPU. */
  bot: boolean
}

function side(row: Row, seat: Seat, reveal: boolean): SideView {
  const r = seat === 'host' ? row.host_result : row.guest_result
  return {
    name: seat === 'host' ? row.host_name : row.guest_name,
    started: !!(seat === 'host' ? row.host_seed : row.guest_seed),
    done: !!r,
    score: r ? r.score : null,
    tier: r ? r.tier : null,
    lineup: reveal && r ? r.lineup : null,
    captain: reveal && r ? r.captain : null,
  }
}

export function seatFor(row: Row, userId: string | null, key: unknown): Seat | null {
  if (userId && row.host_id === userId) return 'host'
  if (userId && row.guest_id === userId) return 'guest'
  const h = hashKey(key)
  if (h && row.guest_key === h) return 'guest'
  return null
}

function view(row: Row, you: Seat | null, viewerId: string | null): VersusView {
  const both = !!row.host_result && !!row.guest_result
  const empty = !row.guest_id && !row.guest_key && !row.guest_bot
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    host: side(row, 'host', both),
    guest: side(row, 'guest', both),
    you,
    yourSeed: you === 'host' ? row.host_seed : you === 'guest' ? row.guest_seed : null,
    canJoin: you == null && empty && (!row.invited_id || row.invited_id === viewerId),
    reserved: empty && !!row.invited_id,
    bot: !!row.guest_bot,
  }
}

/** The CPU's name on the scoreboard. */
export const CPU_NAME = 'CPU'

/**
 * The CPU's draft: open its eleven packs in order and keep the best card in
 * each. Deterministic off its seed, so the lineup is fixed the moment the
 * seed is dealt, whatever the other seat does.
 */
function cpuDraft(seed: string): VersusResult | null {
  const parsed = readCaptainSeed(seed)
  if (!parsed) return null
  const taken: string[] = []
  const picks: SoloPick[] = []
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const pack = soloPack(seed, parsed.captain, slot, taken)
    if (pack.length === 0) return null
    const best = pack.reduce((a, b) => (b.score > a.score ? b : a))
    taken.push(best.id)
    picks.push({ slot, id: best.id })
  }
  const run = replaySolo(seed, picks)
  if (!run.ok) return null
  return {
    lineup: run.lineup,
    score: run.score,
    tier: tierFor(run.score).label,
    captain: run.captain,
    picks,
    at: new Date().toISOString(),
  }
}

async function load(id: string): Promise<Row | null> {
  if (!isId(id)) return null
  const db = createAdminClient()
  const { data } = await db.from('pe_versus').select('*').eq('id', id).maybeSingle()
  return (data as Row | null) ?? null
}

export async function getVersus(id: string, userId: string | null, key: unknown): Promise<VersusView | null> {
  const row = await load(id)
  if (!row) return null
  return view(row, seatFor(row, userId, key), userId)
}

export type Fail = { ok: false; error: string; status?: number }

/**
 * Opens a challenge. With `friendship`, it is sent to that friend: their seat
 * is held for them and their name goes on it now, and it shows in their list
 * of challenges before they have ever opened the link.
 */
export async function createVersus(
  userId: string,
  friendship?: unknown,
  cpu = false
): Promise<{ ok: true; id: string } | Fail> {
  const db = createAdminClient()
  let invite: Record<string, unknown> | null = null
  if (cpu) {
    // A skill position for its captain, the way most people pick one.
    invite = {
      guest_bot: true,
      guest_name: CPU_NAME,
      guest_seed: newCaptainSeed(randomInt(6)),
      status: 'playing',
    }
  } else if (friendship != null) {
    const friend = await friendOf(userId, friendship)
    if (!friend) return { ok: false, error: 'You can only send a challenge to a friend.', status: 403 }
    invite = { invited_id: friend, guest_name: await nameForUser(db, friend) }
  }
  const name = await nameForUser(db, userId)
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = newId()
    const { error } = await db.from('pe_versus').insert({ id, host_id: userId, host_name: name, ...invite })
    if (!error) return { ok: true, id }
    if (error.code !== '23505') return { ok: false, error: 'Could not open a challenge.' }
  }
  return { ok: false, error: 'Could not open a challenge.' }
}

export async function joinVersus(
  id: string,
  userId: string | null,
  rawName: unknown,
  key: unknown
): Promise<{ ok: true; view: VersusView } | Fail> {
  const row = await load(id)
  if (!row) return { ok: false, error: 'No such challenge.', status: 404 }
  const already = seatFor(row, userId, key)
  if (already) return { ok: true, view: view(row, already, userId) }
  if (row.guest_id || row.guest_key || row.guest_bot) return { ok: false, error: 'Somebody already took this challenge.' }
  if (row.invited_id && row.invited_id !== userId) {
    return { ok: false, error: `This challenge was sent to ${row.guest_name ?? 'someone else'}.`, status: 403 }
  }

  const db = createAdminClient()
  let patch: Record<string, unknown>
  if (userId) {
    patch = { guest_id: userId, guest_name: await nameForUser(db, userId), status: 'playing' }
  } else {
    const h = hashKey(key)
    const name = cleanGuestName(rawName)
    if (!h) return { ok: false, error: 'Your browser could not hold a seat. Try again.' }
    if (!name) return { ok: false, error: 'Pick a name between 2 and 24 characters.' }
    patch = { guest_key: h, guest_name: name, status: 'playing' }
  }

  // Only if the seat is still empty: two people opening the link at once
  // must not both think they're in.
  const { data, error } = await db
    .from('pe_versus')
    .update(patch)
    .eq('id', id)
    .is('guest_id', null)
    .is('guest_key', null)
    .eq('guest_bot', false)
    .select('*')
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'Somebody already took this challenge.' }
  const fresh = data as Row
  return { ok: true, view: view(fresh, seatFor(fresh, userId, key), userId) }
}

export async function startVersusSeat(
  id: string,
  userId: string | null,
  key: unknown,
  captain: unknown
): Promise<{ ok: true; seed: string } | Fail> {
  if (!Number.isInteger(captain) || (captain as number) < 0 || (captain as number) >= SLOT_COUNT) {
    return { ok: false, error: 'Pick a captain first.' }
  }
  const row = await load(id)
  if (!row) return { ok: false, error: 'No such challenge.', status: 404 }
  const seat = seatFor(row, userId, key)
  if (!seat) return { ok: false, error: 'This is not your seat.', status: 403 }

  const existing = seat === 'host' ? row.host_seed : row.guest_seed
  if (existing) return { ok: true, seed: existing }

  const seed = newCaptainSeed(captain as number)
  const col = seat === 'host' ? 'host_seed' : 'guest_seed'
  const db = createAdminClient()
  const { data } = await db.from('pe_versus').update({ [col]: seed }).eq('id', id).is(col, null).select(col).maybeSingle()
  // Lost a race with this seat's other tab: hand back whichever seed won.
  if (!data) {
    const again = await load(id)
    const won = again ? (seat === 'host' ? again.host_seed : again.guest_seed) : null
    return won ? { ok: true, seed: won } : { ok: false, error: 'Could not start your draft.' }
  }
  return { ok: true, seed }
}

export async function submitVersusSeat(
  id: string,
  userId: string | null,
  key: unknown,
  rawPicks: unknown
): Promise<{ ok: true; view: VersusView } | Fail> {
  const row = await load(id)
  if (!row) return { ok: false, error: 'No such challenge.', status: 404 }
  const seat = seatFor(row, userId, key)
  if (!seat) return { ok: false, error: 'This is not your seat.', status: 403 }

  const seed = seat === 'host' ? row.host_seed : row.guest_seed
  if (!seed) return { ok: false, error: 'That draft was never started.' }
  if (seat === 'host' ? row.host_result : row.guest_result) return { ok: true, view: view(row, seat, userId) }

  if (!Array.isArray(rawPicks) || rawPicks.length !== SLOT_COUNT) return { ok: false, error: 'That lineup is incomplete.' }
  const picks: SoloPick[] = []
  for (const p of rawPicks) {
    const slot = (p as { slot?: unknown })?.slot
    const pid = (p as { id?: unknown })?.id
    if (!Number.isInteger(slot) || typeof pid !== 'string') return { ok: false, error: 'That lineup is incomplete.' }
    picks.push({ slot: slot as number, id: pid })
  }

  const run = replaySolo(seed, picks)
  if (!run.ok) return { ok: false, error: run.error }

  const result: VersusResult = {
    lineup: run.lineup,
    score: run.score,
    tier: tierFor(run.score).label,
    captain: run.captain,
    picks,
    at: new Date().toISOString(),
  }

  let other = seat === 'host' ? row.guest_result : row.host_result
  const patch: Record<string, unknown> = { [seat === 'host' ? 'host_result' : 'guest_result']: result }
  // The CPU drafts now, off the seed it was dealt when the challenge opened.
  if (row.guest_bot && seat === 'host' && !row.guest_result && row.guest_seed) {
    const cpu = cpuDraft(row.guest_seed)
    if (cpu) {
      patch.guest_result = cpu
      other = cpu
    }
  }
  if (other) {
    patch.status = 'done'
    patch.completed_at = new Date().toISOString()
  }

  const db = createAdminClient()
  const { data } = await db
    .from('pe_versus')
    .update(patch)
    .eq('id', id)
    .is(seat === 'host' ? 'host_result' : 'guest_result', null)
    .select('*')
    .maybeSingle()
  const fresh = (data as Row | null) ?? (await load(id))
  if (!fresh) return { ok: false, error: 'Could not save your lineup.' }

  // If the other side landed between our read and our write, the row we just
  // wrote says 'playing' with both results in. Close it out.
  if (fresh.host_result && fresh.guest_result && fresh.status !== 'done') {
    await db.from('pe_versus').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', id)
    fresh.status = 'done'
  }
  // A seat with an account files its packs in the binder; a guest's go nowhere.
  if (userId) await recordSoloRun(userId, 'versus', seed, picks)
  return { ok: true, view: view(fresh, seat, userId) }
}

export type VersusListItem = {
  id: string
  status: Row['status']
  createdAt: string
  you: Seat
  opponent: string | null
  yourScore: number | null
  theirScore: number | null
  /** A friend sent it to you and you haven't opened it yet. */
  waitingOnYou: boolean
}

/** A signed-in player's challenges, newest first, including ones a friend
    has sent them and they haven't opened. */
export async function listVersus(userId: string): Promise<VersusListItem[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('pe_versus')
    .select('id, status, created_at, host_id, host_name, host_result, guest_id, guest_name, guest_result, invited_id')
    .or(`host_id.eq.${userId},guest_id.eq.${userId},invited_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(20)
  return ((data ?? []) as Row[]).map((r) => {
    const you: Seat = r.host_id === userId ? 'host' : 'guest'
    const mine = you === 'host' ? r.host_result : r.guest_result
    const theirs = you === 'host' ? r.guest_result : r.host_result
    return {
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      you,
      opponent: you === 'host' ? r.guest_name : r.host_name,
      yourScore: mine?.score ?? null,
      theirScore: theirs?.score ?? null,
      waitingOnYou: r.invited_id === userId && !r.guest_id,
    }
  })
}

export type VersusResultRow = {
  id: string
  /** The other seat's account, or null for a signed-out challenger. */
  opponentId: string | null
  opponent: string | null
  yours: number
  theirs: number
  at: string
}

/** Every finished challenge this account sat in, for its record and its
    head-to-heads. Scores only; the lineups stay in the room. */
export async function versusResults(userId: string): Promise<VersusResultRow[]> {
  const { data } = await createAdminClient()
    .from('pe_versus')
    .select('id, completed_at, created_at, host_id, host_name, guest_id, guest_name, host_score:host_result->score, guest_score:guest_result->score')
    .eq('status', 'done')
    // A record is against people; games with the CPU stay in the lobby list.
    .eq('guest_bot', false)
    .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
    .order('completed_at', { ascending: false })
    .limit(500)
  type R = {
    id: string
    completed_at: string | null
    created_at: string
    host_id: string
    host_name: string
    guest_id: string | null
    guest_name: string | null
    host_score: number | null
    guest_score: number | null
  }
  return ((data ?? []) as R[]).map((r) => {
    const host = r.host_id === userId
    return {
      id: r.id,
      opponentId: host ? r.guest_id : r.host_id,
      opponent: host ? r.guest_name : r.host_name,
      yours: Number((host ? r.host_score : r.guest_score) ?? 0),
      theirs: Number((host ? r.guest_score : r.host_score) ?? 0),
      at: r.completed_at ?? r.created_at,
    }
  })
}

/** The other account in a finished or running challenge, for "add as a
    friend" off the result. Null unless the viewer sat in it. */
export async function versusOpponent(id: unknown, userId: string): Promise<string | null> {
  if (!isId(id)) return null
  const { data } = await createAdminClient()
    .from('pe_versus')
    .select('host_id, guest_id')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  if (data.host_id === userId) return data.guest_id ?? null
  if (data.guest_id === userId) return data.host_id
  return null
}
