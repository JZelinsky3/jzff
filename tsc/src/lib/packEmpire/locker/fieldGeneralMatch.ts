// A game of Field General on the server. SERVER ONLY.
//
// The rules are in ./fieldGeneral. This is what keeps them honest: the match lives in
// the database, the CPU plays here, and a browser gets what's on the table and its
// own hand, never the other side's. Nothing a seat has locked in leaves the server
// until both are in, and only this drive's goal is ever sent.
//
// Everything a browser sees is from its own seat: `you` is whoever's asking, seat one
// or seat two, so the table doesn't know which it is.
//
// Against a person, a drive goes down when both seats have locked in or the clock
// runs out, and a seat that hasn't locked by then passes. Both browsers are polling,
// so either one can be what notices. `version` pins every write, so two seats locking
// in at the same moment can't lose one.

import { friendOf } from '@/lib/friends'
import { createAdminClient } from '@/lib/supabase/admin'
import { dayKey } from '../daily'
import { nameForUser } from '../people'
import { playerById } from '../pool'
import type { Player } from '../rules'
import { CALLS, callOf } from './calls'
import { dealCpuDeck, packRandom } from './deal'
import {
  DRIVES,
  LANES,
  applyDrive,
  cpuPlays,
  fgResult,
  formationsOn,
  goalOn,
  isOver,
  laneTotals,
  lastDrive,
  newMatch,
  playProblem,
  rng,
  roomFor,
  talliesOn,
  type FgMatch,
  type FgResult,
  type Lane,
  type LaneTotal,
  type Lookup,
  type Play,
  type Seat,
} from './fieldGeneral'
import { BONUS_WINS, lockerEventById, lockerEventForDay, type LockerEvent } from './rules'
import { creditWin, deckCalls, deckFor, winsOn, type WinCredit } from './store'

const GAME = 'field-general'

/** How often the CPU doesn't read the table: see cpuPlays. */
const CPU_SLIP = 0.15

/** How many calls the CPU brings, at random. Spike It and Audible stay out: they only
    pay off for a side planning a drive ahead. */
const CPU_CALLS = 3

/** How long a drive lasts against a person, and the slack before the server calls it,
    so a lock sent in the last second isn't beaten to the line by a poll. */
const DRIVE_MS = 75_000
const DRIVE_GRACE_MS = 2_500

/** How long a challenge stays open. */
const OPEN_MS = 24 * 60 * 60 * 1000

/** A challenge nobody's taken yet holds the host's deck and nothing else. */
type Open = { host: string[] }

type MatchRow = {
  id: string
  user_id: string
  guest_id: string | null
  invited_id: string | null
  winner_id: string | null
  event: string | null
  state: FgMatch | Open
  status: string
  locks: Record<string, Play[]>
  deadline: string | null
  version: number
  created_at: string
}

const COLUMNS = 'id, user_id, guest_id, invited_id, winner_id, event, state, status, locks, deadline, version, created_at'

const db = () => createAdminClient()
const byId: Lookup = (id) => playerById(id)
const cards = (ids: string[]) => ids.flatMap((id) => playerById(id) ?? [])
const isOpen = (state: MatchRow['state']): state is Open => 'host' in state

export type SeatView = {
  name: string
  lanes: [Player[], Player[], Player[]]
  stacks: [Player[], Player[], Player[]]
  totals: LaneTotal[]
  bonus: number[]
  hand: number
  deck: number
  /** Calls left in their pile. */
  book: number
  /** Calls they've left on the field, and what each comes to as things stand. */
  ongoing: { call: string; lane: Lane; own: boolean; delta: number }[]
  /** Formations they have on, by id. */
  forms: string[]
}

export type LogLine = { drive: number; who: 'you' | 'foe' | 'goal'; text: string }

