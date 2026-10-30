// Mega Draft. SERVER ONLY.
//
// A live two-seat snake draft off one shared board of 36, eleven picks each,
// P1 P2 P2 P1 P1 P2 … Who picks first is a coin flipped when the second
// player sits down. The board is public (both players see every card), so it
// is dealt once at creation and stored whole.
//
// The original let each browser write its own pick straight into the row.
// Here a pick is a request: the server checks whose turn it is, that the
// player is still on the board and that the picker has a slot left for him,
// and writes it only if nobody else wrote first (updated_at is the version).
//
// The second seat can be the CPU. It sees what you see (the board is public)
// and nothing more, and drafts like a person would: the best man at a
// position it still needs, weighed by how much worse the position gets once
// you've had your share of it, with a little variance so it isn't a machine.
// The room asks it to pick, one pick at a time, after a beat, so it plays at
// a person's pace. A draft can also be sent to one friend: the seat is held
// for them and the draft shows in their list.

import { randomInt } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { friendOf } from '@/lib/friends'
import { dealMegaBoard, newServerSeed } from './deal'
import { cleanGuestName, hashKey, isId, nameForUser, newId } from './people'
import {
  MEGA_TOTAL_PICKS,
  SLOTS,
  SLOT_COUNT,
  lineupScore,
  megaPickOwner,
  type Player,
} from './rules'

export type MegaPick = { n: number; seat: 0 | 1; id: string; slot: number }

type Row = {
  id: string
  created_at: string
  updated_at: string
  seed: string
  board: Player[]
  picks: MegaPick[]
  host_id: string | null
  host_key: string | null
  host_name: string
  guest_id: string | null
  guest_key: string | null
  guest_name: string | null
  host_first: boolean | null
  status: 'waiting' | 'live' | 'done'
  completed_at: string | null
  /** The second seat is the CPU. */
  guest_bot: boolean
  /** Sent to one friend: only that account can take the second seat. */
  invited_id: string | null
}

export type MegaSeatView = {
  name: string | null
  lineup: (Player | null)[]
  score: number
  filled: number
}

export type MegaView = {
  id: string
  status: Row['status']
  board: Player[]
  picks: MegaPick[]
  /** Seat 0 picks first. */
  seats: [MegaSeatView, MegaSeatView]
  /** The viewer's seat, or null for a spectator. */
  you: 0 | 1 | null
  /** Whose pick it is, while live. */
  onClock: 0 | 1 | null
  pickNo: number
  /** True when the second seat is open and the viewer isn't the host. */
  canJoin: boolean
  /** Before the coin: the host's name, for the waiting room. */
  hostName: string
  /** The CPU's seat, when it has one. */
  botSeat: 0 | 1 | null
  /** Sent to a friend who hasn't sat down: their name, for the waiting room. */
  reservedFor: string | null
}

/** The CPU's name on the board. */
export const CPU_NAME = 'CPU'

type Role = 'host' | 'guest'

function roleFor(row: Row, userId: string | null, key: unknown): Role | null {
  if (userId && row.host_id === userId) return 'host'
  if (userId && row.guest_id === userId) return 'guest'
  const h = hashKey(key)
  if (h && row.host_key === h) return 'host'
  if (h && row.guest_key === h) return 'guest'
  return null
}

function seatOf(row: Row, role: Role): 0 | 1 | null {
  if (row.host_first == null) return role === 'host' ? 0 : null
  return (role === 'host') === row.host_first ? 0 : 1
}

/** Which slot a pick for this player fills: his position's first open one. */
function openSlotFor(lineup: (Player | null)[], p: Player): number {
  return SLOTS.findIndex((s, i) => s.pool === p.pos && !lineup[i])
}

function lineupsFrom(row: Row): [(Player | null)[], (Player | null)[]] {
  const byId = new Map(row.board.map((p) => [p.id, p]))
  const out: [(Player | null)[], (Player | null)[]] = [Array(SLOT_COUNT).fill(null), Array(SLOT_COUNT).fill(null)]
  for (const pk of row.picks) {
    const p = byId.get(pk.id)
    if (p) out[pk.seat][pk.slot] = p
  }
  return out
}

