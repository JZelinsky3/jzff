// Field General: the rules of a game. Pure and import-free apart from the game's
// own rules, so the server, the browser and the simulator all run this same code.
//
// Twelve cards, three lanes, six drives. Each drive you get that many points of cap
// room, and both sides play face down and turn over together. Win two lanes of three.
//
// A card's lanes and what it does come from its position, so a thousand cards need
// no rule of their own. Nothing here knows about a player seat being a person: two
// seats lock in plays and applyDrive takes both, so the CPU and a friend are the
// same to it.
//
// Four things give a drive more to think about than where to put a man:
//
//   carry   Cap room you don't spend comes with you for one drive.
//   goals   From the second drive on, each drive names something to do, for points
//           in a lane, a card or cap room. Both sides see it and either can meet it.
//   stacks  A man can come in behind another for half his cost and half his strength,
//           which is how a lane gets past four.
//   calls   Cards with words on them, shuffled in with your men: see ./calls.

import { chemistryFor, type Player, type PoolKey } from '../rules'
import { callOf } from './calls'
import { TEAM_DIVISION, eventCost, eventPower, type LockerEvent } from './rules'

export const DRIVES = 6
export const LANE_MAX = 4
export const OPENING_HAND = 3

export const LANES = [
  { key: 'ground', label: 'Ground' },
  { key: 'short', label: 'Short' },
  { key: 'deep', label: 'Deep' },
] as const

export type Lane = 0 | 1 | 2

/** Where a position can line up. */
export const LEGAL_LANES: Record<PoolKey, Lane[]> = {
  QB: [1, 2],
  RB: [0, 1],
  WR: [1, 2],
  TE: [0, 1, 2],
  OT: [0, 1],
  OG: [0, 1],
  C: [0, 1],
}

/** What a position does, in the words a card's sheet prints. */
export const POSITION_RULE: Record<PoolKey, string> = {
  QB: 'Short or Deep. Adds 1 to every teammate in his lane.',
  RB: 'Ground or Short.',
  WR: 'Short or Deep.',
  TE: 'Any lane.',
  OT: 'Ground or Short. Adds 1 for every ball carrier in his lane.',
  OG: 'Ground or Short. Adds 1 for every ball carrier in his lane.',
  C: 'Ground or Short. Adds 1 for every ball carrier in his lane.',
}

const LINEMEN = new Set<PoolKey>(['OT', 'OG', 'C'])

/** A Canton carries his lane: this much on top of his own strength per teammate. */
const CANTON_LIFT = 2

export type FgCard = Pick<Player, 'id' | 'pid' | 'name' | 'pos' | 'team' | 'year' | 'rarity' | 'score'>

type Lanes = [string[], string[], string[]]

export type Seat = {
  deck: string[]
  hand: string[]
  lanes: Lanes
  /** Men stacked behind the men in a lane, one behind each at most. */
  stacks: Lanes
  /** Cap room that carried in from the drive before. */
  carry: number
  /** Points in a lane that came from goals and calls rather than cards. */
  bonus: [number, number, number]
  /** A lane this side can't play in this drive. */
  closed: Lane | null
}

export type Play = { card: string; lane: Lane; stack?: boolean }

export type FgMatch = {
  seed: number
  /** The drive being played, 1 to DRIVES. Past that, the game's over. */
  drive: number
  seats: [Seat, Seat]
  /** The plays that went down last drive, for the table to turn over. */
  last: [Play[], Play[]] | null
  /** Each drive's goal, by id, first drive first. */
  goals: (string | null)[]
  /** Who met last drive's goal. */
  lastGoal: { id: string; met: [boolean, boolean] } | null
}

export type Lookup = (id: string) => FgCard | null