export type MatchView = {
  id: string
  status: string
  /** A person in the other seat, not the CPU. */
  versus: boolean
  /** A challenge still waiting for someone to sit down. */
  open: boolean
  /** You won because they walked off. */
  walked: boolean
  drive: number
  /** This drive's own cap room. */
  room: number
  /** What carried in on top of it, spent last and gone after this drive. */
  carry: number
  /** The drive the game ends on: six, or seven in overtime. */
  last: number
  overtime: boolean
  event: LockerEvent | null
  hand: Player[]
  /** The play calls in your hand. */
  calls: string[]
  /** This drive's goal, by id. The ones to come are never sent. */
  goal: string | null
  /** Last drive's goal, and who met it, you first. */
  lastGoal: { id: string; met: [boolean, boolean] } | null
  /** The calls each side made last drive, you first. */
  lastCalls: [Play[], Play[]]
  /** A lane you can't play in this drive. */
  closed: Lane | null
  you: SeatView
  foe: SeatView
  /** The foe's men who came down on the drive just played. */
  fresh: string[]
  result: FgResult | null
  wins: WinCredit
  log: LogLine[]
  /** Who's locked in this drive. */
  locked: { you: boolean; foe: boolean }
  /** Milliseconds left on the drive, against a person. */
  msLeft: number | null
}

/** A game that was under way before a rule came in plays on without it. */
function current(m: FgMatch): FgMatch {
  return {
    ...m,
    goals: m.goals ?? [],
    lastGoal: m.lastGoal ?? null,
    history: m.history ?? [],
    seats: m.seats.map((s) => ({
      ...s,
      book: s.book ?? [],
      stacks: s.stacks ?? [[], [], []],
      carry: s.carry ?? 0,
      bonus: s.bonus ?? [0, 0, 0],
      closed: s.closed ?? null,
      ongoing: s.ongoing ?? [],
    })) as FgMatch['seats'],
  }
}

function seatView(m: FgMatch, at: 0 | 1, name: string, event: LockerEvent | null): SeatView {
  const seat: Seat = m.seats[at]
  const tallies = talliesOn(m, byId).filter((t) => t.seat === at)
  return {
    name,
    lanes: seat.lanes.map(cards) as SeatView['lanes'],
    stacks: seat.stacks.map(cards) as SeatView['stacks'],
    totals: laneTotals(seat, byId, event),
    bonus: seat.bonus,
    hand: seat.hand.length,
    deck: seat.deck.length,
    book: seat.book.length,
    ongoing: tallies.map((t) => ({ call: t.call, lane: t.lane, own: t.on === at, delta: t.delta })),
    forms: formationsOn(seat.lanes.map(cards)).map((f) => f.id),
  }
}

/** The result from a seat: `you` is always side 0. */
function fromSeat(r: FgResult, at: 0 | 1): FgResult {
  if (at === 0) return r
  const flip = (s: 0 | 1 | null) => (s === null ? null : ((1 - s) as 0 | 1))
  return {
    lanes: r.lanes.map((l) => ({
      totals: [l.totals[1], l.totals[0]],
      winner: flip(l.winner),
      ...(l.stood != null ? { stood: flip(l.stood) as 0 | 1 } : {}),
    })),
    score: [r.score[1], r.score[0]],
    winner: flip(r.winner),
    tallies: r.tallies.map((t) => ({ ...t, seat: flip(t.seat) as 0 | 1, on: flip(t.on) as 0 | 1 })),
    before: r.before.map((b) => [b[1], b[0]]),
  }
}

function describe(p: Play): string {
  const call = callOf(p.card)
  if (call) {
    const moved = p.target ? playerById(p.target) : null
    if (moved) return `called ${call.title}: ${moved.name} to ${LANES[p.lane].label}`
    return `called ${call.title}${call.aim ? ` on ${LANES[p.lane].label}` : ''}`
  }
  const man = playerById(p.card)
  return man ? `${p.stack ? 'stacked' : 'lined up'} ${man.name} on ${LANES[p.lane].label}` : ''
}

