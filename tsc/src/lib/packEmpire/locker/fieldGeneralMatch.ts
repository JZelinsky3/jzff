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
  CPU_LEVELS,
  DRIVES,
  LANES,
  applyDrive,
  cpuPlays,
  driveGoal,
  fgResult,
  formationsOn,
  isOver,
  laneTotals,
  lastDrive,
  newMatch,
  openGoals,
  playProblem,
  rng,
  roomFor,
  talliesOn,
  type CpuLevelId,
  type FgMatch,
  type FgResult,
  type GoalHit,
  type Lane,
  type LaneTotal,
  type Lookup,
  type Play,
  type Seat,
} from './fieldGeneral'
import { BONUS_WINS, FAAB_WIN, lockerEventById, lockerEventForDay, type LockerEvent } from './rules'
import { signatureOf } from './signatures'
import { creditWin, deckCalls, deckFor, tallyStats, winsOn, type WinCredit } from './store'
import type { TrophyStats } from './trophies'

const GAME = 'field-general'

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
  /** What lands on this lane at the end, and what each comes to as things stand: calls
      left on the field, and signatures that wait for the tally. */
  ongoing: { call: string; title: string; lane: Lane; own: boolean; delta: number }[]
  /** Formations they have on, by id. */
  forms: string[]
  /** Goals they've met, by id. */
  goalsMet: string[]
}

/** A goal that's open: how many drives it has left, and who's met it, you first. */
export type GoalView = { id: string; left: number; met: [boolean, boolean] }

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
  /** The goals open this drive. The ones to come are never sent. */
  goals: GoalView[]
  /** The goals that paid last drive, and to whom, you first. */
  lastHits: GoalHit[]
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
  /** How good the CPU is, against the CPU. */
  level: CpuLevelId | null
  /** What a win here pays. */
  faab: number
}

/** How a game saved before goals ran two drives wrote down its drives. */
type OldRecord = FgMatch['history'][number] & { goal?: string | null; met?: [boolean, boolean] }

/** A game that was under way before a rule came in plays on without it. */
function current(m: FgMatch): FgMatch {
  return {
    ...m,
    goals: m.goals ?? [],
    lastHits: m.lastHits ?? [],
    goalsMet: m.goalsMet ?? [[], []],
    history: ((m.history ?? []) as OldRecord[]).map((r) => ({ drive: r.drive, plays: r.plays, hits: r.hits ?? (r.goal ? [{ id: r.goal, met: r.met ?? [false, false] }] : []) })),
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
    ongoing: tallies.map((t) => ({ call: t.call, title: tallyTitle(t.call), lane: t.lane, own: t.on === at, delta: t.delta })),
    forms: formationsOn(seat.lanes.map(cards)).map((f) => f.id),
    goalsMet: m.goalsMet[at],
  }
}

function tallyTitle(id: string): string {
  const man = callOf(id) ? null : playerById(id)
  return callOf(id)?.title ?? (man ? (signatureOf(man)?.title ?? man.name) : '')
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
  if (p.discard) return ''
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
      const tossed = rec.plays[seat].filter((p) => p.discard).length
      if (tossed) said.push(`discarded ${tossed === 1 ? 'a card' : `${tossed} cards`}`)
      const who = seat === at ? 'you' : 'foe'
      lines.push({ drive: rec.drive, who, text: said.length ? `${who === 'you' ? you : foe} ${said.join(', ')}.` : `${who === 'you' ? you : foe} passed.` })
    }
    for (const hit of rec.hits) {
      const goal = driveGoal(hit.id)
      if (!goal) continue
      const them = at === 0 ? 1 : 0
      const met = hit.met[at] && hit.met[them] ? 'Both sides met' : hit.met[at] ? `${you} met` : `${foe} met`
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
  return { name, lanes: [[], [], []], stacks: [[], [], []], totals: [], bonus: [0, 0, 0], hand: 0, deck: 0, book: 0, ongoing: [], forms: [], goalsMet: [] }
}

