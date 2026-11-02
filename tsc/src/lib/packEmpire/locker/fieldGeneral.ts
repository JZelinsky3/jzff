// Field General: the rules of a game. Pure and import-free apart from the game's
// own rules, so the server, the browser and the simulator all run this same code.
//
// Twelve cards, three lanes, six drives. Each drive you get that many points of cap
// room, and both sides play face down and turn over together. Win two lanes of three.
// Level on lanes after six, one drive of overtime settles it, and level after that the
// bigger total does.
//
// A card's lanes and what it does come from its position, so a thousand cards need
// no rule of their own. Nothing here knows about a player seat being a person: two
// seats lock in plays and applyDrive takes both, so the CPU and a friend are the
// same to it.
//
// Six things give a drive more to think about than where to put a man:
//
//   carry       Cap room you don't spend comes with you for one drive.
//   discards    Any card in your hand can go, and next drive you draw one more for it.
//   goals       Three or four goals a game, each open for two drives, for points in a
//               lane, a card or cap room. Both sides see what's open and either can meet
//               it. Nobody knows which drive has the next one until it lands.
//   stacks      A card can come in behind another for half its cost and half its PL,
//               which is how a lane gets past four. Behind its own position it's worth
//               a little more, so a depth chart is something to build.
//   formations  Men in the right places lift a lane: a run game sets up the deep ball.
//               Always on, nothing to play, and both sides can read yours.
//   calls       Cards with words on them, one in your hand at a time: see ./calls.
//
// And the top of the game does something of its own: see ./signatures.

import { chemistryFor, type Player, type PoolKey } from '../rules'
import { callOf } from './calls'
import { TEAM_DIVISION, eventCost, eventPower, type LockerEvent } from './rules'
import { signatureOf, type SigId } from './signatures'

export const DRIVES = 6
export const LANE_MAX = 4
/** Men in your opening hand, on top of the one play call you start with. */
export const OPENING_HAND = 4

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
  QB: 'Short or Deep. Adds 1 to every teammate in its lane.',
  RB: 'Ground or Short.',
  WR: 'Short or Deep.',
  TE: 'Any lane.',
  OT: 'Ground or Short. Adds 1 for every ball carrier in its lane.',
  OG: 'Ground or Short. Adds 1 for every ball carrier in its lane.',
  C: 'Ground or Short. Adds 1 for every ball carrier in its lane.',
}

const LINEMEN = new Set<PoolKey>(['OT', 'OG', 'C'])

/** What a Canton does: this much per teammate in its lane, and flat in the other two. */
const GOLD_JACKET = { lane: 2, other: 2 }

/** What a Double Coverage takes off each card it's lined up against, at the end. */
const COVERAGE = 1

export type FgCard = Pick<Player, 'id' | 'pid' | 'name' | 'pos' | 'team' | 'year' | 'rarity' | 'score'>

type Lanes = [string[], string[], string[]]

export type Seat = {
  deck: string[]
  /** Your play calls still to come, in order. */
  book: string[]
  /** Men and calls in your hand. */
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
  /** The calls this side has left on the field, for the tally at the end. */
  ongoing: Play[]
}

/** A man going down, or a call being run. `target` is the man an Audible moves. A
    discard is a card leaving your hand, and its lane means nothing. */
export type Play = { card: string; lane: Lane; stack?: boolean; target?: string; discard?: boolean }

export type FgMatch = {
  seed: number
  /** The drive being played, 1 to DRIVES. Past that, the game's over. */
  drive: number
  seats: [Seat, Seat]
  /** The plays that went down last drive, for the table to turn over. */
  last: [Play[], Play[]] | null
  /** Each drive's goal, by id, first drive first. */
  goals: (string | null)[]
  /** The goals that paid out last drive, and to whom. */
  lastHits: GoalHit[]
  /** The goals each side has met, by id. A goal pays a side once. */
  goalsMet: [string[], string[]]
  /** Every drive so far, oldest first, for the play-by-play. */
  history: DriveRecord[]
  /** Level on lanes after six, so a seventh drive settles it. */
  overtime?: boolean
  /** How good the CPU is, on a game against it: see CPU_LEVELS. */
  level?: CpuLevelId
}

export type GoalHit = { id: string; met: [boolean, boolean] }

/** What went down on a drive: the plays, then the goals that paid. */
export type DriveRecord = { drive: number; plays: [Play[], Play[]]; hits: GoalHit[] }

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
 * A Canton always makes the opening hand. At 6 he can only ever come down late, so
 * one you didn't draw is a card you never played: this makes him the finisher you
 * know you've got, and it's why a deck only gets one. Calls sit in a pile of their
 * own, so you always open with four men and one call.
 */
function seat(deck: string[], rnd: () => number, byId: Lookup): Seat {
  const men = shuffled(deck.filter((id) => !callOf(id)), rnd)
  const book = shuffled(deck.filter((id) => callOf(id)), rnd)
  const canton = men.find((id) => byId(id)?.rarity === 'canton')
  const dealt = canton ? [canton, ...men.filter((id) => id !== canton)] : men
  return {
    hand: [...dealt.slice(0, OPENING_HAND), ...book.slice(0, 1)],
    deck: dealt.slice(OPENING_HAND),
    book: book.slice(1),
    lanes: [[], [], []],
    stacks: [[], [], []],
    carry: 0,
    bonus: [0, 0, 0],
    closed: null,
    ongoing: [],
  }
}

export function newMatch(decks: [string[], string[]], seed: number, byId: Lookup): FgMatch {
  const rnd = rng(seed)
  return { seed, drive: 1, seats: [seat(decks[0], rnd, byId), seat(decks[1], rnd, byId)], last: null, goals: dealGoals(rnd), lastHits: [], goalsMet: [[], []], history: [] }
}

/** Cap room a drive gives you, before anything carried in. */
export const roomFor = (drive: number) => drive

/** What one side has to spend this drive. */
export const capFor = (match: FgMatch, at: 0 | 1) => roomFor(match.drive) + match.seats[at].carry

/**
 * Stacked: half the cost and half the PL, both rounded up, and no slot, so a lane holds
 * four cards and one behind each. A stacked card adds its PL and nothing else: no lift,
 * no chemistry. A Canton doesn't stack, or it'd come down for 3 by the third drive of
 * every game.
 *
 * Behind its own position it adds DEPTH on top: a backup RB behind the starter, a second
 * lineman on the line. All linemen count as one position, as they do everywhere else.
 * Who stands behind whom isn't a choice: pairStacks works it out, and gives every stack
 * the best spot it can, so there's no way to get it wrong by tapping in the wrong order.
 */
export const DEPTH = 2