/** The play-by-play, newest first, from a seat. */
function logFrom(m: FgMatch, at: 0 | 1, you: string, foe: string): LogLine[] {
  const lines: LogLine[] = []
  for (const rec of m.history) {
    for (const seat of [at, at === 0 ? 1 : 0] as (0 | 1)[]) {
      const said = rec.plays[seat].map(describe).filter(Boolean)
      const who = seat === at ? 'you' : 'foe'
      lines.push({ drive: rec.drive, who, text: said.length ? `${who === 'you' ? you : foe} ${said.join(', ')}.` : `${who === 'you' ? you : foe} passed.` })
    }
    const goal = rec.goal ? goalOn({ goals: [rec.goal] }, 1) : null
    if (goal) {
      const met = rec.met[at] && rec.met[at === 0 ? 1 : 0] ? 'Both sides met' : rec.met[at] ? `${you} met` : rec.met[at === 0 ? 1 : 0] ? `${foe} met` : 'Nobody met'
      lines.push({ drive: rec.drive, who: 'goal', text: `${met} ${goal.title}.` })
    }
  }
  return lines.reverse()
}

function outcome(row: MatchRow, at: 0 | 1, userId: string): string {
  if (row.status === 'live' || row.status === 'waiting' || row.status === 'drawn') return row.status
  if (!row.guest_id) return row.status
  if (row.winner_id === userId) return 'won'
  return row.status === 'resigned' ? 'resigned' : 'lost'
}

function emptySeat(name: string): SeatView {
  return { name, lanes: [[], [], []], stacks: [[], [], []], totals: [], bonus: [0, 0, 0], hand: 0, deck: 0, book: 0, ongoing: [], forms: [] }
}

async function viewOf(row: MatchRow, userId: string, wins: WinCredit): Promise<MatchView> {
  const at: 0 | 1 = row.guest_id === userId ? 1 : 0
  const other = at === 0 ? row.guest_id : row.user_id
  const client = db()
  const [you, foe] = await Promise.all([
    nameForUser(client, userId),
    !row.guest_id && !row.invited_id ? 'CPU' : nameForUser(client, other ?? (row.invited_id as string)),
  ])
  const event = lockerEventById(row.event)
  const versus = !!row.guest_id || isOpen(row.state)

  if (isOpen(row.state)) {
    return {
      id: row.id,
      status: 'waiting',
      versus: true,
      open: true,
      walked: false,
      drive: 0,
      room: 0,
      carry: 0,
      last: DRIVES,
      overtime: false,
      event,
      hand: [],
      calls: [],
      goal: null,
      lastGoal: null,
      lastCalls: [[], []],
      closed: null,
      you: emptySeat(you),
      foe: emptySeat(row.invited_id ? foe : 'Open Seat'),
      fresh: [],
      result: null,
      wins,
      log: [],
      locked: { you: false, foe: false },
      msLeft: null,
    }
  }

  const m = current(row.state)
  const them = (at === 0 ? 1 : 0) as 0 | 1
  const mine = m.seats[at]
  const called = (plays: Play[] = []) => plays.filter((p) => callOf(p.card))
  const goal = goalOn(m, m.drive)
  const status = outcome(row, at, userId)
  return {
    id: row.id,
    status,
    versus,
    open: false,
    walked: row.status === 'resigned' && status === 'won',
    drive: m.drive,
    room: roomFor(m.drive),
    carry: mine.carry,
    last: lastDrive(m),
    overtime: !!m.overtime,
    event,
    hand: cards(mine.hand),
    calls: mine.hand.filter((id) => callOf(id)),
    goal: goal?.id ?? null,
    lastGoal: m.lastGoal ? { id: m.lastGoal.id, met: [m.lastGoal.met[at], m.lastGoal.met[them]] } : null,
    lastCalls: [called(m.last?.[at]), called(m.last?.[them])],
    closed: mine.closed,
    you: seatView(m, at, you, event),
    foe: seatView(m, them, foe, event),
    fresh: m.last?.[them].filter((p) => !callOf(p.card)).map((p) => p.card) ?? [],
    result: isOver(m) ? fromSeat(fgResult(m, byId, event), at) : null,
    wins,
    log: logFrom(m, at, you, foe),
    locked: { you: !!row.locks?.[at], foe: !!row.locks?.[them] },
    msLeft: row.deadline && row.status === 'live' ? Math.max(0, Date.parse(row.deadline) - Date.now()) : null,
  }
}