async function viewOf(row: MatchRow, userId: string, wins: WinCredit): Promise<MatchView> {
  const at: 0 | 1 = row.guest_id === userId ? 1 : 0
  const other = at === 0 ? row.guest_id : row.user_id
  const client = db()
  const level = !row.guest_id && !row.invited_id && !isOpen(row.state) ? (row.state.level ?? 'pro') : null
  const [you, foe] = await Promise.all([
    nameForUser(client, userId),
    !row.guest_id && !row.invited_id ? `${level ? `${CPU_LEVELS[level].label} ` : ''}CPU` : nameForUser(client, other ?? (row.invited_id as string)),
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
      goals: [],
      lastHits: [],
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
      level: null,
      faab: FAAB_WIN,
    }
  }

  const m = current(row.state)
  const them = (at === 0 ? 1 : 0) as 0 | 1
  const mine = m.seats[at]
  const called = (plays: Play[] = []) => plays.filter((p) => !p.discard && callOf(p.card))
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
    goals: row.status === 'live' ? openGoals(m, m.drive).map(({ goal, left }) => ({ id: goal.id, left, met: [m.goalsMet[at].includes(goal.id), m.goalsMet[them].includes(goal.id)] })) : [],
    lastHits: m.lastHits.map((h) => ({ id: h.id, met: [h.met[at], h.met[them]] })),
    lastCalls: [called(m.last?.[at]), called(m.last?.[them])],
    closed: mine.closed,
    you: seatView(m, at, you, event),
    foe: seatView(m, them, foe, event),
    fresh: m.last?.[them].filter((p) => !p.discard && !callOf(p.card)).map((p) => p.card) ?? [],
    result: isOver(m) ? fromSeat(fgResult(m, byId, event), at) : null,
    wins,
    log: logFrom(m, at, you, foe),
    locked: { you: !!row.locks?.[at], foe: !!row.locks?.[them] },
    msLeft: row.deadline && row.status === 'live' ? Math.max(0, Date.parse(row.deadline) - Date.now()) : null,
    level,
    faab: level ? CPU_LEVELS[level].faab : FAAB_WIN,
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

export async function startMatch(userId: string, mode: 'standard' | 'event', level: CpuLevelId = 'pro'): Promise<Started> {
  const live = await liveMatch(userId)
  if (live) return { ok: true, id: live }
  const [deck, calls] = await Promise.all([deckFor(userId, GAME), deckCalls(userId, GAME)])
  if (deck.length === 0) return { ok: false, error: 'Open your Starter Pack first.', status: 400 }

  const event = mode === 'event' ? lockerEventForDay(dayKey()) : null
  const rnd = packRandom()
  const cpu = dealCpuDeck(rnd, event, deck, level)
  const cpuCalls = CALLS.filter((c) => !['keep', 'move'].includes(c.does.kind)).sort(() => rnd() - 0.5).slice(0, CPU_CALLS).map((c) => c.id)
  const seed = Math.floor(rnd() * 2 ** 31)
  const state = { ...newMatch([[...deck.map((c) => c.id), ...calls], [...cpu.map((c) => c.id), ...cpuCalls]], seed, byId), level }
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
    const { card, lane, stack, target, discard } = item as Record<string, unknown>
    if (typeof card !== 'string' || card.length > 40) return null
    if (lane !== 0 && lane !== 1 && lane !== 2) return null
    if (target !== undefined && (typeof target !== 'string' || target.length > 40)) return null
    out.push({ card, lane, ...(stack === true ? { stack: true } : {}), ...(target ? { target } : {}), ...(discard === true ? { discard: true } : {}) })
  }
  return out
}

/** Every card a side came with, whatever's happened to it since. */
function broughtBy(m: FgMatch, at: 0 | 1): string[] {
  const seat = m.seats[at]
  const tossed = m.history.flatMap((r) => r.plays[at].filter((p) => p.discard).map((p) => p.card))
  return [...seat.deck, ...seat.hand, ...seat.lanes.flat(), ...seat.stacks.flat(), ...tossed]
}

