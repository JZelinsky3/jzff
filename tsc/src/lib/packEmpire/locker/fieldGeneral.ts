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

import { chemistryFor, type Player, type PoolKey } from '../rules'
import { eventCost, eventPower, type LockerEvent } from './rules'

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

export type Seat = { deck: string[]; hand: string[]; lanes: [string[], string[], string[]] }
export type Play = { card: string; lane: Lane }

export type FgMatch = {
  seed: number
  /** The drive being played, 1 to DRIVES. Past that, the game's over. */
  drive: number
  seats: [Seat, Seat]
  /** The plays that went down last drive, for the table to turn over. */
  last: [Play[], Play[]] | null
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
  return { hand: dealt.slice(0, OPENING_HAND + 1), deck: dealt.slice(OPENING_HAND + 1), lanes: [[], [], []] }
}

export function newMatch(decks: [string[], string[]], seed: number, byId: Lookup): FgMatch {
  const rnd = rng(seed)
  return { seed, drive: 1, seats: [seat(decks[0], rnd, byId), seat(decks[1], rnd, byId)], last: null }
}

/** Cap room on a drive. */
export const roomFor = (drive: number) => drive

export type LaneTotal = { total: number; cards: number; lifts: number; chem: number }

/** What one side's cards add up to in a lane, and where it came from. */
export function laneTotal(cards: FgCard[], event: LockerEvent | null): LaneTotal {
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
  return { total: base + lifts + chem, cards: base, lifts, chem }
}

const lookupAll = (ids: string[], byId: Lookup) => ids.flatMap((id) => byId(id) ?? [])

export function laneTotals(side: Seat, byId: Lookup, event: LockerEvent | null): [LaneTotal, LaneTotal, LaneTotal] {
  return side.lanes.map((ids) => laneTotal(lookupAll(ids, byId), event)) as [LaneTotal, LaneTotal, LaneTotal]
}

/** Why a set of plays can't go down, or null if it can. */
export function playProblem(match: FgMatch, at: 0 | 1, plays: Play[], byId: Lookup, event: LockerEvent | null): string | null {
  const side = match.seats[at]
  const seen = new Set<string>()
  const lanes = side.lanes.map((l) => l.length)
  let spent = 0
  for (const p of plays) {
    const card = byId(p.card)
    if (!card || !side.hand.includes(p.card) || seen.has(p.card)) return "That card isn't in your hand."
    seen.add(p.card)
    if (!LEGAL_LANES[card.pos].includes(p.lane)) return `${card.name} can't line up there.`
    if (++lanes[p.lane] > LANE_MAX) return 'That lane is full.'
    spent += eventCost(card, event)
  }
  return spent > roomFor(match.drive) ? 'That goes over your cap room.' : null
}

/** Both sides' plays go down at once, and each draws for the next drive. */
export function applyDrive(match: FgMatch, plays: [Play[], Play[]]): FgMatch {
  const seats = match.seats.map((s, i) => {
    const side: Seat = { deck: [...s.deck], hand: [...s.hand], lanes: [[...s.lanes[0]], [...s.lanes[1]], [...s.lanes[2]]] }
    for (const p of plays[i]) {
      side.hand = side.hand.filter((id) => id !== p.card)
      side.lanes[p.lane].push(p.card)
    }
    if (match.drive < DRIVES && side.deck.length) side.hand.push(side.deck.shift() as string)
    return side
  }) as [Seat, Seat]
  return { ...match, drive: match.drive + 1, seats, last: plays }
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

/** The biggest plays a hand can afford, off the cap room it has. */
function bestHands(hand: FgCard[], room: number, event: LockerEvent | null): FgCard[][] {
  const out: { cards: FgCard[]; worth: number }[] = []
  const n = Math.min(hand.length, 12)
  for (let mask = 1; mask < 1 << n; mask++) {
    const cards = hand.filter((_, i) => mask & (1 << i))
    const cost = cards.reduce((s, c) => s + eventCost(c, event), 0)
    if (cost > room) continue
    out.push({ cards, worth: cards.reduce((s, c) => s + eventPower(c, event), 0) })
  }
  return out.sort((x, y) => y.worth - x.worth).slice(0, 6).map((h) => h.cards)
}

/** The lane with the fewest cards this man can join: how you'd play without reading
    the table at all. */
function leastFilled(card: FgCard, lanes: FgCard[][], rnd: () => number): Lane | null {
  const open = LEGAL_LANES[card.pos].filter((l) => lanes[l].length < LANE_MAX)
  return open.sort((a, b) => lanes[a].length - lanes[b].length || rnd() - 0.5)[0] ?? null
}

/**
 * The CPU's call. It sees what the table sees: what's already down, never what's
 * being played. It takes the strongest hand it can afford and works each card into
 * the lane where it changes the most, giving up on a lane it can't get back.
 *
 * `slip` is how good it is, 0 to 1: how often a drive goes by without it reading the
 * table. On a slip it takes whichever good hand comes to mind, and a card goes
 * wherever there's room.
 */
export function cpuPlays(match: FgMatch, at: 0 | 1, byId: Lookup, event: LockerEvent | null, rnd: () => number, slip = 0): Play[] {
  const mine = match.seats[at]
  const theirs = match.seats[at === 0 ? 1 : 0]
  const hand = lookupAll(mine.hand, byId)
  const room = roomFor(match.drive)
  const late = (match.drive - 1) / (DRIVES - 1)
  const foe = laneTotals(theirs, byId, event).map((t) => t.total)
  const hands = bestHands(hand, room, event)
  const offDay = rnd() < slip

  let best: { plays: Play[]; value: number } | null = null
  for (const cards of offDay ? hands.slice(Math.floor(rnd() * hands.length)).slice(0, 1) : hands) {
    const lanes: FgCard[][] = mine.lanes.map((ids) => lookupAll(ids, byId))
    const plays: Play[] = []
    let value = 0
    for (const c of [...cards].sort((x, y) => eventPower(y, event) - eventPower(x, event))) {
      let pick: { lane: Lane; worth: number } | null = null
      if (offDay) {
        const lane = leastFilled(c, lanes, rnd)
        if (lane != null) pick = { lane, worth: 0 }
      } else {
        for (const lane of LEGAL_LANES[c.pos]) {
          if (lanes[lane].length >= LANE_MAX) continue
          const before = laneTotal(lanes[lane], event).total
          const after = laneTotal([...lanes[lane], c], event).total
          // A lane that's close is worth fighting for, more so as the game runs out;
          // one that's gone isn't, and one that's safe can wait.
          const gap = before - foe[lane]
          const close = 1 - Math.min(1, Math.abs(gap) / (10 + 14 * (1 - late)))
          const lost = gap < -18 * late - 8 ? -6 * late : 0
          const worth = (after - before) * (1 + close) + lost + rnd() * 1.5
          if (!pick || worth > pick.worth) pick = { lane, worth }
        }
      }
      if (!pick) continue
      plays.push({ card: c.id, lane: pick.lane })
      lanes[pick.lane] = [...lanes[pick.lane], c]
      value += pick.worth
    }
    if (!best || value > best.value) best = { plays, value }
  }
  return best?.plays ?? []
}