const homeWins = async (userId: string, earned = false): Promise<WinCredit> => ({ wins: await winsOn(userId), need: BONUS_WINS, earned })

async function readRow(id: string): Promise<MatchRow | null> {
  const { data } = await db().from('pe_locker_matches').select(COLUMNS).eq('id', id).maybeSingle()
  return (data as MatchRow | null) ?? null
}

const seatOf = (row: MatchRow, userId: string): 0 | 1 | null => (row.user_id === userId ? 0 : row.guest_id === userId ? 1 : null)

export async function loadMatch(userId: string, id: string): Promise<MatchView | null> {
  const row = await readRow(id)
  if (!row || seatOf(row, userId) === null) return null
  return viewOf(row, userId, await homeWins(userId))
}

/** A game someone's in, either seat. */
export async function liveMatch(userId: string): Promise<string | null> {
  const { data } = await db().from('pe_locker_matches').select('id').or(`user_id.eq.${userId},guest_id.eq.${userId}`).eq('game', GAME).eq('status', 'live').limit(1).maybeSingle()
  return data?.id ?? null
}

export type Started = { ok: true; id: string } | { ok: false; error: string; status: number }

export async function startMatch(userId: string, mode: 'standard' | 'event'): Promise<Started> {
  const live = await liveMatch(userId)
  if (live) return { ok: true, id: live }
  const [deck, calls] = await Promise.all([deckFor(userId, GAME), deckCalls(userId, GAME)])
  if (deck.length === 0) return { ok: false, error: 'Open your Starter Pack first.', status: 400 }

  const event = mode === 'event' ? lockerEventForDay(dayKey()) : null
  const rnd = packRandom()
  const cpu = dealCpuDeck(rnd, event, deck)
  const cpuCalls = CALLS.filter((c) => !['keep', 'move'].includes(c.does.kind)).sort(() => rnd() - 0.5).slice(0, CPU_CALLS).map((c) => c.id)
  const seed = Math.floor(rnd() * 2 ** 31)
  const state = newMatch([[...deck.map((c) => c.id), ...calls], [...cpu.map((c) => c.id), ...cpuCalls]], seed, byId)
  const { data, error } = await db().from('pe_locker_matches').insert({ user_id: userId, game: GAME, event: event?.id ?? null, state }).select('id').single()
  if (error || !data) return { ok: false, error: 'That game did not start. Try again.', status: 500 }
  return { ok: true, id: data.id }
}

/** Opens a challenge: to one friend, whose seat waits for them, or as a link for
    whoever opens it first. Your deck is the one in play right now. */
export async function challenge(userId: string, friendship: string | null): Promise<Started> {
  const live = await liveMatch(userId)
  if (live) return { ok: true, id: live }
  const [deck, calls] = await Promise.all([deckFor(userId, GAME), deckCalls(userId, GAME)])
  if (deck.length === 0) return { ok: false, error: 'Open your Starter Pack first.', status: 400 }
  const invited = friendship ? await friendOf(userId, friendship) : null
  if (friendship && !invited) return { ok: false, error: 'You can only challenge a friend.', status: 403 }

  // One open challenge at a time: a new one takes over from the last.
  await db().from('pe_locker_matches').delete().eq('user_id', userId).eq('game', GAME).eq('status', 'waiting')
  const state: Open = { host: [...deck.map((c) => c.id), ...calls] }
  const { data, error } = await db().from('pe_locker_matches').insert({ user_id: userId, game: GAME, invited_id: invited, state, status: 'waiting' }).select('id').single()
  if (error || !data) return { ok: false, error: 'That challenge did not open. Try again.', status: 500 }
  return { ok: true, id: data.id }
}

export type Challenge = { id: string; from: string }

/** Challenges held for this player. */
export async function challengesFor(userId: string): Promise<Challenge[]> {
  const since = new Date(Date.now() - OPEN_MS).toISOString()
  const { data } = await db().from('pe_locker_matches').select('id, user_id').eq('invited_id', userId).eq('status', 'waiting').gte('created_at', since).order('created_at', { ascending: false })
  const rows = (data ?? []) as { id: string; user_id: string }[]
  const client = db()
  return Promise.all(rows.map(async (r) => ({ id: r.id, from: await nameForUser(client, r.user_id) })))
}