function view(row: Row, role: Role | null, viewerId: string | null = null): MegaView {
  const [a, b] = lineupsFrom(row)
  const names: [string | null, string | null] =
    row.host_first == null
      ? [row.host_name, null]
      : row.host_first
        ? [row.host_name, row.guest_name]
        : [row.guest_name, row.host_name]
  const seat = (i: 0 | 1, lineup: (Player | null)[]): MegaSeatView => ({
    name: names[i],
    lineup,
    score: lineupScore(lineup),
    filled: lineup.filter(Boolean).length,
  })
  const pickNo = row.picks.length
  return {
    id: row.id,
    status: row.status,
    board: row.board,
    picks: row.picks,
    seats: [seat(0, a), seat(1, b)],
    you: role ? seatOf(row, role) : null,
    onClock: row.status === 'live' ? megaPickOwner(pickNo) : null,
    pickNo,
    canJoin:
      !role &&
      row.status === 'waiting' &&
      !row.guest_id &&
      !row.guest_key &&
      !row.guest_bot &&
      (!row.invited_id || row.invited_id === viewerId),
    hostName: row.host_name,
    botSeat: row.guest_bot ? seatOf(row, 'guest') : null,
    reservedFor: row.status === 'waiting' && row.invited_id ? row.guest_name : null,
  }
}

/**
 * The CPU's pick. Every man on the board it has a slot for is worth his score,
 * plus how far the position falls off if it passes on him: the best one left
 * there once the other seat has filled its own slots at the position. A deep
 * position can wait; the last good center can't. A few percent of noise, so
 * two drafts off the same board don't go the same way.
 */
function cpuChoice(row: Row, seat: 0 | 1): Player | null {
  const lineups = lineupsFrom(row)
  const mine = lineups[seat]
  const theirs = lineups[seat === 0 ? 1 : 0]
  const gone = new Set(row.picks.map((p) => p.id))
  const left = row.board.filter((p) => !gone.has(p.id))
  const open = (lineup: (Player | null)[], pos: Player['pos']) =>
    SLOTS.filter((s, i) => s.pool === pos && !lineup[i]).length

  let best: Player | null = null
  let bestValue = -Infinity
  for (const p of left) {
    if (open(mine, p.pos) === 0) continue
    const rivals = open(theirs, p.pos)
    const rest = left
      .filter((q) => q.pos === p.pos && q.id !== p.id)
      .map((q) => q.score)
      .sort((a, b) => b - a)
    const fallback = rest.length ? rest[Math.min(rivals, rest.length - 1)] : 0
    const noise = (randomInt(1001) / 1000 - 0.5) * 0.1 * p.score
    const value = p.score - fallback + 0.4 * p.score + noise
    if (value > bestValue) {
      bestValue = value
      best = p
    }
  }
  return best
}

/** Six characters: a code someone reads out across a room. */
const CODE_LEN = 6

async function load(id: string): Promise<Row | null> {
  if (!isId(id, CODE_LEN)) return null
  const { data } = await createAdminClient().from('pe_mega_drafts').select('*').eq('id', id).maybeSingle()
  return (data as Row | null) ?? null
}

export type Fail = { ok: false; error: string; status?: number }

async function identity(userId: string | null, rawName: unknown, key: unknown) {
  if (userId) {
    return { ok: true as const, id: userId, key: null, name: await nameForUser(createAdminClient(), userId) }
  }
  const h = hashKey(key)
  const name = cleanGuestName(rawName)
  if (!h) return { ok: false as const, error: 'Your browser could not hold a seat. Try again.' }
  if (!name) return { ok: false as const, error: 'Pick a name between 2 and 24 characters.' }
  return { ok: true as const, id: null, key: h, name }
}

