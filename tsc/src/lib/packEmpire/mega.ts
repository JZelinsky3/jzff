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

import { randomInt } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
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
}

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

function view(row: Row, role: Role | null): MegaView {
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
    canJoin: !role && row.status === 'waiting' && !row.guest_id && !row.guest_key,
    hostName: row.host_name,
  }
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
  key: unknown
): Promise<{ ok: true; id: string } | Fail> {
  const who = await identity(userId, rawName, key)
  if (!who.ok) return { ok: false, error: who.error }
  const db = createAdminClient()
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
    })
    if (!error) return { ok: true, id }
    if (error.code !== '23505') return { ok: false, error: 'Could not open a draft.' }
  }
  return { ok: false, error: 'Could not open a draft.' }
}

export async function getMega(id: string, userId: string | null, key: unknown): Promise<MegaView | null> {
  const row = await load(id)
  return row ? view(row, roleFor(row, userId, key)) : null
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
  if (already) return { ok: true, view: view(row, already) }
  if (row.status !== 'waiting' || row.guest_id || row.guest_key) {
    return { ok: false, error: 'This draft already has two players.' }
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
    .select('*')
    .maybeSingle()
  if (!data) return { ok: false, error: 'This draft already has two players.' }
  return { ok: true, view: view(data as Row, 'guest') }
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
  return { ok: true, view: view(data as Row, role) }
}

export type MegaListItem = {
  id: string
  status: Row['status']
  opponent: string | null
  yourScore: number | null
  theirScore: number | null
}

export type MegaResultRow = { opponentId: string | null; yours: number; theirs: number }

/** Every finished Mega Draft this account sat in, for its record and its
    head-to-heads. */
export async function megaResults(userId: string): Promise<MegaResultRow[]> {
  const { data } = await createAdminClient()
    .from('pe_mega_drafts')
    .select('*')
    .eq('status', 'done')
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
    .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(15)
  return ((data ?? []) as Row[]).map((r) => {
    const role: Role = r.host_id === userId ? 'host' : 'guest'
    const v = view(r, role)
    const mine = v.you != null ? v.seats[v.you] : null
    const theirs = v.you != null ? v.seats[v.you === 0 ? 1 : 0] : null
    return {
      id: r.id,
      status: r.status,
      opponent: role === 'host' ? r.guest_name : r.host_name,
      yourScore: mine && r.status !== 'waiting' ? mine.score : null,
      theirScore: theirs && r.status !== 'waiting' ? theirs.score : null,
    }
  })
}