/** What the challenge page needs to know before someone's sat down. */
export type Invitation = { id: string; from: string; yours: boolean; taken: boolean; forOther: boolean; gone: boolean }

export async function invitation(userId: string, id: string): Promise<Invitation | null> {
  const row = await readRow(id)
  if (!row) return null
  return {
    id: row.id,
    from: await nameForUser(db(), row.user_id),
    yours: row.user_id === userId,
    taken: row.status !== 'waiting',
    forOther: !!row.invited_id && row.invited_id !== userId,
    gone: Date.parse(row.created_at) < Date.now() - OPEN_MS,
  }
}

/** Sits down in a challenge, with the deck in play. The match is dealt here, once
    both decks are known. */
export async function joinMatch(userId: string, id: string): Promise<Started> {
  const row = await readRow(id)
  if (!row) return { ok: false, error: 'No such challenge.', status: 404 }
  if (seatOf(row, userId) !== null) return { ok: true, id }
  if (row.status !== 'waiting' || !isOpen(row.state)) return { ok: false, error: 'Somebody already took this challenge.', status: 409 }
  if (row.invited_id && row.invited_id !== userId) return { ok: false, error: 'This challenge was sent to someone else.', status: 403 }
  if (await liveMatch(userId)) return { ok: false, error: 'Finish the game you are in first.', status: 409 }
  const [deck, calls] = await Promise.all([deckFor(userId, GAME), deckCalls(userId, GAME)])
  if (deck.length === 0) return { ok: false, error: 'Open your Starter Pack first.', status: 400 }

  const seed = Math.floor(packRandom()() * 2 ** 31)
  const state = newMatch([row.state.host, [...deck.map((c) => c.id), ...calls]], seed, byId)
  const { data } = await db()
    .from('pe_locker_matches')
    .update({ guest_id: userId, state, status: 'live', deadline: new Date(Date.now() + DRIVE_MS).toISOString(), version: row.version + 1 })
    .eq('id', id)
    .eq('status', 'waiting')
    .eq('version', row.version)
    .select('id')
  if (!data?.length) return { ok: false, error: 'Somebody already took this challenge.', status: 409 }
  return { ok: true, id }
}

export function parsePlays(raw: unknown): Play[] | null {
  if (!Array.isArray(raw) || raw.length > 12) return null
  const out: Play[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const { card, lane, stack, target } = item as Record<string, unknown>
    if (typeof card !== 'string' || card.length > 40) return null
    if (lane !== 0 && lane !== 1 && lane !== 2) return null
    if (target !== undefined && (typeof target !== 'string' || target.length > 40)) return null
    out.push({ card, lane, ...(stack === true ? { stack: true } : {}), ...(target ? { target } : {}) })
  }
  return out
}

/** Puts a drive down: both sides' plays go in, and a game that's over gets its winner.
    False means someone else got there first, and the caller should read again. */
async function resolve(row: MatchRow, match: FgMatch, plays: [Play[], Play[]]): Promise<{ next: MatchRow; winner: string | null } | null> {
  const event = lockerEventById(row.event)
  const next = applyDrive(match, plays, byId, event)
  const over = isOver(next)
  const side = over ? fgResult(next, byId, event).winner : null
  const winnerId = side === 0 ? row.user_id : side === 1 ? row.guest_id : null
  const status = !over ? 'live' : side === null ? 'drawn' : row.guest_id ? 'won' : side === 0 ? 'won' : 'lost'
  const patch = {
    state: next,
    status,
    locks: {},
    version: row.version + 1,
    winner_id: winnerId,
    deadline: row.guest_id && !over ? new Date(Date.now() + DRIVE_MS).toISOString() : null,
    ...(over ? { day: dayKey(), finished_at: new Date().toISOString() } : {}),
  }
  const { data: saved } = await db().from('pe_locker_matches').update(patch).eq('id', row.id).eq('status', 'live').eq('version', row.version).select('id')
  if (!saved?.length) return null
  return { next: { ...row, ...patch, state: next }, winner: winnerId }
}