/** A small seeded generator, so a match replays exactly. */
export function rng(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(list: T[], rnd: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * A Canton always makes the opening hand. At 6 he can only ever come down on the
 * last drive, so one you didn't draw is a card you never played: this makes him the
 * finisher you know you've got, and it's why a deck only gets one.
 */
function seat(deck: string[], rnd: () => number, byId: Lookup): Seat {
  const order = shuffled(deck, rnd)
  const canton = order.find((id) => byId(id)?.rarity === 'canton')
  const dealt = canton ? [canton, ...order.filter((id) => id !== canton)] : order
  return {
    hand: dealt.slice(0, OPENING_HAND + 1),
    deck: dealt.slice(OPENING_HAND + 1),
    lanes: [[], [], []],
    stacks: [[], [], []],
    carry: 0,
    bonus: [0, 0, 0],
    closed: null,
  }
}

export function newMatch(decks: [string[], string[]], seed: number, byId: Lookup): FgMatch {
  const rnd = rng(seed)
  return { seed, drive: 1, seats: [seat(decks[0], rnd, byId), seat(decks[1], rnd, byId)], last: null, goals: dealGoals(rnd), lastGoal: null }
}

/** Cap room a drive gives you, before anything carried in. */
export const roomFor = (drive: number) => drive

/** What one side has to spend this drive. */
export const capFor = (match: FgMatch, at: 0 | 1) => roomFor(match.drive) + match.seats[at].carry

/**
 * Stacked: half the cost and half the strength, both rounded up, and no slot, so a
 * lane holds four men and a man behind each. He adds his strength and nothing else:
 * no lift, no chemistry. A Canton doesn't stack, or he'd come down for 3 by the third
 * drive of every game.
 */
export const canStack = (card: Pick<FgCard, 'rarity'>) => card.rarity !== 'canton'
export const stackCost = (card: FgCard, event: LockerEvent | null) => Math.ceil(eventCost(card, event) / 2)
export const stackPower = (card: FgCard, event: LockerEvent | null) => Math.ceil(eventPower(card, event) / 2)

/** What one play costs. */
export function playCost(play: Play, byId: Lookup, event: LockerEvent | null): number {
  const call = callOf(play.card)
  if (call) return call.cost
  const card = byId(play.card)
  if (!card) return 0
  return play.stack ? stackCost(card, event) : eventCost(card, event)
}

export type LaneTotal = { total: number; cards: number; lifts: number; chem: number; stacks: number; bonus: number }

/** What one side's cards add up to in a lane, and where it came from. */
export function laneTotal(cards: FgCard[], event: LockerEvent | null, stacked: FgCard[] = [], bonus = 0): LaneTotal {
  const base = cards.reduce((sum, c) => sum + eventPower(c, event), 0)
  const carriers = cards.filter((c) => !LINEMEN.has(c.pos)).length
  let lifts = 0
  for (const c of cards) {
    if (c.pos === 'QB') lifts += cards.length - 1
    if (LINEMEN.has(c.pos)) lifts += carriers
    if (c.rarity === 'canton') lifts += CANTON_LIFT * (cards.length - 1)
  }
  let chem = 0
  for (const b of chemistryFor(cards, true).bonds) {
    if (b.type === 'rivalry') chem -= 1
    else chem += b.reason.includes('real teammates') ? 3 : 2
  }
  const stacks = stacked.reduce((sum, c) => sum + stackPower(c, event), 0)
  return { total: Math.max(0, base + lifts + chem + stacks + bonus), cards: base, lifts, chem, stacks, bonus }
}

const lookupAll = (ids: string[], byId: Lookup) => ids.flatMap((id) => byId(id) ?? [])

export function laneTotals(side: Seat, byId: Lookup, event: LockerEvent | null): [LaneTotal, LaneTotal, LaneTotal] {
  return side.lanes.map((ids, i) => laneTotal(lookupAll(ids, byId), event, lookupAll(side.stacks[i], byId), side.bonus[i])) as [LaneTotal, LaneTotal, LaneTotal]
}

/** Why a set of plays can't go down, or null if it can. */
export function playProblem(match: FgMatch, at: 0 | 1, plays: Play[], byId: Lookup, event: LockerEvent | null): string | null {
  const side = match.seats[at]
  const seen = new Set<string>()
  const lanes = side.lanes.map((l) => l.length)
  const stacks = side.stacks.map((l) => l.length)
  let spent = 0
  // Men first, so a man stacked behind someone placed this drive finds him there.
  for (const p of [...plays].sort((a, b) => Number(!!a.stack) - Number(!!b.stack))) {
    if (!side.hand.includes(p.card) || seen.has(p.card)) return "That card isn't in your hand."
    seen.add(p.card)
    spent += playCost(p, byId, event)
    const call = callOf(p.card)
    if (call) {
      if (call.lastDriveOnly && match.drive !== DRIVES) return `${call.title} is for the last drive.`
      continue
    }
    const card = byId(p.card)
    if (!card) return "That card isn't in your hand."
    if (!LEGAL_LANES[card.pos].includes(p.lane)) return `${card.name} can't line up there.`
    if (side.closed === p.lane) return 'That lane is closed this drive.'
    if (p.stack) {
      if (!canStack(card)) return "A Canton doesn't stack."
      if (++stacks[p.lane] > lanes[p.lane]) return 'Nobody in that lane is free to stack behind.'
    } else if (++lanes[p.lane] > LANE_MAX) return 'That lane is full.'
  }
  return spent > capFor(match, at) ? 'That goes over your cap room.' : null
}

/** Both sides' plays go down at once, then calls and goals land on the full table,
    and each side draws for the next drive. */
export function applyDrive(match: FgMatch, plays: [Play[], Play[]], byId: Lookup, event: LockerEvent | null): FgMatch {
  const goal = goalOn(match, match.drive)
  const seats = match.seats.map((s, i) => {
    const side: Seat = {
      ...s,
      deck: [...s.deck],
      hand: [...s.hand],
      lanes: [[...s.lanes[0]], [...s.lanes[1]], [...s.lanes[2]]],
      stacks: [[...s.stacks[0]], [...s.stacks[1]], [...s.stacks[2]]],
      bonus: [...s.bonus],
      closed: null,
    }
    for (const p of plays[i]) {
      side.hand = side.hand.filter((id) => id !== p.card)
      if (!callOf(p.card)) (p.stack ? side.stacks : side.lanes)[p.lane].push(p.card)
    }
    return side
  }) as [Seat, Seat]

  const met: [boolean, boolean] = [false, false]
  seats.forEach((side, i) => {
    const other = seats[i === 0 ? 1 : 0]
    const spent = plays[i].reduce((sum, p) => sum + playCost(p, byId, event), 0)
    // The drive's own room goes first, so what's left of it is what rolls on and
    // anything that carried in has had its one drive.
    let carry = Math.max(0, roomFor(match.drive) - spent)
    let draw = 1
    let plan = false
    for (const p of plays[i]) {
      const does = callOf(p.card)?.does
      if (!does) continue
      if (does.kind === 'draw') draw += does.n
      else if (does.kind === 'cap') carry += does.n
      else if (does.kind === 'lane') side.bonus[does.lane ?? p.lane] += does.n
      else if (does.kind === 'every') side.bonus = side.bonus.map((n) => n + does.n) as Seat['bonus']
      else if (does.kind === 'blitz') other.bonus[p.lane] -= does.each * other.lanes[p.lane].length
      else if (does.kind === 'close') other.closed = p.lane
      else if (does.kind === 'goal') plan = true
      else if (does.kind === 'keep') carry += Math.max(0, match.seats[i].carry - Math.max(0, spent - roomFor(match.drive)))
    }
    if (goal && (plan || goal.met({ plays: drivePlays(plays[i], byId), down: downOn(side, byId), spent }))) {
      met[i] = true
      const { pay } = goal
      if (pay.kind === 'draw') draw += pay.n
      else if (pay.kind === 'cap') carry += pay.n
      else if (pay.kind === 'lane') side.bonus[pay.lane] += pay.n
      else side.bonus = side.bonus.map((n) => n + pay.n) as Seat['bonus']
    }
    side.carry = carry
    if (match.drive < DRIVES) side.hand.push(...side.deck.splice(0, draw))
  })
  return { ...match, drive: match.drive + 1, seats, last: plays, lastGoal: goal ? { id: goal.id, met } : null }
}

export const isOver = (match: FgMatch) => match.drive > DRIVES

export type FgResult = {
  lanes: { totals: [number, number]; winner: 0 | 1 | null }[]
  score: [number, number]
  winner: 0 | 1 | null
}

/** Two lanes of three wins it. Level on lanes, the bigger total does. */
export function fgResult(match: FgMatch, byId: Lookup, event: LockerEvent | null): FgResult {
  const a = laneTotals(match.seats[0], byId, event)
  const b = laneTotals(match.seats[1], byId, event)
  const lanes = a.map((t, i) => {
    const totals: [number, number] = [t.total, b[i].total]
    return { totals, winner: totals[0] === totals[1] ? null : ((totals[0] > totals[1] ? 0 : 1) as 0 | 1) }
  })
  const score: [number, number] = [lanes.filter((l) => l.winner === 0).length, lanes.filter((l) => l.winner === 1).length]
  const sum = (side: 0 | 1) => lanes.reduce((s, l) => s + l.totals[side], 0)
  const winner = score[0] !== score[1] ? (score[0] > score[1] ? 0 : 1) : sum(0) === sum(1) ? null : sum(0) > sum(1) ? 0 : 1
  return { lanes, score, winner }
}

/** The biggest plays a hand can afford off the cap room it has, and the biggest few
    of those that would meet the drive's goal. */
function bestHands(hand: FgCard[], room: number, event: LockerEvent | null, goal: DriveGoal | null, already: DrivePlay[]): FgCard[][] {
  const out: { cards: FgCard[]; worth: number; cost: number }[] = []
  const n = Math.min(hand.length, 12)
  for (let mask = 1; mask < 1 << n; mask++) {
    const cards = hand.filter((_, i) => mask & (1 << i))
    const cost = cards.reduce((s, c) => s + eventCost(c, event), 0)
    if (cost > room) continue
    out.push({ cards, cost, worth: cards.reduce((s, c) => s + eventPower(c, event), 0) })
  }
  out.sort((x, y) => y.worth - x.worth)
  const top = out.slice(0, 6)
  const meets = (h: (typeof out)[number]) =>
    LEGAL_LANES[h.cards[0].pos].some((lane) => {
      const plays = h.cards.map((card) => ({ card, lane: LEGAL_LANES[card.pos].includes(lane) ? lane : leanLane(card, goal) }))
      return goal?.met({ plays, down: [...already, ...plays], spent: h.cost })
    })
  const meeting = goal ? out.filter((h) => !top.includes(h) && meets(h)).slice(0, 3) : []
  return [...top, ...meeting].map((h) => h.cards)
}

/** The lane a man should head for if the goal wants him somewhere. */
function leanLane(card: FgCard, goal: DriveGoal | null): Lane {
  const lanes = LEGAL_LANES[card.pos]
  return goal?.lane != null && lanes.includes(goal.lane) ? goal.lane : lanes[0]
}

/** What the CPU thinks a goal's pay is worth, in points on the table. */
function payWorth(pay: GoalPay, drive: number): number {
  if (pay.kind === 'lane') return pay.n * 1.2
  if (pay.kind === 'every') return pay.n * 3
  return drive < DRIVES - 1 ? 4 : 1
}

/** The lane with the fewest cards this man can join: how you'd play without reading
    the table at all. */
function leastFilled(card: FgCard, lanes: FgCard[][], closed: Lane | null, rnd: () => number): Lane | null {
  const open = LEGAL_LANES[card.pos].filter((l) => l !== closed && lanes[l].length < LANE_MAX)
  return open.sort((a, b) => lanes[a].length - lanes[b].length || rnd() - 0.5)[0] ?? null
}

/**
 * The CPU's call. It sees what the table sees: what's already down, never what's
 * being played. It takes the strongest hand it can afford and works each card into
 * the lane where it changes the most, giving up on a lane it can't get back.
 *
 * `slip` is how good it is, 0 to 1: how often a drive goes by without it reading the
 * table. On a slip it takes whichever good hand comes to mind, a card goes wherever
 * there's room, and it forgets the goal and its calls.
 */
export function cpuPlays(match: FgMatch, at: 0 | 1, byId: Lookup, event: LockerEvent | null, rnd: () => number, slip = 0): Play[] {
  const mine = match.seats[at]
  const theirs = match.seats[at === 0 ? 1 : 0]
  const hand = lookupAll(mine.hand, byId)
  const room = capFor(match, at)
  const late = (match.drive - 1) / (DRIVES - 1)
  const foe = laneTotals(theirs, byId, event).map((t) => t.total)
  const ours = laneTotals(mine, byId, event).map((t) => t.total)
  const goal = goalOn(match, match.drive)
  const offDay = rnd() < slip
  const already = downOn(mine, byId)
  const closeness = (gap: number) => 1 - Math.min(1, Math.abs(gap) / (10 + 14 * (1 - late)))

  /** The lane a call does the most in, and what that's worth. */
  const callPlay = (id: string): { lane: Lane; worth: number } | null => {
    const call = callOf(id)
    if (!call || call.cost > room || (call.lastDriveOnly && match.drive !== DRIVES)) return null
    const drawing = match.drive < DRIVES
    const { does } = call
    const swing = (points: (l: Lane) => number): { lane: Lane; worth: number } =>
      ([0, 1, 2] as Lane[]).map((lane) => ({ lane, worth: points(lane) * (0.6 + closeness(ours[lane] - foe[lane])) })).sort((a, b) => b.worth - a.worth)[0]
    if (does.kind === 'draw') return drawing ? { lane: 0, worth: 5 * (1 - late) + 1 } : null
    if (does.kind === 'cap') return drawing ? { lane: 0, worth: 5 } : null
    if (does.kind === 'lane') return swing((l) => (does.lane == null || does.lane === l ? does.n : 0))
    if (does.kind === 'blitz') return swing((l) => does.each * theirs.lanes[l].length)
    if (does.kind === 'every') return { lane: 0, worth: does.n * 3 * (0.5 + late) }
    if (does.kind === 'goal') return goal ? { lane: 0, worth: payWorth(goal.pay, match.drive) } : null
    if (does.kind === 'close') return drawing ? swing(() => 3 + 2 * late) : null
    return null
  }

  const options = offDay ? [null] : [null, ...mine.hand.filter((id) => callPlay(id)?.worth)]
  let best: { plays: Play[]; value: number; left: number } | null = null
  for (const id of options) {
    const call = id ? callOf(id) : null
    const aim = id ? callPlay(id) : null
    const left = room - (call?.cost ?? 0)
    const hands = bestHands(hand, left, event, offDay ? null : goal, already)
    for (const cards of offDay ? hands.slice(Math.floor(rnd() * hands.length)).slice(0, 1) : [[], ...hands]) {
      const lanes: FgCard[][] = mine.lanes.map((ids) => lookupAll(ids, byId))
      const plays: Play[] = id && aim ? [{ card: id, lane: aim.lane }] : []
      const placed: DrivePlay[] = []
      let value = aim?.worth ?? 0
      for (const c of [...cards].sort((x, y) => eventPower(y, event) - eventPower(x, event))) {
        let pick: { lane: Lane; worth: number } | null = null
        if (offDay) {
          const lane = leastFilled(c, lanes, mine.closed, rnd)
          if (lane != null) pick = { lane, worth: 0 }
        } else {
          for (const lane of LEGAL_LANES[c.pos]) {
            if (lane === mine.closed || lanes[lane].length >= LANE_MAX) continue
            const before = laneTotal(lanes[lane], event).total
            const after = laneTotal([...lanes[lane], c], event).total
            // A lane that's close is worth fighting for, more so as the game runs out;
            // one that's gone isn't, and one that's safe can wait.
            const gap = ours[lane] - foe[lane]
            const lost = gap < -18 * late - 8 ? -6 * late : 0
            const trial = [...placed, { card: c, lane }]
            const wanted = goal?.met({ plays: trial, down: [...already, ...trial], spent: 0 }) ? 5 : goal?.lane === lane ? 2 : 0
            const worth = (after - before) * (1 + closeness(gap)) + lost + wanted + rnd() * 1.5
            if (!pick || worth > pick.worth) pick = { lane, worth }
          }
        }
        if (!pick) continue
        plays.push({ card: c.id, lane: pick.lane })
        placed.push({ card: c, lane: pick.lane })
        lanes[pick.lane] = [...lanes[pick.lane], c]
        value += pick.worth
      }
      const spent = plays.reduce((sum, p) => sum + playCost(p, byId, event), 0)
      if (!offDay && goal?.met({ plays: placed, down: [...already, ...placed], spent })) value += payWorth(goal.pay, match.drive)
      if (!best || value > best.value) best = { plays, value, left: room - spent }
    }
  }
  if (!best) return []

  // Room left over goes behind someone: anyone on the last drive, and only the cheap
  // before that, since a stacked man's other half is gone for good.
  const out = [...best.plays]
  let left = best.left
  if (!offDay) {
    const down = new Set(out.map((p) => p.card))
    const hosts = mine.lanes.map((ids, l) => ids.length + out.filter((p) => p.lane === l && !p.stack && !callOf(p.card)).length - mine.stacks[l].length)
    const rest = hand.filter((c) => !down.has(c.id) && canStack(c) && (match.drive === DRIVES || c.rarity === 'common' || c.rarity === 'rare'))
    for (const c of rest.sort((a, b) => stackPower(b, event) - stackPower(a, event))) {
      const cost = stackCost(c, event)
      if (cost > left) continue
      const lane = LEGAL_LANES[c.pos].filter((l) => l !== mine.closed && hosts[l] > 0).sort((a, b) => closeness(ours[b] - foe[b]) - closeness(ours[a] - foe[a]))[0]
      if (lane == null) continue
      out.push({ card: c.id, lane, stack: true })
      hosts[lane]--
      left -= cost
    }
  }
  return out
}

// ============================================================
// Goals
// ============================================================

/** A man who went down this drive. */
export type DrivePlay = { card: FgCard; lane: Lane; stack?: boolean }

const drivePlays = (plays: Play[], byId: Lookup): DrivePlay[] =>
  plays.flatMap((p) => {
    const card = byId(p.card)
    return card ? [{ card, lane: p.lane, stack: p.stack }] : []
  })

/** Everyone a side has on the field, stacked men too. */
export const downOn = (side: Pick<Seat, 'lanes' | 'stacks'>, byId: Lookup): DrivePlay[] =>
  ([0, 1, 2] as Lane[]).flatMap((lane) => [
    ...lookupAll(side.lanes[lane], byId).map((card) => ({ card, lane })),
    ...lookupAll(side.stacks[lane], byId).map((card) => ({ card, lane, stack: true })),
  ])

export type GoalPay =
  | { kind: 'lane'; lane: Lane; n: number }
  | { kind: 'every'; n: number }
  | { kind: 'draw'; n: number }
  | { kind: 'cap'; n: number }

export type DriveGoal = {
  id: string
  title: string
  line: string
  pay: GoalPay
  /** The drives it can land on. */
  from: number
  to: number
  /** The lane it wants men in, if it wants one. */
  lane?: Lane
  /** Whether a side has met it, off the men it played this drive, every man it has
      down once they're in, and the cap it spent. */
  met: (drive: GoalCheck) => boolean
}

export type GoalCheck = { plays: DrivePlay[]; down: DrivePlay[]; spent: number }

type Is = (card: FgCard) => boolean
const pos = (...list: PoolKey[]): Is => (c) => list.includes(c.pos)
const LINEMAN: Is = (c) => LINEMEN.has(c.pos)
/** Two kinds of man side by side in one lane, whenever each of them got there. */
const together = (a: Is, b: Is) => ({ down }: GoalCheck) =>
  ([0, 1, 2] as Lane[]).some((l) => down.some((p) => p.lane === l && a(p.card)) && down.some((p) => p.lane === l && b(p.card)))
const onLane = (lane: Lane, is: Is) => ({ plays }: GoalCheck) => plays.some((p) => p.lane === lane && is(p.card))
const filled = (lane: Lane) => ({ down }: GoalCheck) => down.filter((p) => p.lane === lane).length >= 3

/** Whether any `n` men share something. */
function share(plays: DrivePlay[], key: (c: FgCard) => string | number | undefined, n: number): boolean {
  const seen = new Map<string | number, number>()
  for (const { card } of plays) {
    const k = key(card)
    if (k === undefined) continue
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  return [...seen.values()].some((v) => v >= n)
}

/**
 * The early goals pay in tempo, a card or cap room, while there's time to use it, and
 * the late ones in points. The two-man goals look at the whole lane, so a man who went
 * down two drives ago counts, and with every goal on show from the start you can be
 * setting one up well before it lands. A goal for two men from one conference or one
 * decade is what a themed deck is built to hit. Stacked men count for all of them,
 * which can meet a two-man goal on a drive with room for only one.
 *
 * The points are what make a goal worth chasing. At +3 a lane, a bot that went after
 * goals won no more than one that ignored them; at +5, about half a typical lane's
 * margin, chasing them was worth 4 points of win rate.
 */
export const DRIVE_GOALS: DriveGoal[] = [
  { id: 'hurry-up', title: 'Hurry Up', line: 'Play 2 cards.', pay: { kind: 'cap', n: 1 }, from: 2, to: 3, met: ({ plays }) => plays.length >= 2 },
  { id: 'burn-clock', title: 'Burn The Clock', line: 'Spend 1 cap or less.', pay: { kind: 'draw', n: 1 }, from: 2, to: 4, met: ({ spent }) => spent <= 1 },
  { id: 'establish-run', title: 'Establish The Run', line: 'Play a RB on Ground.', pay: { kind: 'draw', n: 1 }, from: 2, to: 3, lane: 0, met: onLane(0, pos('RB')) },
  { id: 'stretch-field', title: 'Stretch The Field', line: 'Play a WR on Deep.', pay: { kind: 'draw', n: 1 }, from: 2, to: 3, lane: 2, met: onLane(2, pos('WR')) },
  { id: 'check-down', title: 'Check Down', line: 'Play a RB or TE on Short.', pay: { kind: 'cap', n: 1 }, from: 2, to: 4, lane: 1, met: onLane(1, pos('RB', 'TE')) },
  { id: 'same-sideline', title: 'Same Sideline', line: 'Play 2 cards from one conference.', pay: { kind: 'cap', n: 2 }, from: 3, to: 5, met: ({ plays }) => share(plays, (c) => TEAM_DIVISION[c.team]?.slice(0, 3), 2) },
  { id: 'same-decade', title: 'Same Decade', line: 'Play 2 cards from one decade.', pay: { kind: 'draw', n: 1 }, from: 3, to: 5, met: ({ plays }) => share(plays, (c) => (c.year == null ? undefined : Math.floor(c.year / 10)), 2) },
  { id: 'play-action', title: 'Play Action', line: 'Get a QB and a RB in one lane.', pay: { kind: 'lane', lane: 1, n: 5 }, from: 3, to: 5, met: together(pos('QB'), pos('RB')) },
  { id: 'run-block', title: 'Run Block', line: 'Get a lineman and a RB in one lane.', pay: { kind: 'lane', lane: 0, n: 5 }, from: 3, to: 5, met: together(LINEMAN, pos('RB')) },
  { id: 'pass-pro', title: 'Pass Protection', line: 'Get a lineman and a QB in one lane.', pay: { kind: 'lane', lane: 2, n: 5 }, from: 3, to: 5, met: together(LINEMAN, pos('QB')) },
  { id: 'quick-slant', title: 'Quick Slant', line: 'Get a lineman and a WR in one lane.', pay: { kind: 'lane', lane: 1, n: 5 }, from: 3, to: 5, met: together(LINEMAN, pos('WR')) },
  { id: 'heavy-set', title: 'Heavy Set', line: 'Get a TE and a lineman in one lane.', pay: { kind: 'lane', lane: 0, n: 5 }, from: 3, to: 5, met: together(pos('TE'), LINEMAN) },
  { id: 'twins', title: 'Twins Right', line: 'Get 2 WRs in one lane.', pay: { kind: 'lane', lane: 2, n: 5 }, from: 3, to: 5, met: ({ down }) => ([0, 1, 2] as Lane[]).some((l) => down.filter((p) => p.lane === l && p.card.pos === 'WR').length >= 2) },
  { id: 'four-verts', title: 'Four Verticals', line: 'Get 3 cards on Deep.', pay: { kind: 'lane', lane: 2, n: 6 }, from: 6, to: 6, lane: 2, met: filled(2) },
  { id: 'goal-line', title: 'Goal Line', line: 'Get 3 cards on Ground.', pay: { kind: 'lane', lane: 0, n: 6 }, from: 6, to: 6, lane: 0, met: filled(0) },
  { id: 'red-zone', title: 'Red Zone', line: 'Get 3 cards on Short.', pay: { kind: 'lane', lane: 1, n: 6 }, from: 6, to: 6, lane: 1, met: filled(1) },
  { id: 'two-minute', title: 'Two Minute Drill', line: 'Play 2 cards.', pay: { kind: 'every', n: 2 }, from: 6, to: 6, met: ({ plays }) => plays.length >= 2 },
]

const GOALS_BY_ID = new Map(DRIVE_GOALS.map((g) => [g.id, g]))

export const driveGoal = (id: string | null | undefined): DriveGoal | null => (id ? GOALS_BY_ID.get(id) ?? null : null)

export const goalOn = (match: Pick<FgMatch, 'goals'>, drive: number): DriveGoal | null => driveGoal(match.goals[drive - 1])

/** One goal a drive, never the same one twice, and none on the first. */
function dealGoals(rnd: () => number): (string | null)[] {
  const used = new Set<string>()
  return Array.from({ length: DRIVES }, (_, i) => {
    const open = DRIVE_GOALS.filter((g) => i + 1 >= g.from && i + 1 <= g.to && !used.has(g.id))
    if (!open.length) return null
    const goal = open[Math.floor(rnd() * open.length)]
    used.add(goal.id)
    return goal.id
  })
}

/** A goal's pay, the way the table prints it. */
export function payLabel(pay: GoalPay): string {
  if (pay.kind === 'lane') return `+${pay.n} ${LANES[pay.lane].label}`
  if (pay.kind === 'every') return `+${pay.n} Every Lane`
  if (pay.kind === 'draw') return pay.n === 1 ? 'Draw A Card' : `Draw ${pay.n}`
  return `+${pay.n} Cap Next Drive`
}