export const canStack = (card: Pick<FgCard, 'rarity'>) => card.rarity !== 'canton'
export const stackCost = (card: FgCard, event: LockerEvent | null) => Math.ceil(eventCost(card, event) / 2)
export const stackPower = (card: FgCard, event: LockerEvent | null) => Math.ceil(eventPower(card, event) / 2)

const samePosition = (a: Pick<FgCard, 'pos'>, b: Pick<FgCard, 'pos'>) => a.pos === b.pos || (LINEMEN.has(a.pos) && LINEMEN.has(b.pos))

/** Who's stacked behind whom in a lane: one entry per card, its backup or null. */
export function pairStacks<T extends FgCard>(cards: T[], stacked: T[]): (T | null)[] {
  const out: (T | null)[] = cards.map(() => null)
  const rest: T[] = []
  for (const s of stacked) {
    const at = cards.findIndex((c, i) => !out[i] && samePosition(c, s))
    if (at >= 0) out[at] = s
    else rest.push(s)
  }
  for (const s of rest) {
    const at = out.indexOf(null)
    if (at >= 0) out[at] = s
  }
  return out
}

/** What a stacked card adds behind the card in front of it. */
export const stackAdds = (card: FgCard, host: FgCard | undefined, event: LockerEvent | null) => stackPower(card, event) + (host && samePosition(card, host) ? DEPTH : 0)

/** What one play costs. */
export function playCost(play: Play, byId: Lookup, event: LockerEvent | null): number {
  if (play.discard) return 0
  const call = callOf(play.card)
  if (call) return call.cost
  const card = byId(play.card)
  if (!card) return 0
  return play.stack ? stackCost(card, event) : eventCost(card, event)
}

export type LaneTotal = {
  total: number
  /** Power Level, added up. */
  cards: number
  /** What a position does for its lane: a QB's lift, a lineman's. */
  lifts: number
  chem: number
  stacks: number
  /** What a Transcendent, an Immortal or a Canton adds on top of its number. */
  sig: number
  /** Points from goals. */
  bonus: number
  form: number
}

/** The points in a lane that came from the cards standing in it. */
export const fromPlayers = (t: Pick<LaneTotal, 'cards' | 'lifts' | 'chem' | 'stacks' | 'sig'>) => t.cards + t.lifts + t.chem + t.stacks + t.sig

const sigOf = (card: FgCard): SigId | undefined => signatureOf(card)?.id

/** What one side's cards add up to in a lane, and where it came from. `across` is what
    a signature in another lane sends over here. */
export function laneTotal(cards: FgCard[], event: LockerEvent | null, stacked: FgCard[] = [], bonus = 0, form = 0, across = 0): LaneTotal {
  const base = cards.reduce((sum, c) => sum + eventPower(c, event), 0)
  const carriers = cards.filter((c) => !LINEMEN.has(c.pos)).length
  const linemen = cards.length - carriers
  let lifts = 0
  let sig = across
  for (const c of cards) {
    if (c.pos === 'QB') lifts += cards.length - 1
    if (LINEMEN.has(c.pos)) lifts += carriers
    const has = sigOf(c)
    if (has === 'gold-jacket') sig += GOLD_JACKET.lane * (cards.length - 1)
    else if (has === 'bell-cow') sig += 3 * linemen
    else if (has === 'road-grader') sig += carriers
    else if (has === 'the-wall') sig += 2 * carriers
    else if (has === 'seam-buster') sig += 3 * (cards.length - 1)
  }
  let chem = 0
  for (const b of chemistryFor(cards, true).bonds) {
    if (b.type === 'rivalry') chem -= 1
    else chem += b.reason.includes('real teammates') ? 3 : 2
  }
  const stacks = pairStacks(cards, stacked).reduce((sum, c, i) => sum + (c ? stackAdds(c, cards[i], event) : 0), 0)
  return { total: Math.max(0, base + lifts + chem + stacks + sig + bonus + form), cards: base, lifts, chem, stacks, sig, bonus, form }
}

const lookupAll = (ids: string[], byId: Lookup) => ids.flatMap((id) => byId(id) ?? [])

/** Every lane of one side, formations and all. The browser runs this on what you've
    placed so far, so the numbers on the table are the real ones before you commit. */
export function sideTotals(lanes: FgCard[][], stacks: FgCard[][], bonus: number[], event: LockerEvent | null): LaneTotal[] {
  const form = [0, 0, 0]
  for (const f of formationsOn(lanes)) form[f.lane] += f.n
  const across = [0, 0, 0]
  lanes.forEach((cards, i) => {
    for (const c of cards) {
      const has = sigOf(c)
      const others = ([0, 1, 2] as Lane[]).filter((l) => l !== i)
      if (has === 'gold-jacket') for (const l of others) across[l] += GOLD_JACKET.other
      else if (has === 'franchise') for (const l of others) across[l] += lanes[l].filter((x) => !LINEMEN.has(x.pos)).length
      else if (has === 'dual-threat' && i < 2) across[i === 0 ? 1 : 0] += Math.ceil(eventPower(c, event) / 3)
    }
  })
  return lanes.map((cards, i) => laneTotal(cards, event, stacks[i], bonus[i], form[i], across[i]))
}

export function laneTotals(side: Seat, byId: Lookup, event: LockerEvent | null): LaneTotal[] {
  return sideTotals(side.lanes.map((ids) => lookupAll(ids, byId)), side.stacks.map((ids) => lookupAll(ids, byId)), side.bonus, event)
}

// ============================================================
// Formations
// ============================================================

/**
 * Men in the right places lifting a lane, usually a different one from the men doing
 * it, which is what makes a lane you've given up on still worth a card: a run game
 * that isn't winning Ground can still be what wins Deep. There's nothing to play and
 * nothing to spend, so it's a thing to build toward, and it's on the table for the
 * other side to see coming.
 */
export type Formation = { id: string; title: string; line: string; lane: Lane; n: number; met: (lanes: FgCard[][]) => boolean }

const has = (lane: FgCard[], is: (c: FgCard) => boolean, n = 1) => lane.filter(is).length >= n
/** A Mismatch counts as a WR and a lineman here and in goals, on top of being a TE. */
const flex = (c: FgCard) => sigOf(c) === 'mismatch'
const isPos = (...list: PoolKey[]) => (c: FgCard) => list.includes(c.pos) || (flex(c) && list.includes('WR'))
const isLineman = (c: FgCard) => LINEMEN.has(c.pos) || flex(c)