export type Played = { ok: true; match: MatchView } | { ok: false; error: string; status: number }

/** Your plays for this drive. Against the CPU they go down at once. Against a person
    they wait on the server for the other side. */
export async function takeDrive(userId: string, id: string, plays: Play[]): Promise<Played> {
  for (let tries = 0; tries < 4; tries++) {
    const row = await readRow(id)
    const at = row ? seatOf(row, userId) : null
    if (!row || at === null) return { ok: false, error: 'No such game.', status: 404 }
    if (row.status !== 'live') return { ok: false, error: 'That game is over.', status: 409 }
    if (isOpen(row.state)) return { ok: false, error: 'Nobody has sat down yet.', status: 409 }
    if (row.locks?.[at]) return { ok: true, match: await viewOf(row, userId, await homeWins(userId)) }

    const event = lockerEventById(row.event)
    const match = current(row.state)
    const problem = playProblem(match, at, plays, byId, event)
    if (problem) return { ok: false, error: problem, status: 400 }

    let both: [Play[], Play[]] | null = null
    if (!row.guest_id) both = [plays, cpuPlays(match, 1, byId, event, rng(match.seed + match.drive * 101), CPU_SLIP)]
    else if (row.locks?.[1 - at] || (row.deadline && Date.now() > Date.parse(row.deadline))) {
      const theirs = row.locks?.[1 - at] ?? []
      both = at === 0 ? [plays, theirs] : [theirs, plays]
    }

    if (both) {
      const done = await resolve(row, match, both)
      if (!done) continue
      const earned = done.winner ? await creditWin(done.winner) : null
      const wins = done.winner === userId && earned ? earned : await homeWins(userId)
      return { ok: true, match: await viewOf(done.next, userId, wins) }
    }

    const locks = { ...row.locks, [at]: plays }
    const { data } = await db().from('pe_locker_matches').update({ locks, version: row.version + 1 }).eq('id', id).eq('status', 'live').eq('version', row.version).select('id')
    if (data?.length) return { ok: true, match: await viewOf({ ...row, locks, version: row.version + 1 }, userId, await homeWins(userId)) }
  }
  return { ok: false, error: 'That did not go through. Try again.', status: 409 }
}

/** What a browser polls while the other seat's thinking. Whoever asks after the clock
    runs out is what moves the game on: a seat that hasn't locked passes the drive. */
export async function pollMatch(userId: string, id: string): Promise<MatchView | null> {
  const row = await readRow(id)
  if (!row || seatOf(row, userId) === null) return null
  if (row.status === 'live' && row.guest_id && !isOpen(row.state) && row.deadline && Date.now() > Date.parse(row.deadline) + DRIVE_GRACE_MS) {
    const done = await resolve(row, current(row.state), [row.locks?.[0] ?? [], row.locks?.[1] ?? []])
    if (done) {
      if (done.winner) await creditWin(done.winner)
      return viewOf(done.next, userId, await homeWins(userId))
    }
    return loadMatch(userId, id)
  }
  return viewOf(row, userId, await homeWins(userId))
}

/** Walks off. Against the CPU it's no win, and nothing else. Against a person it hands
    them the game, so that win is theirs. */
export async function resignMatch(userId: string, id: string): Promise<boolean> {
  const row = await readRow(id)
  const at = row ? seatOf(row, userId) : null
  if (!row || at === null) return false
  if (row.status === 'waiting') {
    if (at !== 0) return false
    await db().from('pe_locker_matches').delete().eq('id', id).eq('status', 'waiting')
    return true
  }
  const winner = !row.guest_id ? null : at === 0 ? row.guest_id : row.user_id
  const { data } = await db()
    .from('pe_locker_matches')
    .update({ status: 'resigned', winner_id: winner, day: dayKey(), finished_at: new Date().toISOString(), version: row.version + 1 })
    .eq('id', id)
    .eq('status', 'live')
    .select('id')
  if (data?.length && winner) await creditWin(winner)
  return !!data?.length
}