/** What a finished game adds to one side's numbers for the Trophy Case. */
function matchStats(m: FgMatch, at: 0 | 1, result: FgResult, versus: boolean, event: boolean): { add: TrophyStats; set: TrophyStats } {
  const won = result.winner === at
  const level = versus ? null : (m.level ?? 'pro')
  const seat = m.seats[at]
  const lanes = seat.lanes.map(cards)
  const add: TrophyStats = { 'fg.games': 1, 'fg.goals': m.goalsMet[at].length }
  const set: TrophyStats = {}
  if (formationsOn(lanes).length >= 3) add['fg.forms3'] = 1
  if (seat.lanes.some((l, i) => l.length + seat.stacks[i].length >= 8)) add['fg.fullLane'] = 1
  if (result.winner !== null) {
    const streaks = level === 'all-pro' ? ['fg.streak', 'fg.streak.all-pro'] : ['fg.streak']
    for (const key of streaks) {
      if (won) add[key] = 1
      else set[key] = 0
    }
  }
  if (!won) return { add, set }
  add['fg.wins'] = 1
  if (level) add[`fg.wins.${level}`] = 1
  if (versus) add['fg.wins.friend'] = 1
  if (event) add['fg.wins.event'] = 1
  if (m.overtime) add['fg.ot'] = 1
  if (result.lanes.some((l, i) => l.winner === at && result.before[i][at] < result.before[i][at === 0 ? 1 : 0])) add['fg.flip'] = 1
  if (level === 'all-pro') {
    if (result.score[at] === 3) add['fg.sweeps.all-pro'] = 1
    if (broughtBy(m, at).every((id) => !playerById(id) || ['common', 'rare'].includes((playerById(id) as Player).rarity))) add['fg.undrafted'] = 1
  }
  return { add, set }
}

/** Files a finished game: the win pays, and both seats' numbers move. */
async function settle(row: MatchRow, m: FgMatch, winner: string | null): Promise<WinCredit | null> {
  const event = lockerEventById(row.event)
  const result = fgResult(m, byId, event)
  const seats = [row.user_id, row.guest_id]
  await Promise.all(
    seats.map(async (id, at) => {
      if (!id) return
      const { add, set } = matchStats(m, at as 0 | 1, result, !!row.guest_id, !!row.event)
      const stats = await tallyStats(id, add, set)
      // The best run only ever goes up, and it has to be read after the run's been counted.
      const best: TrophyStats = {}
      for (const [run, top] of [['fg.streak', 'fg.bestStreak'], ['fg.streak.all-pro', 'fg.bestStreak.all-pro']]) {
        if ((stats[run] ?? 0) > (stats[top] ?? 0)) best[top] = stats[run]
      }
      if (Object.keys(best).length) await tallyStats(id, {}, best)
    })
  )
  return winner ? creditWin(winner, row.guest_id ? FAAB_WIN : CPU_LEVELS[m.level ?? 'pro'].faab) : null
}

/** Puts a drive down: both sides' plays go in, and a game that's over gets its winner.
    False means someone else got there first, and the caller should read again. */
async function resolve(row: MatchRow, match: FgMatch, plays: [Play[], Play[]]): Promise<{ next: MatchRow; credit: WinCredit | null; winner: string | null } | null> {
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
  return { next: { ...row, ...patch, state: next }, winner: winnerId, credit: over ? await settle(row, next, winnerId) : null }
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
    if (!row.guest_id) both = [plays, cpuPlays(match, 1, byId, event, rng(match.seed + match.drive * 101), CPU_LEVELS[match.level ?? 'pro'])]
    else if (row.locks?.[1 - at] || (row.deadline && Date.now() > Date.parse(row.deadline))) {
      const theirs = row.locks?.[1 - at] ?? []
      both = at === 0 ? [plays, theirs] : [theirs, plays]
    }

    if (both) {
      const done = await resolve(row, match, both)
      if (!done) continue
      const wins = done.winner === userId && done.credit ? done.credit : await homeWins(userId)
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
    if (done) return viewOf(done.next, userId, await homeWins(userId))
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