export const FORMATIONS: Formation[] = [
  { id: 'play-action', title: 'Play Action', line: 'A RB and a lineman on Ground, and a QB in the game.', lane: 2, n: 2, met: (l) => has(l[0], isPos('RB')) && has(l[0], isLineman) && l.some((x) => has(x, isPos('QB'))) },
  { id: 'power-run', title: 'Power Run', line: 'A RB and 2 linemen on Ground.', lane: 0, n: 2, met: (l) => has(l[0], isPos('RB')) && has(l[0], isLineman, 2) },
  { id: 'spread', title: 'Spread', line: 'A QB in the game, a WR on Short and a WR on Deep.', lane: 1, n: 2, met: (l) => has(l[1], isPos('WR')) && has(l[2], isPos('WR')) && l.some((x) => has(x, isPos('QB'))) },
  { id: 'seam', title: 'Seam Route', line: 'A TE and a WR on Deep.', lane: 2, n: 2, met: (l) => has(l[2], isPos('TE')) && has(l[2], isPos('WR')) },
  { id: 'screen', title: 'Screen Game', line: 'A RB, a lineman and a QB on Short.', lane: 1, n: 2, met: (l) => has(l[1], isPos('RB')) && has(l[1], isLineman) && has(l[1], isPos('QB')) },
]