export async function createMega(
  userId: string | null,
  rawName: unknown,
  key: unknown,
  opts: { cpu?: boolean; friend?: unknown } = {}
): Promise<{ ok: true; id: string } | Fail> {
  const who = await identity(userId, rawName, key)
  if (!who.ok) return { ok: false, error: who.error }
  const db = createAdminClient()
  let second: Record<string, unknown> = {}
  if (opts.cpu) {
    // The coin is flipped now: there is nobody else to wait for.
    second = {
      guest_bot: true,
      guest_name: CPU_NAME,
      host_first: randomInt(2) === 0,
      status: 'live',
    }
  } else if (opts.friend != null) {
    if (!userId) return { ok: false, error: 'Sign in to send a draft to a friend.', status: 401 }
    const friend = await friendOf(userId, opts.friend)
    if (!friend) return { ok: false, error: 'You can only send a draft to a friend.', status: 403 }
    second = { invited_id: friend, guest_name: await nameForUser(db, friend) }
  }
  const seed = newServerSeed()
  const board = dealMegaBoard(seed)
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = newId(CODE_LEN)
    const { error } = await db.from('pe_mega_drafts').insert({
      id,
      seed,
      board,
      host_id: who.id,
      host_key: who.key,
      host_name: who.name,
      ...second,
    })
    if (!error) return { ok: true, id }
    if (error.code !== '23505') return { ok: false, error: 'Could not open a draft.' }
  }
  return { ok: false, error: 'Could not open a draft.' }
}

export async function getMega(id: string, userId: string | null, key: unknown): Promise<MegaView | null> {
  const row = await load(id)
  return row ? view(row, roleFor(row, userId, key), userId) : null
}

