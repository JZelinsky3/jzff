// A game of Field General on the server. SERVER ONLY.
//
// The rules are in ./fieldGeneral. This is what keeps them honest: the match lives
// in the database, the CPU plays here, and the browser gets what's on the table and
// its own hand, never the other side's. A friend's seat is a second user locking in
// plays where cpuPlays is called now; nothing else about a match would change.

import { createAdminClient } from '@/lib/supabase/admin'
import { dayKey } from '../daily'
import { playerById } from '../pool'
import type { Player } from '../rules'
import { dealCpuDeck, packRandom } from './deal'
import {
  applyDrive,
  cpuPlays,
  fgResult,
  isOver,
  laneTotals,
  newMatch,
  playProblem,
  rng,
  roomFor,
  type FgMatch,
  type FgResult,
  type LaneTotal,
  type Lookup,
  type Play,
  type Seat,
} from './fieldGeneral'
import { BONUS_WINS, lockerEventById, lockerEventForDay, type LockerEvent } from './rules'
import { creditWin, deckFor, winsOn, type WinCredit } from './store'

const GAME = 'field-general'

/** How often the CPU doesn't read the table: see cpuPlays. */
const CPU_SLIP = 0.25

type MatchRow = { id: string; user_id: string; event: string | null; state: FgMatch; status: string }

const byId: Lookup = (id) => playerById(id)
const cards = (ids: string[]) => ids.flatMap((id) => playerById(id) ?? [])

export type SeatView = { lanes: [Player[], Player[], Player[]]; totals: LaneTotal[]; hand: number; deck: number }

export type MatchView = {
  id: string
  status: string
  drive: number
  room: number
  event: LockerEvent | null
  hand: Player[]
  you: SeatView
  foe: SeatView
  /** The foe's cards that came down on the drive just played. */
  fresh: string[]
  result: FgResult | null
  wins: WinCredit
}

function seatView(seat: Seat, event: LockerEvent | null): SeatView {
  return {
    lanes: seat.lanes.map(cards) as SeatView['lanes'],
    totals: laneTotals(seat, byId, event),
    hand: seat.hand.length,
    deck: seat.deck.length,
  }
}

function view(row: MatchRow, wins: WinCredit): MatchView {
  const event = lockerEventById(row.event)
  const m = row.state
  return {
    id: row.id,
    status: row.status,
    drive: m.drive,
    room: roomFor(m.drive),
    event,
    hand: cards(m.seats[0].hand),
    you: seatView(m.seats[0], event),
    foe: seatView(m.seats[1], event),
    fresh: m.last?.[1].map((p) => p.card) ?? [],
    result: isOver(m) ? fgResult(m, byId, event) : null,
    wins,
  }
}

export async function loadMatch(userId: string, id: string): Promise<MatchView | null> {
  const { data } = await createAdminClient().from('pe_locker_matches').select('id, user_id, event, state, status').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!data) return null
  const wins = await winsOn(userId)
  return view(data as MatchRow, { wins, need: BONUS_WINS, earned: false })
}

export async function liveMatch(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().from('pe_locker_matches').select('id').eq('user_id', userId).eq('game', GAME).eq('status', 'live').limit(1).maybeSingle()
  return data?.id ?? null
}

export type Started = { ok: true; id: string } | { ok: false; error: string; status: number }

export async function startMatch(userId: string, mode: 'standard' | 'event'): Promise<Started> {
  const live = await liveMatch(userId)
  if (live) return { ok: true, id: live }
  const deck = await deckFor(userId, GAME)
  if (deck.length === 0) return { ok: false, error: 'Open your Starter Pack first.', status: 400 }

  const event = mode === 'event' ? lockerEventForDay(dayKey()) : null
  const rnd = packRandom()
  const cpu = dealCpuDeck(rnd, event, deck)
  const seed = Math.floor(rnd() * 2 ** 31)
  const state = newMatch([deck.map((c) => c.id), cpu.map((c) => c.id)], seed, byId)
  const { data, error } = await createAdminClient()
    .from('pe_locker_matches')
    .insert({ user_id: userId, game: GAME, event: event?.id ?? null, state })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: 'That game did not start. Try again.', status: 500 }
  return { ok: true, id: data.id }
}

export function parsePlays(raw: unknown): Play[] | null {
  if (!Array.isArray(raw) || raw.length > 12) return null
  const out: Play[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const { card, lane } = item as Record<string, unknown>
    if (typeof card !== 'string' || card.length > 40) return null
    if (lane !== 0 && lane !== 1 && lane !== 2) return null
    out.push({ card, lane })
  }
  return out
}

export type Played = { ok: true; match: MatchView } | { ok: false; error: string; status: number }

/** Your plays and the CPU's go down together. The update is pinned to the drive it
    read, so a double tap plays one drive, not two. */
export async function takeDrive(userId: string, id: string, plays: Play[]): Promise<Played> {
  const db = createAdminClient()
  const { data } = await db.from('pe_locker_matches').select('id, user_id, event, state, status').eq('id', id).eq('user_id', userId).maybeSingle()
  const row = data as MatchRow | null
  if (!row) return { ok: false, error: 'No such game.', status: 404 }
  if (row.status !== 'live') return { ok: false, error: 'That game is over.', status: 409 }

  const event = lockerEventById(row.event)
  const match = row.state
  const problem = playProblem(match, 0, plays, byId, event)
  if (problem) return { ok: false, error: problem, status: 400 }

  const cpu = cpuPlays(match, 1, byId, event, rng(match.seed + match.drive * 101), CPU_SLIP)
  const next = applyDrive(match, [plays, cpu])
  const over = isOver(next)
  const winner = over ? fgResult(next, byId, event).winner : null
  const status = !over ? 'live' : winner === 0 ? 'won' : winner === 1 ? 'lost' : 'drawn'
  const { data: saved } = await db
    .from('pe_locker_matches')
    .update({ state: next, status, ...(over ? { day: dayKey(), finished_at: new Date().toISOString() } : {}) })
    .eq('id', id)
    .eq('status', 'live')
    .eq('state->>drive', String(match.drive))
    .select('id')
  if (!saved?.length) return { ok: false, error: 'That drive already went down.', status: 409 }

  const wins = status === 'won' ? await creditWin(userId) : { wins: await winsOn(userId), need: BONUS_WINS, earned: false }
  return { ok: true, match: view({ ...row, state: next, status }, wins) }
}

/** Walks off. It's no win, and nothing else: leaving costs you the game, not a record. */
export async function resignMatch(userId: string, id: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('pe_locker_matches')
    .update({ status: 'resigned', day: dayKey(), finished_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'live')
    .select('id')
  return !!data?.length
}