export const formationsOn = (lanes: FgCard[][]) => FORMATIONS.filter((f) => f.met(lanes))

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
    if (p.discard) {
      if (match.drive >= lastDrive(match)) return 'Nothing to draw after the last drive.'
      continue
    }
    spent += playCost(p, byId, event)
    const call = callOf(p.card)
    if (call) {
      if (call.does.kind === 'move') {
        const man = p.target ? byId(p.target) : null
        const from = side.lanes.findIndex((l) => p.target != null && l.includes(p.target))
        if (!man || from < 0) return 'Pick one of your cards already on the field.'
        if (from === p.lane || !LEGAL_LANES[man.pos].includes(p.lane)) return `${man.name} can't line up there.`
        if (side.closed === p.lane) return 'That lane is closed this drive.'
        if (side.lanes[from].length <= side.stacks[from].length) return `${man.name} has a card stacked behind.`
        lanes[from]--
        if (++lanes[p.lane] > LANE_MAX) return 'That lane is full.'
      }
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

/** Both sides' plays go down at once, then calls, arrivals and goals land on the full
    table, and each side draws for the next drive. */
export function applyDrive(match: FgMatch, plays: [Play[], Play[]], byId: Lookup, event: LockerEvent | null): FgMatch {
  const open = openGoals(match, match.drive)
  const down = plays.map((list) => list.filter((p) => !p.discard)) as [Play[], Play[]]
  const seats = match.seats.map((s, i) => {
    const side: Seat = {
      ...s,
      deck: [...s.deck],
      book: [...s.book],
      hand: [...s.hand],
      lanes: [[...s.lanes[0]], [...s.lanes[1]], [...s.lanes[2]]],
      stacks: [[...s.stacks[0]], [...s.stacks[1]], [...s.stacks[2]]],
      bonus: [...s.bonus],
      ongoing: [...s.ongoing],
      closed: null,
    }
    for (const p of plays[i]) {
      side.hand = side.hand.filter((id) => id !== p.card)
      if (!p.discard && !callOf(p.card)) (p.stack ? side.stacks : side.lanes)[p.lane].push(p.card)
    }
    return side
  }) as [Seat, Seat]

  // An Audible moves its man before anything else reads the table.
  seats.forEach((side, i) => {
    for (const p of down[i]) {
      if (callOf(p.card)?.does.kind !== 'move' || !p.target) continue
      const target = p.target
      const from = side.lanes.findIndex((l) => l.includes(target))
      if (from < 0) continue
      side.lanes[from] = side.lanes[from].filter((id) => id !== target)
      side.lanes[p.lane].push(target)
    }
  })

  const icing = [0, 0]
  const draws = [1, 1]
  const extraCalls = [0, 0]
  const met = [[...match.goalsMet[0]], [...match.goalsMet[1]]] as FgMatch['goalsMet']
  const hits: GoalHit[] = open.map(({ goal }) => ({ id: goal.id, met: [false, false] }))

  seats.forEach((side, i) => {
    const other = seats[i === 0 ? 1 : 0]
    const spent = down[i].reduce((sum, p) => sum + playCost(p, byId, event), 0)
    // The drive's own room goes first, so what's left of it is what rolls on and
    // anything that carried in has had its one drive.
    let carry = Math.max(0, roomFor(match.drive) - spent)
    let plans = 0
    const ahead = open.filter(({ goal }) => !met[i].includes(goal.id))
    // A man discarded is drawn back as a new one. A call discarded needs nothing: with
    // none in your hand, the next comes up by itself.
    draws[i] += plays[i].filter((p) => p.discard && !callOf(p.card)).length
    for (const p of down[i]) {
      const card = p.stack ? null : byId(p.card)
      const arrives = card ? sigOf(card) : undefined
      if (arrives === 'quick-release') draws[i] += 2
      else if (arrives === 'deep-threat') other.closed = p.lane
      const call = callOf(p.card)
      if (!call) continue
      const { does } = call
      if (call.ongoing) side.ongoing.push({ card: p.card, lane: p.lane })
      if (does.kind === 'draw') draws[i] += does.n
      else if (does.kind === 'ice') icing[i === 0 ? 1 : 0] += does.n
      else if (does.kind === 'close') other.closed = p.lane
      else if (does.kind === 'goal') {
        if (ahead.length) plans++
        else draws[i] += 1
      }
      else if (does.kind === 'keep') carry += Math.max(0, match.seats[i].carry - Math.max(0, spent - roomFor(match.drive)))
      else if (does.kind === 'turnover' && !walled(other, p.lane, byId)) {
        // Whoever he had stacked behind him has nobody to stand behind now.
        const gone = other.lanes[p.lane].pop()
        if (gone) other.hand.push(gone)
        if (other.stacks[p.lane].length > other.lanes[p.lane].length) other.hand.push(other.stacks[p.lane].pop() as string)
      }
    }
    // A goal met by the table beats one met by a call, so a Game Plan isn't spent on one
    // you'd have met anyway. The oldest is the one about to close.
    const check = { plays: drivePlays(down[i], byId), down: downOn(side, byId), spent }
    const natural = ahead.map(({ goal }) => goal.met(check))
    ahead.forEach(({ goal }, n) => {
      if (!natural[n] && plans === 0) return
      if (!natural[n]) plans--
      met[i].push(goal.id)
      ;(hits.find((h) => h.id === goal.id) as GoalHit).met[i] = true
      const { pay } = goal
      if (pay.kind === 'draw') draws[i] += pay.n
      else if (pay.kind === 'cap') carry += pay.n
      else if (pay.kind === 'call') extraCalls[i] += pay.n
      else if (pay.kind === 'lane') side.bonus[pay.lane] += pay.n
      else side.bonus = side.bonus.map((n) => n + pay.n) as Seat['bonus']
    })
    side.carry = carry
  })

  // Level on lanes after the sixth, tally and all, and overtime deals everyone two more.
  // This reads the table last of all: a goal or a Turnover on the sixth can settle it.
  const lastSix = match.drive === DRIVES && !match.overtime
  const preview = lastSix ? fgResult({ ...match, seats }, byId, event) : null
  const extra = !!preview && preview.score[0] === preview.score[1]

  seats.forEach((side, i) => {
    if (match.drive < DRIVES || extra) {
      side.hand.push(...side.deck.splice(0, extra ? 2 : draws[i]))
      // One call in hand at a time: the next comes up once you've run the last. Only a
      // goal puts a second one there.
      const holding = side.hand.some((id) => callOf(id))
      side.hand.push(...side.book.splice(0, (holding ? 0 : 1) + extraCalls[i]))
    }
  })
  // Iced last, once both sides' cap is known. It can take a drive's whole room, not more.
  seats.forEach((side, i) => {
    side.carry = Math.max(-roomFor(match.drive + 1), side.carry - icing[i])
  })
  const paid = hits.filter((h) => h.met[0] || h.met[1])
  return {
    ...match,
    drive: match.drive + 1,
    seats,
    last: plays,
    lastHits: paid,
    goalsMet: met,
    history: [...match.history, { drive: match.drive, plays, hits: paid }],
    ...(extra ? { overtime: true } : {}),
  }
}

export const lastDrive = (match: Pick<FgMatch, 'overtime'>) => (match.overtime ? DRIVES + 1 : DRIVES)

export const isOver = (match: FgMatch) => match.drive > lastDrive(match)

/** One line of the tally at the end: a call on the field, or a card with a signature
    that lands then, paying out in a lane. `call` is whichever it is, by id. */
export type Tally = { seat: 0 | 1; call: string; lane: Lane; on: 0 | 1; delta: number }

export type FgResult = {
  lanes: { totals: [number, number]; winner: 0 | 1 | null; stood?: 0 | 1 }[]
  score: [number, number]
  winner: 0 | 1 | null
  /** What the calls left on the field did, in the order they went down. */
  tallies: Tally[]
  /** Each lane's totals before the tally, to count up from. */
  before: [number, number][]
}

const menIn = (side: Seat, lane: Lane, byId: Lookup) => [...lookupAll(side.lanes[lane], byId), ...lookupAll(side.stacks[lane], byId)]

/** Whether a side has The Wall in a lane: nothing comes off it, and nobody leaves. */
const walled = (side: Pick<Seat, 'lanes'>, lane: Lane, byId: Lookup) => lookupAll(side.lanes[lane], byId).some((c) => sigOf(c) === 'the-wall')

/** What the calls left on the field and the signatures that land at the end will do,
    off the table as it stands. */
export function talliesOn(match: Pick<FgMatch, 'seats'>, byId: Lookup): Tally[] {
  return match.seats.flatMap((side, i) => {
    const seat = i as 0 | 1
    const foe = (i === 0 ? 1 : 0) as 0 | 1
    const against = (lane: Lane, delta: number) => (walled(match.seats[foe], lane, byId) ? 0 : delta)
    const calls = side.ongoing.flatMap((p): Tally[] => {
      const does = callOf(p.card)?.does
      if (does?.kind === 'blitz') return [{ seat, call: p.card, lane: p.lane, on: foe, delta: against(p.lane, -does.each * menIn(match.seats[foe], p.lane, byId).length) }]
      if (does?.kind === 'boost') return [{ seat, call: p.card, lane: p.lane, on: seat, delta: does.each * menIn(side, p.lane, byId).filter((c) => does.pos.includes(c.pos)).length }]
      if (does?.kind === 'stand') return [{ seat, call: p.card, lane: p.lane, on: seat, delta: 0 }]
      return []
    })
    const cards = ([0, 1, 2] as Lane[]).flatMap((lane) =>
      lookupAll(side.lanes[lane], byId)
        .filter((c) => sigOf(c) === 'double-coverage')
        .map((c): Tally => ({ seat, call: c.id, lane, on: foe, delta: against(lane, -COVERAGE * menIn(match.seats[foe], lane, byId).length) }))
    )
    return [...calls, ...cards]
  })
}

/** Two lanes of three wins it. Level on lanes, the bigger total does. The calls left
    on the field land first, then a Goal Line Stand gets its say. */
export function fgResult(match: FgMatch, byId: Lookup, event: LockerEvent | null): FgResult {
  const a = laneTotals(match.seats[0], byId, event)
  const b = laneTotals(match.seats[1], byId, event)
  const before = a.map((t, i) => [t.total, b[i].total] as [number, number])
  const tallies = talliesOn(match, byId)
  const after = before.map((t) => [...t] as [number, number])
  for (const t of tallies) after[t.lane][t.on] = Math.max(0, after[t.lane][t.on] + t.delta)
  const stands = (seat: 0 | 1, lane: number) => {
    const does = match.seats[seat].ongoing.find((p) => p.lane === lane && callOf(p.card)?.does.kind === 'stand')
    const call = does ? callOf(does.card)?.does : null
    return call?.kind === 'stand' ? call.within : -1
  }
  const lanes = after.map((totals, i) => {
    const plain = totals[0] === totals[1] ? null : ((totals[0] > totals[1] ? 0 : 1) as 0 | 1)
    const behind = plain === null ? null : ((plain === 0 ? 1 : 0) as 0 | 1)
    // Both sides standing in one lane cancel out.
    const stood = behind != null && stands(plain as 0 | 1, i) < 0 && Math.abs(totals[0] - totals[1]) <= stands(behind, i) ? behind : undefined
    return { totals, winner: stood ?? plain, ...(stood != null ? { stood } : {}) }
  })
  const score: [number, number] = [lanes.filter((l) => l.winner === 0).length, lanes.filter((l) => l.winner === 1).length]
  const sum = (side: 0 | 1) => lanes.reduce((s, l) => s + l.totals[side], 0)
  const winner = score[0] !== score[1] ? (score[0] > score[1] ? 0 : 1) : sum(0) === sum(1) ? null : sum(0) > sum(1) ? 0 : 1
  return { lanes, score, winner, tallies, before }
}

// ============================================================
// The CPU
// ============================================================

export type CpuLevelId = 'rookie' | 'pro' | 'all-pro'

/**
 * How good the CPU is. A Rookie plays what it can afford and notices the odd goal. A Pro
 * reads the table lane by lane. An All-Pro plays the way a good player does: for two
 * lanes of three, giving up the one it can't get back, setting off formations, saving
 * cap for the card it wants next and throwing away what it'll never play. None of them
 * see your hand or what you're playing.
 */
export type CpuLevel = {
  id: CpuLevelId
  label: string
  line: string
  /** How often a drive goes by without it reading the table. */
  slip: number
  /** How often it goes after an open goal. */
  goals: number
  /** How often it runs the call it's holding. */
  calls: number
  /** Whether cap left over goes behind someone. */
  stacks: boolean
  /** Whether it plans the whole table: see planPlays. */
  plans: boolean
  /** FAAB for beating it. */
  faab: number
}

export const CPU_LEVELS: Record<CpuLevelId, CpuLevel> = {
  rookie: { id: 'rookie', label: 'Rookie', line: 'Still learning. Misses goals and formations.', slip: 0.55, goals: 0.3, calls: 0.5, stacks: false, plans: false, faab: 5 },
  pro: { id: 'pro', label: 'Pro', line: 'Reads the table and goes after goals.', slip: 0.15, goals: 1, calls: 1, stacks: true, plans: false, faab: 10 },
  'all-pro': { id: 'all-pro', label: 'All-Pro', line: 'Plays to win two lanes and plans ahead.', slip: 0, goals: 1, calls: 1, stacks: true, plans: true, faab: 20 },
}

export const isCpuLevel = (v: unknown): v is CpuLevelId => typeof v === 'string' && v in CPU_LEVELS

type GoalTest = (check: GoalCheck) => boolean

/** The biggest plays a hand can afford off the cap room it has, and the biggest few
    of those that would meet a goal it's after. */
function bestHands(hand: FgCard[], room: number, event: LockerEvent | null, chasing: DriveGoal[], meets: GoalTest, already: DrivePlay[]): FgCard[][] {
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
  const lean = (card: FgCard, lane: Lane) => (LEGAL_LANES[card.pos].includes(lane) ? lane : leanLane(card, chasing))
  const hits = (h: (typeof out)[number]) =>
    LEGAL_LANES[h.cards[0].pos].some((lane) => {
      const plays = h.cards.map((card) => ({ card, lane: lean(card, lane) }))
      return meets({ plays, down: [...already, ...plays], spent: h.cost })
    })
  const meeting = chasing.length ? out.filter((h) => !top.includes(h) && hits(h)).slice(0, 3) : []
  return [...top, ...meeting].map((h) => h.cards)
}

/** The lane a man should head for if a goal wants him somewhere. */
function leanLane(card: FgCard, chasing: DriveGoal[]): Lane {
  const lanes = LEGAL_LANES[card.pos]
  return lanes.find((l) => chasing.some((g) => g.lane === l)) ?? lanes[0]
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
 * the lane where it changes the most, giving up on a lane it can't get back. On a slip
 * it takes whichever good hand comes to mind, a card goes wherever there's room, and it
 * forgets the goals and its calls.
 */
export function cpuPlays(match: FgMatch, at: 0 | 1, byId: Lookup, event: LockerEvent | null, rnd: () => number, level: CpuLevel = CPU_LEVELS.pro): Play[] {
  if (level.plans) return planPlays(match, at, byId, event, rnd)
  const mine = match.seats[at]
  const theirs = match.seats[at === 0 ? 1 : 0]
  const hand = lookupAll(mine.hand, byId)
  const room = capFor(match, at)
  const late = Math.min(1, (match.drive - 1) / (DRIVES - 1))
  // The calls left on the field count as if they'd already landed: the CPU can read
  // a Blitz on its lane as well as you can.
  const seen = talliesOn(match, byId)
  const reading = (at0: 0 | 1, side: Seat) => laneTotals(side, byId, event).map((t, l) => t.total + seen.filter((x) => x.on === at0 && x.lane === l).reduce((sum, x) => sum + x.delta, 0))
  const foe = reading(at === 0 ? 1 : 0, theirs)
  const ours = reading(at, mine)
  const offDay = rnd() < level.slip
  const chasing = !offDay && rnd() < level.goals ? openGoals(match, match.drive).filter(({ goal }) => !match.goalsMet[at].includes(goal.id)).map(({ goal }) => goal) : []
  const meets: GoalTest = (check) => chasing.some((g) => g.met(check))
  const already = downOn(mine, byId)
  const closeness = (gap: number) => 1 - Math.min(1, Math.abs(gap) / (10 + 14 * (1 - late)))

  /** The lane a call does the most in, and what that's worth. */
  const callPlay = (id: string): { lane: Lane; worth: number } | null => {
    const call = callOf(id)
    if (!call || call.cost > room) return null
    const drawing = match.drive < lastDrive(match)
    const { does } = call
    const swing = (points: (l: Lane) => number): { lane: Lane; worth: number } =>
      ([0, 1, 2] as Lane[]).map((lane) => ({ lane, worth: points(lane) * (0.6 + closeness(ours[lane] - foe[lane])) })).sort((a, b) => b.worth - a.worth)[0]
    const used = (lane: Lane, kind: string) => mine.ongoing.some((p) => p.lane === lane && callOf(p.card)?.does.kind === kind)
    if (does.kind === 'draw') return drawing ? { lane: 0, worth: 5 * (1 - late) + 1 } : null
    if (does.kind === 'ice') return drawing ? { lane: 0, worth: 3 + 2 * late } : null
    // Ongoing calls are worth what's there now and what's likely to join it.
    if (does.kind === 'blitz') return swing((l) => (used(l, 'blitz') ? 0 : does.each * (theirs.lanes[l].length + (1 - late) * 1.5)))
    if (does.kind === 'boost') {
      return swing((l) => (used(l, 'boost') ? 0 : does.each * (menIn(mine, l, byId).filter((c) => does.pos.includes(c.pos)).length + hand.filter((c) => does.pos.includes(c.pos)).length * 0.5 * (1 - late))))
    }
    if (does.kind === 'stand') return late > 0.5 ? swing((l) => (used(l, 'stand') ? 0 : 4)) : null
    if (does.kind === 'goal') return { lane: 0, worth: chasing[0] ? payWorth(chasing[0].pay, match.drive) : 3 * (1 - late) + 1 }
    if (does.kind === 'close') return drawing ? swing(() => 3 + 2 * late) : null
    if (does.kind === 'turnover') return swing((l) => {
      const last = theirs.lanes[l][theirs.lanes[l].length - 1]
      const man = last ? byId(last) : null
      return man ? eventPower(man, event) + eventCost(man, event) : 0
    })
    return null
  }

  const options = offDay || rnd() >= level.calls ? [null] : [null, ...mine.hand.filter((id) => callPlay(id)?.worth)]
  let best: { plays: Play[]; value: number; left: number } | null = null
  for (const id of options) {
    const call = id ? callOf(id) : null
    const aim = id ? callPlay(id) : null
    const left = room - (call?.cost ?? 0)
    const hands = bestHands(hand, left, event, chasing, meets, already)
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
            const wanted = meets({ plays: trial, down: [...already, ...trial], spent: 0 }) ? 5 : chasing.some((g) => g.lane === lane) ? 2 : 0
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
      for (const g of chasing) if (g.met({ plays: placed, down: [...already, ...placed], spent })) value += payWorth(g.pay, match.drive)
      if (!best || value > best.value) best = { plays, value, left: room - spent }
    }
  }
  if (!best) return []

  // Room left over goes behind someone: anyone on the last drive, and only the cheap
  // before that, since a stacked card's other half is gone for good. Behind its own
  // position first, which is worth the most.
  const out = [...best.plays]
  let left = best.left
  if (!offDay && level.stacks) {
    const down = new Set(out.map((p) => p.card))
    const lanesNow = mine.lanes.map((ids, l) => [...lookupAll(ids, byId), ...lookupAll(out.filter((p) => p.lane === l && !p.stack && !callOf(p.card)).map((p) => p.card), byId)])
    const stacksNow = mine.stacks.map((ids) => lookupAll(ids, byId))
    const last = match.drive >= lastDrive(match)
    const rest = hand.filter((c) => !down.has(c.id) && canStack(c) && (last || c.rarity === 'common' || c.rarity === 'rare'))
    for (const c of rest.sort((a, b) => stackPower(b, event) - stackPower(a, event))) {
      const cost = stackCost(c, event)
      if (cost > left) continue
      const free = LEGAL_LANES[c.pos].filter((l) => l !== mine.closed && lanesNow[l].length > stacksNow[l].length)
      const depth = (l: Lane) => pairStacks(lanesNow[l], [...stacksNow[l], c]).some((s, i) => s === c && samePosition(c, lanesNow[l][i]))
      const lane = free.sort((a, b) => Number(depth(b)) - Number(depth(a)) || closeness(ours[b] - foe[b]) - closeness(ours[a] - foe[a]))[0]
      if (lane == null) continue
      out.push({ card: c.id, lane, stack: true })
      stacksNow[lane].push(c)
      left -= cost
    }
  }
  return out
}

/** The chance of taking at least two of three, off the chance of taking each. */
const twoOfThree = ([a, b, c]: number[]) => a * b + a * c + b * c - 2 * a * b * c

/** The most Power Level a hand can put down on a given amount of cap. */
function bestSpend(hand: FgCard[], cap: number, event: LockerEvent | null): { worth: number; keep: FgCard[] } {
  let worth = 0
  let keep: FgCard[] = []
  const n = Math.min(hand.length, 10)
  for (let mask = 1; mask < 1 << n; mask++) {
    let cost = 0
    let sum = 0
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue
      cost += eventCost(hand[i], event)
      sum += eventPower(hand[i], event)
    }
    if (cost <= cap && sum > worth) {
      worth = sum
      keep = hand.filter((_, i) => mask & (1 << i))
    }
  }
  return { worth, keep }
}