export async function joinMega(
  id: string,
  userId: string | null,
  rawName: unknown,
  key: unknown
): Promise<{ ok: true; view: MegaView } | Fail> {
  const row = await load(id)
  if (!row) return { ok: false, error: 'No draft with that code.', status: 404 }
  const already = roleFor(row, userId, key)
  if (already) return { ok: true, view: view(row, already, userId) }
  if (row.status !== 'waiting' || row.guest_id || row.guest_key || row.guest_bot) {
    return { ok: false, error: 'This draft already has two players.' }
  }
  if (row.invited_id && row.invited_id !== userId) {
    return { ok: false, error: `This draft was sent to ${row.guest_name ?? 'someone else'}.`, status: 403 }
  }
  const who = await identity(userId, rawName, key)
  if (!who.ok) return { ok: false, error: who.error }

  const { data } = await createAdminClient()
    .from('pe_mega_drafts')
    .update({
      guest_id: who.id,
      guest_key: who.key,
      guest_name: who.name,
      host_first: randomInt(2) === 0,
      status: 'live',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'waiting')
    .is('guest_id', null)
    .is('guest_key', null)
    .eq('guest_bot', false)
    .select('*')
    .maybeSingle()
  if (!data) return { ok: false, error: 'This draft already has two players.' }
  return { ok: true, view: view(data as Row, 'guest', userId) }
}

/**
 * The CPU makes its pick, if it is on the clock. Anyone at the table can ask
 * (the room asks after a beat); asking when it isn't the CPU's turn, or twice
 * for the same pick, changes nothing.
 */
export async function cpuPickMega(
  id: string,
  userId: string | null,
  key: unknown
): Promise<{ ok: true; view: MegaView } | Fail> {
  const row = await load(id)
  if (!row) return { ok: false, error: 'No such draft.', status: 404 }
  const role = roleFor(row, userId, key)
  const seat = seatOf(row, 'guest')
  const n = row.picks.length
  if (!row.guest_bot || row.status !== 'live' || seat == null || megaPickOwner(n) !== seat) {
    return { ok: true, view: view(row, role, userId) }
  }
  const player = cpuChoice(row, seat)
  if (!player) return { ok: true, view: view(row, role, userId) }
  const slot = openSlotFor(lineupsFrom(row)[seat], player)
  const picks: MegaPick[] = [...row.picks, { n, seat, id: player.id, slot }]
  const done = picks.length >= MEGA_TOTAL_PICKS
  const now = new Date().toISOString()
  const { data } = await createAdminClient()
    .from('pe_mega_drafts')
    .update({ picks, updated_at: now, ...(done ? { status: 'done', completed_at: now } : {}) })
    .eq('id', id)
    .eq('updated_at', row.updated_at)
    .select('*')
    .maybeSingle()
  // Somebody else's request got there first; theirs is the pick.
  const fresh = (data as Row | null) ?? (await load(id)) ?? row
  return { ok: true, view: view(fresh, role, userId) }
}

export async function pickMega(
  id: string,
  userId: string | null,
  key: unknown,
  playerId: unknown
): Promise<{ ok: true; view: MegaView } | Fail> {
  const row = await load(id)
  if (!row) return { ok: false, error: 'No such draft.', status: 404 }
  const role = roleFor(row, userId, key)
  if (!role) return { ok: false, error: 'You are not in this draft.', status: 403 }
  if (row.status !== 'live') return { ok: false, error: row.status === 'done' ? 'The draft is over.' : 'Waiting for a second player.' }

  const seat = seatOf(row, role)
  const n = row.picks.length
  if (seat == null || megaPickOwner(n) !== seat) return { ok: false, error: 'Not your pick.' }

  const player = row.board.find((p) => p.id === playerId)
  if (!player) return { ok: false, error: 'That player is not on this board.' }
  if (row.picks.some((p) => p.id === player.id)) return { ok: false, error: 'He has already gone.' }

  const lineup = lineupsFrom(row)[seat]
  const slot = openSlotFor(lineup, player)
  if (slot < 0) return { ok: false, error: `Your ${player.pos} slots are full.` }

  const picks: MegaPick[] = [...row.picks, { n, seat, id: player.id, slot }]
  const done = picks.length >= MEGA_TOTAL_PICKS
  const now = new Date().toISOString()
  const { data } = await createAdminClient()
    .from('pe_mega_drafts')
    .update({
      picks,
      updated_at: now,
      ...(done ? { status: 'done', completed_at: now } : {}),
    })
    .eq('id', id)
    .eq('updated_at', row.updated_at)
    .select('*')
    .maybeSingle()
  if (!data) return { ok: false, error: 'The board moved under you. Try that pick again.' }
  return { ok: true, view: view(data as Row, role, userId) }
}

export type MegaListItem = {
  id: string
  status: Row['status']
  opponent: string | null
  yourScore: number | null
  theirScore: number | null
  /** A friend sent it to you and you haven't sat down yet. */
  waitingOnYou: boolean
}

export type MegaResultRow = { opponentId: string | null; yours: number; theirs: number }

/** Every finished Mega Draft this account sat in, for its record and its
    head-to-heads. */
export async function megaResults(userId: string): Promise<MegaResultRow[]> {
  const { data } = await createAdminClient()
    .from('pe_mega_drafts')
    .select('*')
    .eq('status', 'done')
    // A record is against people; drafts with the CPU stay in the lobby list.
    .eq('guest_bot', false)
    .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
    .order('completed_at', { ascending: false })
    .limit(300)
  return ((data ?? []) as Row[]).flatMap((r) => {
    const role: Role = r.host_id === userId ? 'host' : 'guest'
    const v = view(r, role)
    if (v.you == null) return []
    return [
      {
        opponentId: role === 'host' ? r.guest_id : r.host_id,
        yours: v.seats[v.you].score,
        theirs: v.seats[v.you === 0 ? 1 : 0].score,
      },
    ]
  })
}

export async function listMega(userId: string): Promise<MegaListItem[]> {
  const { data } = await createAdminClient()
    .from('pe_mega_drafts')
    .select('*')
    .or(`host_id.eq.${userId},guest_id.eq.${userId},invited_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(15)
  return ((data ?? []) as Row[]).map((r) => {
    const role: Role = r.host_id === userId ? 'host' : 'guest'
    const v = view(r, role, userId)
    const mine = v.you != null ? v.seats[v.you] : null
    const theirs = v.you != null ? v.seats[v.you === 0 ? 1 : 0] : null
    return {
      id: r.id,
      status: r.status,
      opponent: role === 'host' ? r.guest_name : r.host_name,
      yourScore: mine && r.status !== 'waiting' ? mine.score : null,
      theirScore: theirs && r.status !== 'waiting' ? theirs.score : null,
      waitingOnYou: r.invited_id === userId && !r.guest_id && r.status === 'waiting',
    }
  })
}