/** What an All-Pro thinks a card or a point of cap next drive is worth, as a share of
    the game. */
const TEMPO = { card: 0.028, cap: 0.016, close: 0.03, ahead: 0.32 }

/** Hands an All-Pro looks at closely. */
const PLAN_HANDS = 14

/**
 * An All-Pro's call. Everything it can afford gets laid out on the real table and rated
 * as the chance of taking two lanes of three, which is what makes it good: a point in a
 * lane that's close is worth far more than a point in one that's won, and a lane that's
 * gone isn't worth a card. How much a gap is worth shrinks as the game runs out, so it
 * builds early and goes for the throat late. It sees only the table, the same as you.
 */
function planPlays(match: FgMatch, at: 0 | 1, byId: Lookup, event: LockerEvent | null, rnd: () => number): Play[] {
  const them = (at === 0 ? 1 : 0) as 0 | 1
  const mine = match.seats[at]
  const theirs = match.seats[them]
  const room = capFor(match, at)
  const after = lastDrive(match) - match.drive
  const swing = 3.5 + 4.5 * after
  const seen = talliesOn(match, byId)
  const tally = (seat: 0 | 1, lane: number) => seen.filter((x) => x.on === seat && x.lane === lane).reduce((sum, x) => sum + x.delta, 0)
  const foeNow = laneTotals(theirs, byId, event).map((t, l) => t.total + tally(them, l))
  const open = openGoals(match, match.drive).filter(({ goal }) => !match.goalsMet[at].includes(goal.id))
  const men = lookupAll(mine.hand, byId)
  const start = mine.lanes.map((ids) => lookupAll(ids, byId))
  const behind = mine.stacks.map((ids) => lookupAll(ids, byId))
  const already = downOn(mine, byId)
  const nextCap = roomFor(match.drive + 1)
  const card = after > 0 ? TEMPO.card : 0
  const cap = after > 0 ? TEMPO.cap : 0

  type Aim = { id: string; lane: Lane }

  /** How a set of plays leaves the game. */
  const rate = (placed: DrivePlay[], aim: Aim | null): number => {
    const lanes = start.map((l) => [...l])
    const stacks = behind.map((l) => [...l])
    for (const p of placed) (p.stack ? stacks : lanes)[p.lane].push(p.card)
    const bonus = [...mine.bonus]
    const edge = [0, 0, 0]
    let tempo = 0
    let plans = 0
    const call = aim ? callOf(aim.id) : null
    const spent = placed.reduce((sum, p) => sum + (p.stack ? stackCost(p.card, event) : eventCost(p.card, event)), 0) + (call?.cost ?? 0)
    if (call && aim) {
      const { does } = call
      const l = aim.lane
      if (does.kind === 'draw') tempo += card * does.n
      else if (does.kind === 'ice') tempo += cap * Math.min(does.n, nextCap)
      else if (does.kind === 'goal') {
        if (open.length) plans = 1
        else tempo += card
      } else if (does.kind === 'close') tempo += after > 0 ? TEMPO.close : 0
      else if (does.kind === 'blitz') edge[l] += walled(theirs, l, byId) ? 0 : does.each * (theirs.lanes[l].length + theirs.stacks[l].length + after * 0.6)
      else if (does.kind === 'boost') edge[l] += does.each * ([...lanes[l], ...stacks[l]].filter((c) => does.pos.includes(c.pos)).length + after * 0.4)
      else if (does.kind === 'stand') edge[l] += does.within
      else if (does.kind === 'turnover' && !walled(theirs, l, byId)) {
        const out = byId(theirs.lanes[l][theirs.lanes[l].length - 1] ?? '')
        if (out) edge[l] += eventPower(out, event) + 2
      }
    }
    const check = { plays: placed, down: [...already, ...placed], spent }
    for (const { goal } of open) {
      const natural = goal.met(check)
      if (!natural && plans === 0) continue
      if (!natural) plans--
      const { pay } = goal
      if (pay.kind === 'lane') bonus[pay.lane] += pay.n
      else if (pay.kind === 'every') for (let l = 0; l < 3; l++) bonus[l] += pay.n
      else if (pay.kind === 'cap') tempo += cap * pay.n
      else tempo += card * pay.n
    }
    for (const p of placed) {
      if (p.stack) continue
      const has = sigOf(p.card)
      if (has === 'quick-release') tempo += card * 2
      else if (has === 'deep-threat' && after > 0) tempo += TEMPO.close
    }
    const totals = sideTotals(lanes, stacks, bonus, event)
    const chance = totals.map((t, l) => 1 / (1 + Math.exp(-(t.total + tally(at, l) + edge[l] - foeNow[l]) / swing)))
    // What's left to play next drive counts, so it'll hold a card back for a bigger one
    // when the cap to do it is there.
    const used = new Set(placed.map((p) => p.card.id))
    const carry = Math.max(0, roomFor(match.drive) - spent)
    const next = after > 0 ? bestSpend(men.filter((c) => !used.has(c.id)), nextCap + carry, event).worth : 0
    return twoOfThree(chance) + tempo + (TEMPO.ahead * next) / (4 * swing)
  }

  const legal = (c: FgCard, lanes: FgCard[][]) => LEGAL_LANES[c.pos].filter((l) => l !== mine.closed && lanes[l].length < LANE_MAX)

  /** Lays a hand out, the strongest man first, each in the lane that rates best. */
  const layOut = (cards: FgCard[], aim: Aim | null): { placed: DrivePlay[]; value: number } => {
    const placed: DrivePlay[] = []
    const lanes = start.map((l) => [...l])
    for (const c of [...cards].sort((x, y) => eventPower(y, event) - eventPower(x, event))) {
      let pick: { lane: Lane; value: number } | null = null
      for (const lane of legal(c, lanes)) {
        const value = rate([...placed, { card: c, lane }], aim)
        if (!pick || value > pick.value) pick = { lane, value }
      }
      if (!pick) continue
      placed.push({ card: c, lane: pick.lane })
      lanes[pick.lane].push(c)
    }
    return { placed, value: rate(placed, aim) }
  }

  const aims: (Aim | null)[] = [null]
  for (const id of mine.hand) {
    const call = callOf(id)
    if (!call || call.cost > room) continue
    if (call.does.kind === 'move' || call.does.kind === 'keep') continue
    if (after === 0 && ['draw', 'ice', 'close'].includes(call.does.kind)) continue
    if (call.aim) for (const lane of [0, 1, 2] as Lane[]) aims.push({ id, lane })
    else aims.push({ id, lane: 0 })
  }

  let best: { placed: DrivePlay[]; aim: Aim | null; value: number } = { placed: [], aim: null, value: -Infinity }
  for (const aim of aims) {
    const left = room - (aim ? (callOf(aim.id)?.cost ?? 0) : 0)
    const hands = [[] as FgCard[], ...bestHands(men, left, event, open.map((o) => o.goal), (c) => open.some((o) => o.goal.met(c)), already).slice(0, PLAN_HANDS)]
    for (const cards of hands) {
      const { placed, value } = layOut(cards, aim)
      const shaded = value + rnd() * 0.004
      if (shaded > best.value) best = { placed, aim, value: shaded }
    }
  }

  // Anything left goes behind someone, if that's worth more than keeping it.
  const stacked: DrivePlay[] = [...best.placed]
  const spentOn = () => stacked.reduce((sum, p) => sum + (p.stack ? stackCost(p.card, event) : eventCost(p.card, event)), 0) + (best.aim ? (callOf(best.aim.id)?.cost ?? 0) : 0)
  let value = rate(stacked, best.aim)
  for (const c of [...men].sort((a, b) => stackPower(b, event) - stackPower(a, event))) {
    if (!canStack(c) || stacked.some((p) => p.card.id === c.id) || stackCost(c, event) > room - spentOn()) continue
    let pick: { lane: Lane; value: number } | null = null
    for (const lane of LEGAL_LANES[c.pos]) {
      if (lane === mine.closed) continue
      const hosts = start[lane].length + stacked.filter((p) => !p.stack && p.lane === lane).length
      if (hosts <= behind[lane].length + stacked.filter((p) => p.stack && p.lane === lane).length) continue
      const trial = rate([...stacked, { card: c, lane, stack: true }], best.aim)
      if (trial > value && (!pick || trial > pick.value)) pick = { lane, value: trial }
    }
    if (pick) {
      stacked.push({ card: c, lane: pick.lane, stack: true })
      value = pick.value
    }
  }

  const plays: Play[] = [
    ...(best.aim ? [{ card: best.aim.id, lane: best.aim.lane }] : []),
    ...stacked.map((p): Play => ({ card: p.card.id, lane: p.lane, ...(p.stack ? { stack: true } : {}) })),
  ]

  // What it'll never get to play goes, for a look at something it might. It can't draw
  // more than the deck holds, and on the last drive there's nothing to draw.
  if (after > 0 && mine.deck.length) {
    const used = new Set(stacked.map((p) => p.card.id))
    const rest = men.filter((c) => !used.has(c.id))
    const comes = Array.from({ length: after }, (_, i) => roomFor(match.drive + 1 + i)).reduce((a, b) => a + b, 0)
    const { keep } = bestSpend(rest, comes, event)
    const spare = rest.filter((c) => !keep.includes(c)).sort((a, b) => eventPower(a, event) - eventPower(b, event))
    for (const c of spare.slice(0, mine.deck.length)) plays.push({ card: c.id, lane: 0, discard: true })
  }
  return plays
}

// ============================================================
// Goals
// ============================================================

/** A card that went down this drive. */
export type DrivePlay = { card: FgCard; lane: Lane; stack?: boolean }

export const drivePlays = (plays: Play[], byId: Lookup): DrivePlay[] =>
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
  /** A play call on top of whatever you're holding: the one way to hold two. */
  | { kind: 'call'; n: number }

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
const pos = isPos
const LINEMAN: Is = isLineman
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
 * down two drives ago counts, but only what's open is ever on show: a table that's
 * balanced is ready for whatever lands, one that isn't has two drives to scramble. A
 * goal for two men from one conference or one decade is what a themed deck is built to
 * hit. Stacked men count for all of them, which can meet a two-man goal on a drive with
 * room for only one.
 *
 * The points are what make a goal worth chasing. At +3 a lane, a bot that went after
 * goals won no more than one that ignored them; at +5, about half a typical lane's
 * margin, chasing them was worth 4 points of win rate.
 */
export const DRIVE_GOALS: DriveGoal[] = [
  { id: 'hurry-up', title: 'Hurry Up', line: 'Play 2 cards.', pay: { kind: 'cap', n: 1 }, from: 2, to: 3, met: ({ plays }) => plays.length >= 2 },
  { id: 'burn-clock', title: 'Burn The Clock', line: 'Spend 1 cap or less.', pay: { kind: 'draw', n: 1 }, from: 2, to: 4, met: ({ spent }) => spent <= 1 },
  { id: 'establish-run', title: 'Establish The Run', line: 'Play a RB on Ground.', pay: { kind: 'draw', n: 1 }, from: 2, to: 3, lane: 0, met: onLane(0, pos('RB')) },
  { id: 'stretch-field', title: 'Stretch The Field', line: 'Play a WR on Deep.', pay: { kind: 'call', n: 1 }, from: 2, to: 3, lane: 2, met: onLane(2, pos('WR')) },
  { id: 'check-down', title: 'Check Down', line: 'Play a RB or TE on Short.', pay: { kind: 'cap', n: 1 }, from: 2, to: 4, lane: 1, met: onLane(1, pos('RB', 'TE')) },
  { id: 'same-sideline', title: 'Same Sideline', line: 'Play 2 cards from one conference.', pay: { kind: 'cap', n: 2 }, from: 3, to: 5, met: ({ plays }) => share(plays, (c) => TEAM_DIVISION[c.team]?.slice(0, 3), 2) },
  { id: 'same-decade', title: 'Same Decade', line: 'Play 2 cards from one decade.', pay: { kind: 'call', n: 1 }, from: 3, to: 5, met: ({ plays }) => share(plays, (c) => (c.year == null ? undefined : Math.floor(c.year / 10)), 2) },
  { id: 'play-action', title: 'Play Action', line: 'Get a QB and a RB in one lane.', pay: { kind: 'lane', lane: 1, n: 5 }, from: 3, to: 5, met: together(pos('QB'), pos('RB')) },
  { id: 'run-block', title: 'Run Block', line: 'Get a lineman and a RB in one lane.', pay: { kind: 'lane', lane: 0, n: 5 }, from: 3, to: 5, met: together(LINEMAN, pos('RB')) },
  { id: 'pass-pro', title: 'Pass Protection', line: 'Get a lineman and a QB in one lane.', pay: { kind: 'lane', lane: 2, n: 5 }, from: 3, to: 5, met: together(LINEMAN, pos('QB')) },
  { id: 'quick-slant', title: 'Quick Slant', line: 'Get a lineman and a WR in one lane.', pay: { kind: 'lane', lane: 1, n: 5 }, from: 3, to: 5, met: together(LINEMAN, pos('WR')) },
  { id: 'heavy-set', title: 'Heavy Set', line: 'Get a TE and a lineman in one lane.', pay: { kind: 'lane', lane: 0, n: 5 }, from: 3, to: 5, met: together(pos('TE'), LINEMAN) },
  { id: 'twins', title: 'Twins Right', line: 'Get 2 WRs in one lane.', pay: { kind: 'lane', lane: 2, n: 5 }, from: 3, to: 5, met: ({ down }) => ([0, 1, 2] as Lane[]).some((l) => down.filter((p) => p.lane === l && isPos('WR')(p.card)).length >= 2) },
  { id: 'four-verts', title: 'Four Verticals', line: 'Get 3 cards on Deep.', pay: { kind: 'lane', lane: 2, n: 6 }, from: 5, to: 6, lane: 2, met: filled(2) },
  { id: 'goal-line', title: 'Goal Line', line: 'Get 3 cards on Ground.', pay: { kind: 'lane', lane: 0, n: 6 }, from: 5, to: 6, lane: 0, met: filled(0) },
  { id: 'red-zone', title: 'Red Zone', line: 'Get 3 cards on Short.', pay: { kind: 'lane', lane: 1, n: 6 }, from: 5, to: 6, lane: 1, met: filled(1) },
  { id: 'two-minute', title: 'Two Minute Drill', line: 'Play 2 cards.', pay: { kind: 'every', n: 2 }, from: 5, to: 6, met: ({ plays }) => plays.length >= 2 },
]

const GOALS_BY_ID = new Map(DRIVE_GOALS.map((g) => [g.id, g]))

export const driveGoal = (id: string | null | undefined): DriveGoal | null => (id ? GOALS_BY_ID.get(id) ?? null : null)

export const goalOn = (match: Pick<FgMatch, 'goals'>, drive: number): DriveGoal | null => driveGoal(match.goals[drive - 1])

/** How long a goal stays open: the drive it lands on and the one after. */
export const GOAL_DRIVES = 2

export type OpenGoal = { goal: DriveGoal; /** Drives left on it, this one included. */ left: number }

/** The goals open on a drive, the one about to close first. Two can overlap. */
export function openGoals(match: Pick<FgMatch, 'goals' | 'overtime'>, drive: number): OpenGoal[] {
  const last = lastDrive(match)
  const out: OpenGoal[] = []
  for (let d = Math.max(1, drive - GOAL_DRIVES + 1); d <= drive; d++) {
    const goal = goalOn(match, d)
    if (goal) out.push({ goal, left: Math.min(d + GOAL_DRIVES - 1, last) - drive + 1 })
  }
  return out
}

/** How many goals a game has, at the least. It's this or one more. */
const GOALS_A_GAME = 3

/** Goals land on three or four of the last five drives, and never the same one twice.
    Nobody knows which drive has the next one until it lands. */
function dealGoals(rnd: () => number): (string | null)[] {
  const used = new Set<string>()
  const drives = shuffled([2, 3, 4, 5, 6], rnd).slice(0, GOALS_A_GAME + (rnd() < 0.5 ? 1 : 0))
  return Array.from({ length: DRIVES }, (_, i) => {
    if (!drives.includes(i + 1)) return null
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
  if (pay.kind === 'call') return 'Draw A Play Call'
  return `+${pay.n} Cap Next Drive`
}
