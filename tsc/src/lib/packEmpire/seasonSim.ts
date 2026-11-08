// The Season sim (League Mode's Season variation): an eleven against a defense,
// eleven drives played out snap by snap, a score and a box score. Pure and seeded:
// the server, the pages (the scouting report's projections) and
// scripts/pack-empire-pool/sim/season-sim.ts all run this same code, and a game
// re-run off its seed comes out the same, so a refresh never re-rolls one.
//
// How a game goes:
//  1. Every card puts its value (score plus its share of the team's chemistry)
//     into five lanes by its archetype (archetypes.ts). A defense's counters scale
//     the cards it's built to stop or that beat it.
//  2. The line's protection against the front's pass rush sets the pocket: a
//     collapsing pocket costs the deep game most and the short game a little.
//  3. Each lane's total over a typical Season roster's (REF), times what the front
//     gives up there, is that lane's efficiency.
//  4. The game plan (seasonRules GAME_PLANS) leans the play calling one way and
//     rolls once: it clicks and that lane takes off, or it doesn't and you've
//     leaned into a wall. How often it clicks is how many of your starters fit it
//     and whether this defense gives that lane up.
//  5. Each of the eleven drives turns over, stalls, or reaches scoring range off
//     that, and the red zone decides seven or three. That's the score, and it's
//     what the projections quote.
//  6. Then each drive is played out snap by snap (drivePlays): runs, short throws,
//     shots, sacks, the punt or the kick, every one called off the same lanes and
//     ending the way the drive was always going to end. The box score is those
//     snaps added up, and the pages can replay them.
//
// Rarity is still the size of everything: a better card is more of every lane it
// plays. The archetype decides where it lands, which is why the same two rosters
// can swap places from one front to the next.

import type { Archetype, ArchetypeTag, Lane } from './archetypes'
import { rngFor, type Defense } from './defenses'
import { RARITIES, type PoolKey, type Rarity } from './rules'
import type { GamePlan } from './seasonRules'

export type SimCard = {
  id: string
  name: string
  pos: PoolKey
  rarity: Rarity
  /** Index into SLOTS. */
  slot: number
  /** The card's score plus its half of every chemistry bond it's in. */
  value: number
  arch: Archetype
  /** From its real season: yards a catch and a carry. */
  ypr?: number
  ypc?: number
}

export type TeamLanes = Record<Lane, number>

/** A typical Season roster's lane totals: the median of season-sim.ts's drafted
    rosters (Draft Day's packs, the biggest card in each, hard chemistry). */
export const REF: TeamLanes = { run: 5290, short: 3780, deep: 2550, redZone: 1850, protect: 4200 }

export const DRIVES = 11

/** How hard the play calling leans into what's working on its own, before any
    game plan: 0 never adjusts, 1 is proportional. */
const LEAN = 0.35
const BASE_MIX = { run: 0.42, short: 0.38, deep: 0.2 }

// A typical offense reaches scoring range on 44% of drives and turns 54% of
// red-zone trips into touchdowns, about 23 points: an NFL average. The slopes are
// shallow on purpose (Joey, 2026-11-07: his team averaged 43 and the NFL's best
// barely clear 30). Each step up in talent buys less than the last, so a stacked
// roster lands in the low thirties and only a monster day reaches 40.
const REACH = { at: -0.65, slope: 1.0 }
const FINISH = { at: 0.15, slope: 0.8 }
const FG = 0.86
const TURNOVER = 0.1

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/** How much of a front's counter reaches a card, by rarity. Better players adapt
    (Joey): a front built to stop deep threats takes a common one out of the game
    and only slows an Immortal, so a matchup decides between cards that are close,
    never a common over a dynasty. */
export const ADAPT: Record<Rarity, number> = { common: 1, rare: 0.9, dynasty: 0.75, transcendent: 0.6, immortal: 0.5, canton: 0.4 }

export function counterFor(d: Defense | null, c: Pick<SimCard, 'arch' | 'rarity'>): number {
  const raw = d?.counters[c.arch.tag] ?? 1
  return 1 + (raw - 1) * ADAPT[c.rarity]
}

/** The rarity rungs between two cards, for the bench rule below. */
const rung = (r: Rarity) => RARITIES.indexOf(r)
const CLOSE = 0.85

/** Lane totals for an eleven, with a front's counters applied if one's given. */
export function laneTotals(cards: SimCard[], d: Defense | null = null): TeamLanes {
  const out: TeamLanes = { run: 0, short: 0, deep: 0, redZone: 0, protect: 0 }
  for (const c of cards) {
    const v = c.value * counterFor(d, c)
    for (const k of Object.keys(out) as Lane[]) out[k] += v * c.arch.lanes[k]
  }
  return out
}

// ============================================================
// Game plans
// ============================================================

type Focus = Exclude<GamePlan, 'balanced'>
type PlayLane = 'run' | 'short' | 'deep' | 'redZone'

const FOCUS_LANE: Record<Focus, PlayLane> = { ground: 'run', quick: 'short', air: 'deep', finish: 'redZone' }

/** How each plan leans the play calling. Committed either way: a plan that
    doesn't click still calls its plays. */
const TILT: Record<GamePlan, { run: number; short: number; deep: number }> = {
  balanced: { run: 1, short: 1, deep: 1 },
  ground: { run: 1.65, short: 0.8, deep: 0.55 },
  quick: { run: 0.75, short: 2, deep: 0.5 },
  air: { run: 0.6, short: 0.8, deep: 3.4 },
  finish: { run: 1.1, short: 1, deep: 0.8 },
}

/** Turnovers by plan: shots downfield get picked, handing it off doesn't. */
const RISK: Record<GamePlan, number> = { balanced: 1, ground: 0.8, quick: 0.85, air: 1.3, finish: 1 }

/**
 * The starters a plan is built on, by archetype, and how much each counts. A
 * plan with most of these clicks most of the time; one with none of them is a
 * guess (Joey: "if u dont have enough players in that strategie it wont work").
 */
const FITS: Record<Focus, Partial<Record<ArchetypeTag, number>>> = {
  ground: { 'Bell Cow': 2, 'Goal Line Back': 1.2, 'Dual Threat': 1, 'Blocking TE': 1, 'Road Grader': 0.6, Anchor: 0.3 },
  quick: { Surgeon: 2, 'Receiving Back': 1.5, Possession: 1, 'Safety Valve': 1, 'Pass Protector': 0.5, Anchor: 0.5 },
  air: { Gunslinger: 2, 'Deep Threat': 1.3, 'Seam Stretcher': 1, 'Pass Protector': 0.8 },
  finish: { 'Goal Line Back': 2, 'Red Zone Target': 1.5, 'Dual Threat': 1.2, 'Seam Stretcher': 0.8, 'Road Grader': 0.4, Anchor: 0.3 },
}

/** The kinds of player a plan is built on. */
export function planTags(plan: GamePlan): ArchetypeTag[] {
  return plan === 'balanced' ? [] : (Object.keys(FITS[plan]) as ArchetypeTag[])
}

const GROUP: Record<PoolKey, string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OT: 'OL', OG: 'OL', C: 'OL' }

/** The most a starter at each spot can add to a plan: its position's best fit. */
function ceilingFor(plan: Focus, pos: PoolKey): number {
  const tags: Record<string, ArchetypeTag[]> = {
    QB: ['Gunslinger', 'Surgeon', 'Dual Threat'],
    RB: ['Bell Cow', 'Receiving Back', 'Goal Line Back'],
    WR: ['Deep Threat', 'Possession', 'Red Zone Target'],
    TE: ['Seam Stretcher', 'Safety Valve', 'Blocking TE'],
    OL: ['Road Grader', 'Pass Protector', 'Anchor'],
  }
  return Math.max(0, ...tags[GROUP[pos]].map((t) => FITS[plan][t] ?? 0))
}

/** A typical starter's value: a fitting star counts a little more than a fitting common. */
const CARD_REF = 1700

export type PlanFit = { fit: number; fitters: string[] }

/** How well an eleven fits a plan, 0 to 1, and the men who fit it. */
export function planFit(cards: SimCard[], plan: GamePlan): PlanFit {
  if (plan === 'balanced') return { fit: 1, fitters: [] }
  let got = 0
  let most = 0
  const fitters: string[] = []
  for (const c of cards) {
    most += ceilingFor(plan, c.pos)
    const w = FITS[plan][c.arch.tag] ?? 0
    if (w > 0) {
      got += w * clamp(Math.sqrt(c.value / CARD_REF), 0.75, 1.3)
      fitters.push(c.id)
    }
  }
  return { fit: most > 0 ? clamp(got / most, 0, 1) : 0, fitters }
}

/** How often a plan clicks: the fit, then whether this defense gives that lane up. */
export function clickChance(fit: number, d: Defense, plan: GamePlan): number {
  if (plan === 'balanced') return 1
  const lane = d.lanes[FOCUS_LANE[plan]]
  return clamp(0.1 + 0.75 * fit + 2 * (lane - 1), 0.05, 0.92)
}

/** What a plan does to its lane when it clicks, and when it doesn't. */
// Sized off sim/season-sim.ts so the calls carry a season (Joey: a manager should
// flip four or so games): the best call every week plus subs wins about 4.3 of 8,
// always Balanced about 2.1, the worst call every week about 1.1. A plan the
// defense is built for fails more often than not, whatever the fit.
const CLICK = { base: 1.4, perFit: 1.2 }
const MISS = 0.3
/** Finishing drives works on the red zone alone, so it swings harder there. */
const FINISH_SWING = 3
const FINISH_MISS = 0.7

export type Matchup = {
  /** Each lane against this front: 1 is a typical offense against the base defense. */
  eff: { run: number; short: number; deep: number; redZone: number }
  /** The pocket: protection against the rush, 1 typical. */
  pocket: number
  /** How the plays split: run, short, deep. */
  mix: { run: number; short: number; deep: number }
  /** The whole offense's efficiency on a drive. */
  drive: number
  turnover: number
  reach: number
  finish: number
  /** Expected points: the projection the scouting report quotes. */
  expected: number
}

/**
 * An eleven against a front. `clicked` is the plan's roll: true, false, or null
 * for the plan not counted at all (Balanced always plays as null).
 */
export function matchup(cards: SimCard[], d: Defense, plan: GamePlan = 'balanced', clicked: boolean | null = null): Matchup {
  const raw = laneTotals(cards, d)
  const pocket = clamp((raw.protect * d.rush) / REF.protect, 0.55, 1.25)
  const eff = {
    run: (raw.run / REF.run) * d.lanes.run,
    short: (raw.short / REF.short) * d.lanes.short * pocket ** 0.4,
    deep: (raw.deep / REF.deep) * d.lanes.deep * pocket,
    redZone: (raw.redZone / REF.redZone) * d.lanes.redZone,
  }
  if (plan !== 'balanced' && clicked != null) {
    const { fit } = planFit(cards, plan)
    const lift = clicked ? CLICK.base + CLICK.perFit * fit : MISS
    eff[FOCUS_LANE[plan]] *= plan !== 'finish' ? lift : clicked ? 1 + (lift - 1) * FINISH_SWING : FINISH_MISS
  }
  const t = TILT[plan]
  const w = {
    run: BASE_MIX.run * t.run * eff.run ** LEAN,
    short: BASE_MIX.short * t.short * eff.short ** LEAN,
    deep: BASE_MIX.deep * t.deep * eff.deep ** LEAN,
  }
  const sum = w.run + w.short + w.deep
  const mix = { run: w.run / sum, short: w.short / sum, deep: w.deep / sum }
  const drive = mix.run * eff.run + mix.short * eff.short + mix.deep * eff.deep
  const qb = cards.find((c) => c.pos === 'QB')
  const turnover = clamp((TURNOVER * RISK[plan] * Math.sqrt(qb?.arch.giveaway ?? 1) * d.takeaways) / Math.sqrt(pocket * drive), 0.03, 0.25)
  const reach = sigmoid(REACH.at + REACH.slope * Math.log(Math.max(drive, 0.05)))
  const finish = sigmoid(FINISH.at + FINISH.slope * Math.log(Math.max(eff.redZone, 0.05)))
  const expected = DRIVES * (1 - turnover) * reach * (finish * 7 + (1 - finish) * FG * 3)
  return { eff, pocket, mix, drive, turnover, reach, finish, expected }
}

/** A plan read for the scouting report: how it fits, how often it clicks, and
    what it projects to either way. */
export type PlanRead = {
  plan: GamePlan
  fit: number
  fitters: string[]
  chance: number
  clicks: number
  misses: number
  expected: number
  /** Chance to clear the line (or, in the playoffs, a stand-in of 24). */
  win: number
}

/** A game's spread around its projection: about eight points at an average score. */
const spreadAt = (points: number) => 4.5 + 0.17 * points

const normalCdf = (z: number) => {
  // Abramowitz and Stegun 7.1.26, plenty for a win chance.
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp((-z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/** Beating the line: more than it, with a tie a coin flip in overtime. */
const beat = (points: number, line: number) => 1 - normalCdf((line - points) / spreadAt(points))

export function readPlan(cards: SimCard[], d: Defense, plan: GamePlan, line: number | null): PlanRead {
  const target = line ?? 24
  if (plan === 'balanced') {
    const e = matchup(cards, d).expected
    return { plan, fit: 1, fitters: [], chance: 1, clicks: e, misses: e, expected: e, win: beat(e, target) }
  }
  const { fit, fitters } = planFit(cards, plan)
  const chance = clickChance(fit, d, plan)
  const clicks = matchup(cards, d, plan, true).expected
  const misses = matchup(cards, d, plan, false).expected
  return { plan, fit, fitters, chance, clicks, misses, expected: chance * clicks + (1 - chance) * misses, win: chance * beat(clicks, target) + (1 - chance) * beat(misses, target) }
}

const PLANS: GamePlan[] = ['balanced', 'ground', 'quick', 'air', 'finish']

export function readPlans(cards: SimCard[], d: Defense, line: number | null): PlanRead[] {
  return PLANS.map((p) => readPlan(cards, d, p, line))
}

/** The call a smart coach makes: the best chance to clear the line, or in the
    playoffs the most points. */
export function bestPlan(cards: SimCard[], d: Defense, line: number | null): PlanRead {
  const reads = readPlans(cards, d, line)
  return reads.reduce((a, b) => ((line == null ? b.expected > a.expected : b.win > a.win) ? b : a))
}

// ============================================================
// A game, snap by snap
// ============================================================

export type DriveEnd = 'td' | 'fg' | 'miss' | 'punt' | 'turnover'

/** One snap. Short keys: a season of these is stored. `at` is the line of
    scrimmage in yards from your own goal line, before the snap. */
export type Play = {
  k: 'run' | 'pass' | 'sack' | 'kick' | 'punt'
  /** The ball carrier, or the passer. */
  by?: string
  /** A throw's target. */
  to?: string
  /** A throw caught. */
  c?: 1
  /** A shot downfield. */
  deep?: 1
  yds: number
  down: number
  dist: number
  at: number
  td?: 1
  /** Lost on this snap: picked off, fumbled, or stopped on fourth down. */
  lost?: 'int' | 'fum' | 'downs'
  /** A kick that went in. */
  good?: 1
}

/** A drive. `ot`: overtime, played when the eleven drives land exactly on the line. */
export type Drive = { end: DriveEnd; yards: number; points: number; by?: string; plays?: Play[]; ot?: true }

/** One man's game. Linemen get a grade instead of numbers. */
export type BoxLine = {
  id: string
  name: string
  pos: PoolKey
  slot: number
  att?: number
  cmp?: number
  passYds?: number
  passTd?: number
  int?: number
  car?: number
  rushYds?: number
  rushTd?: number
  tgt?: number
  rec?: number
  recYds?: number
  recTd?: number
  fum?: number
  grade?: number
  /** Standard PPR off the line: what MVP and the leaders read. */
  pts: number
}

export type GameResult = {
  points: number
  yards: number
  rushYds: number
  passYds: number
  sacks: number
  drives: Drive[]
  box: BoxLine[]
  plan: GamePlan
  /** The plan's roll: true clicked, false didn't, null for Balanced. */
  clicked: boolean | null
  matchup: Matchup
}

const RECEIVER = new Set<PoolKey>(['RB', 'WR', 'TE'])
const LINE = new Set<PoolKey>(['OT', 'OG', 'C'])

function pickBy<T>(items: T[], weight: (t: T) => number, r: number): T | null {
  const total = items.reduce((n, t) => n + Math.max(0, weight(t)), 0)
  if (total <= 0) return items[0] ?? null
  let at = r * total
  for (const t of items) {
    at -= Math.max(0, weight(t))
    if (at <= 0) return t
  }
  return items[items.length - 1] ?? null
}

/** Standard PPR, exactly (Joey, 2026-11-07: the book has to add up the way
    anyone's fantasy app does): a point a reception, one per 10 yards rushing or
    receiving, one per 25 passing, 6 a rushing or receiving TD, 4 a passing TD,
    -2 an interception or a lost fumble. Linemen score nothing; they're graded.
    Old games stored half-PPR with a lineman's grade mixed in, so the pages
    always recount off the line itself. */
export function fantasyPoints(l: Omit<BoxLine, 'pts' | 'id' | 'name' | 'pos' | 'slot'>): number {
  const pts =
    (l.passYds ?? 0) * 0.04 +
    (l.passTd ?? 0) * 4 -
    (l.int ?? 0) * 2 +
    ((l.rushYds ?? 0) + (l.recYds ?? 0)) * 0.1 +
    (l.rec ?? 0) +
    ((l.rushTd ?? 0) + (l.recTd ?? 0)) * 6 -
    (l.fum ?? 0) * 2
  return Math.round(pts * 10) / 10
}

type Cast = {
  m: Matchup
  qb: SimCard | null
  runners: SimCard[]
  catchers: SimCard[]
  v: (c: SimCard, lane: Lane) => number
  rnd: () => number
}

/** What a drive was always going to be, as a kind: the snaps have to end this way. */
type EndKind = 'td' | 'kick' | 'punt' | 'turnover'
const KIND: Record<DriveEnd, EndKind> = { td: 'td', fg: 'kick', miss: 'kick', punt: 'punt', turnover: 'turnover' }

/** A nudge on every snap toward the drive's end, so it gets there honestly most
    of the time: a touchdown drive moves the chains, a punt stalls. */
const STEER: Record<EndKind, number> = { td: 1.3, kick: 1, punt: 0.62, turnover: 0.85 }

/** One snap from a spot, off the lanes. */
function snap(x: Cast, at: number, down: number, dist: number, s: number, giveaway: number): Play {
  const { m, qb, rnd } = x
  const redZone = at >= 80
  // The call: more throws on third and long, more runs on short yardage, fewer
  // shots once the field is short.
  let pr = m.mix.run
  let ps = m.mix.short
  let pd = m.mix.deep
  if (down >= 3 && dist >= 7) {
    pr *= 0.35
    pd *= 1.4
  } else if (dist <= 2) pr *= 1.7
  if (redZone) pd *= 0.35
  const total = pr + ps + pd
  pr /= total
  ps /= total
  const call = rnd()
  const room = 100 - at
  const base = { down, dist, at }

  if (call < pr || !qb) {
    const carrier = pickBy(x.runners, (c) => x.v(c, 'run') * (redZone ? 1 + 2 * c.arch.lanes.redZone : 1), rnd())
    const eff = m.eff.run * s
    let yds = Math.round(3.7 * eff ** 0.7 + (rnd() + rnd() + rnd() - 1.5) * 4.4)
    if (rnd() < 0.032 * eff) yds += 8 + Math.round(rnd() * 42)
    yds = clamp(yds, -at + 1, room)
    if (rnd() < 0.006 * giveaway) return { ...base, k: 'run', by: carrier?.id, yds: Math.max(0, Math.min(yds, 3)), lost: 'fum' }
    return { ...base, k: 'run', by: carrier?.id, yds, ...(yds >= room ? { td: 1 as const } : {}) }
  }

  if (rnd() < clamp(0.062 / m.pocket ** 1.6, 0.025, 0.16)) {
    return { ...base, k: 'sack', by: qb.id, yds: -Math.min(at - 1, 4 + Math.round(rnd() * 6)) }
  }
  const deep = call >= pr + ps && room > 12
  const lane: Lane = deep ? 'deep' : 'short'
  const target = pickBy(x.catchers, (c) => x.v(c, lane) * (redZone ? 1 + 2.5 * c.arch.lanes.redZone : 1), rnd())
  const pick = (deep ? 0.032 : 0.011) * giveaway * (qb.arch.giveaway ** 0.5)
  if (rnd() < pick) return { ...base, k: 'pass', by: qb.id, to: target?.id, yds: 0, lost: 'int', ...(deep ? { deep: 1 as const } : {}) }
  const comp = deep ? clamp(0.46 * m.eff.deep ** 0.55 * m.pocket ** 0.35 * s ** 0.5, 0.2, 0.68) : clamp(0.76 * m.eff.short ** 0.45 * s ** 0.5, 0.5, 0.88)
  if (rnd() >= comp) return { ...base, k: 'pass', by: qb.id, to: target?.id, yds: 0, ...(deep ? { deep: 1 as const } : {}) }
  let yds = deep ? 14 + Math.round(rnd() * 26) : 2 + Math.round(rnd() * 8)
  if (!deep && rnd() < 0.055 * s) yds += 7 + Math.round(rnd() * 30)
  yds = Math.min(yds, room)
  return { ...base, k: 'pass', by: qb.id, to: target?.id, c: 1, yds, ...(deep ? { deep: 1 as const } : {}), ...(yds >= room ? { td: 1 as const } : {}) }
}

/** A drive played out until it ends on its own: a score, a kick, a punt or the ball lost. */
function naturalDrive(x: Cast, kind: EndKind): Play[] {
  const { rnd } = x
  const s = STEER[kind]
  const giveaway = kind === 'turnover' ? 6 : 0
  // Most drives start around your own 25; some get a short field.
  const field = rnd()
  let at = field < 0.65 ? 20 + Math.floor(rnd() * 12) : field < 0.9 ? 30 + Math.floor(rnd() * 16) : 45 + Math.floor(rnd() * 18)
  let down = 1
  let dist = 10
  const plays: Play[] = []
  for (let n = 0; n < 24; n++) {
    if (down === 4) {
      const kick = 100 - at + 17
      if (kick <= 56) {
        plays.push({ k: 'kick', yds: kick, down, dist, at })
        return plays
      }
      if (!(dist <= 2 && at >= 40 && rnd() < 0.45)) {
        plays.push({ k: 'punt', yds: 0, down, dist, at })
        return plays
      }
    }
    const p = snap(x, at, down, dist, s, giveaway)
    plays.push(p)
    if (p.lost || p.td) return plays
    at += p.yds
    if (p.yds >= dist) {
      down = 1
      dist = Math.min(10, 100 - at)
    } else if (down === 4) {
      p.lost = 'downs'
      return plays
    } else {
      down++
      dist -= p.yds
    }
  }
  plays.push({ k: 'punt', yds: 0, down, dist, at })
  return plays
}

const kindOf = (plays: Play[]): EndKind => {
  const last = plays[plays.length - 1]
  if (!last) return 'punt'
  if (last.td) return 'td'
  if (last.lost) return 'turnover'
  if (last.k === 'kick') return 'kick'
  return 'punt'
}

/** The drive's snaps, ending the way the drive ends. Played naturally until one
    lands there (it nearly always does in a few tries); failing that, the last try
    gets the ending it needed. */
function drivePlays(x: Cast, end: DriveEnd): Play[] {
  const kind = KIND[end]
  let plays: Play[] = []
  for (let tries = 0; tries < 40; tries++) {
    plays = naturalDrive(x, kind)
    if (kindOf(plays) === kind) break
  }
  if (kindOf(plays) !== kind) {
    const last = plays[plays.length - 1]
    const keep = last && (last.k === 'kick' || last.k === 'punt' || last.lost || last.td) ? plays.slice(0, -1) : plays
    const at = keep.reduce((n, p) => n + (p.k === 'kick' || p.k === 'punt' ? 0 : p.yds), keep[0]?.at ?? 25)
    const spot = { down: 1, dist: 10, at: Math.min(99, Math.max(1, at)) }
    const deepest = pickBy(x.catchers, (c) => x.v(c, 'deep'), x.rnd())
    if (kind === 'td') keep.push({ ...spot, k: 'pass', by: x.qb?.id, to: deepest?.id, c: 1, deep: 1, yds: 100 - spot.at, td: 1 })
    else if (kind === 'kick') keep.push({ ...spot, down: 4, k: 'kick', yds: 100 - spot.at + 17 })
    else if (kind === 'punt') keep.push({ ...spot, down: 4, k: 'punt', yds: 0 })
    else keep.push({ ...spot, k: 'pass', by: x.qb?.id, to: deepest?.id, yds: 0, lost: 'int' })
    plays = keep
  }
  const last = plays[plays.length - 1]
  if (last?.k === 'kick' && end === 'fg') last.good = 1
  return plays
}

/**
 * One game. With a line (the regular season's points to beat), a score that
 * lands exactly on it goes to overtime (Joey, 2026-11-07: no ties): one more
 * possession, played like any other. Score and it's a win by three, or six on a
 * touchdown; get stopped and it's a loss.
 */
export function simGame(cards: SimCard[], d: Defense, seed: string, plan: GamePlan = 'balanced', line: number | null = null): GameResult {
  const rnd = rngFor(`game|${seed}`)
  // The plan's roll is always drawn, Balanced or not, so the same game under two
  // calls sees the same luck everywhere else.
  const planRoll = rnd()
  const clicked = plan === 'balanced' ? null : planRoll < clickChance(planFit(cards, plan).fit, d, plan)
  const m = matchup(cards, d, plan, clicked)
  const v = (c: SimCard, lane: Lane) => c.value * counterFor(d, c) * c.arch.lanes[lane]

  const skill = cards.filter((c) => !LINE.has(c.pos))
  const linemen = cards.filter((c) => LINE.has(c.pos))
  const qb = cards.find((c) => c.pos === 'QB') ?? null
  const x: Cast = {
    m,
    qb,
    // A quarterback runs by his own run lane: a Dual Threat often, a pocket passer on a scramble.
    runners: skill.filter((c) => c.pos === 'RB' || c.pos === 'QB'),
    catchers: skill.filter((c) => RECEIVER.has(c.pos)),
    v,
    rnd,
  }

  // The score first, off the lanes: this is what the projections are.
  const driveEnd = (): DriveEnd => (rnd() < m.turnover ? 'turnover' : rnd() < m.reach ? (rnd() < m.finish ? 'td' : rnd() < FG ? 'fg' : 'miss') : 'punt')
  const ends: DriveEnd[] = Array.from({ length: DRIVES }, driveEnd)
  const regulation = ends.reduce((n, e) => n + (e === 'td' ? 7 : e === 'fg' ? 3 : 0), 0)
  const overtime = line != null && regulation === line
  if (overtime) ends.push(driveEnd())

  const box = new Map<string, BoxLine>(cards.map((c) => [c.id, { id: c.id, name: c.name, pos: c.pos, slot: c.slot, pts: 0 }]))
  const add = (id: string | undefined, k: keyof BoxLine, n: number) => {
    const l = id ? box.get(id) : null
    if (l) (l[k] as number | undefined) = ((l[k] as number | undefined) ?? 0) + n
  }

  const drives: Drive[] = []
  let rushYds = 0
  let passYds = 0
  let sacks = 0
  for (const [i, end] of ends.entries()) {
    const ot = i >= DRIVES
    const plays = drivePlays(x, end)
    let yards = 0
    let by: string | undefined
    for (const p of plays) {
      if (p.k === 'run') {
        add(p.by, 'car', 1)
        add(p.by, 'rushYds', p.yds)
        rushYds += p.yds
        yards += p.yds
        if (p.td) {
          add(p.by, 'rushTd', 1)
          by = p.by
        }
        if (p.lost === 'fum') add(p.by, 'fum', 1)
      } else if (p.k === 'pass') {
        add(p.by, 'att', 1)
        add(p.to, 'tgt', 1)
        if (p.c) {
          add(p.by, 'cmp', 1)
          add(p.by, 'passYds', p.yds)
          add(p.to, 'rec', 1)
          add(p.to, 'recYds', p.yds)
          passYds += p.yds
          yards += p.yds
          if (p.td) {
            add(p.by, 'passTd', 1)
            add(p.to, 'recTd', 1)
            by = p.to
          }
        }
        if (p.lost === 'int') add(p.by, 'int', 1)
      } else if (p.k === 'sack') {
        sacks++
        yards += p.yds
      }
    }
    // A walk-off touchdown in overtime doesn't kick the extra point.
    drives.push({ end, yards, points: end === 'td' ? (ot ? 6 : 7) : end === 'fg' ? 3 : 0, by, plays, ...(ot ? { ot: true as const } : {}) })
  }

  // The line: graded on the pocket, the sacks and the run game, each man leaning his way.
  for (const c of linemen) {
    const g =
      62 +
      30 * (m.pocket - 1) * (0.5 + c.arch.lanes.protect) +
      30 * (m.eff.run - 1) * (0.5 + c.arch.lanes.run) -
      2.5 * (sacks - 2.4) * c.arch.lanes.protect +
      (rnd() - 0.5) * 12
    add(c.id, 'grade', Math.round(clamp(g, 25, 99)))
  }

  return {
    points: drives.reduce((n, x) => n + x.points, 0),
    yards: rushYds + passYds,
    rushYds,
    passYds,
    sacks,
    drives,
    box: [...box.values()].map((l) => ({ ...l, pts: l.grade != null ? 0 : fantasyPoints(l) })).sort((a, b) => a.slot - b.slot),
    plan,
    clicked,
    matchup: m,
  }
}

// ============================================================
// Scouting
// ============================================================

/** Which bench cards can stand in which slots: a tackle plays either tackle spot,
    a guard either guard, any receiver any of the three. */
export function slotFits(pos: PoolKey, slot: number, slotPools: PoolKey[]): boolean {
  return slotPools[slot] === pos
}

export type Sub = { benchId: string; slot: number; outId: string; gain: number }

/** The one swap from the bench that helps most against this front, with the
    best game plan either way, if any helps by half a point or more. A card of a
    lower rarity only when it's within 15% of the man's value (Joey: the matchup
    decides between players who are close; nobody benches a dynasty for a common,
    whatever the front). */
export function bestSub(cards: SimCard[], bench: SimCard[], d: Defense, slotPools: PoolKey[]): Sub | null {
  const now = bestPlan(cards, d, null).expected
  let best: Sub | null = null
  for (const b of bench) {
    for (const c of cards) {
      if (!slotFits(b.pos, c.slot, slotPools)) continue
      if (rung(b.rarity) < rung(c.rarity) && b.value < c.value * CLOSE) continue
      const next = cards.map((x) => (x.id === c.id ? { ...b, slot: c.slot } : x))
      const gain = bestPlan(next, d, null).expected - now
      if (gain >= 0.5 && (!best || gain > best.gain)) best = { benchId: b.id, slot: c.slot, outId: c.id, gain }
    }
  }
  return best
}

export type LanePart = { id: string; pct: number }

export type Scouting = {
  expected: number
  line: number
  /** Share of plays thrown, from the play calling against this front. */
  passShare: number
  /** Lanes against this front, best first: what's open and what isn't. */
  lanes: { lane: PlayLane; eff: number }[]
  /** Who carries each lane, biggest first (the full report's bars). */
  parts: Record<Lane, LanePart[]>
  /** Your cards this front is built to stop, and the ones that beat it. */
  stopped: string[]
  helped: string[]
  pocket: number
  plans: PlanRead[]
  best: GamePlan
  sub: Sub | null
}

export function scout(cards: SimCard[], bench: SimCard[], d: Defense, line: number | null, slotPools: PoolKey[]): Scouting {
  const m = matchup(cards, d)
  const lanes = (Object.entries(m.eff) as [PlayLane, number][]).map(([lane, eff]) => ({ lane, eff })).sort((a, b) => b.eff - a.eff)
  const parts = {} as Record<Lane, LanePart[]>
  for (const lane of ['run', 'short', 'deep', 'redZone', 'protect'] as Lane[]) {
    const each = cards.map((c) => ({ id: c.id, v: c.value * counterFor(d, c) * c.arch.lanes[lane] }))
    const total = each.reduce((n, e) => n + e.v, 0) || 1
    parts[lane] = each
      .map((e) => ({ id: e.id, pct: Math.round((e.v / total) * 100) }))
      .filter((e) => e.pct >= 4)
      .sort((a, b) => b.pct - a.pct)
  }
  const plans = readPlans(cards, d, line)
  const best = plans.reduce((a, b) => ((line == null ? b.expected > a.expected : b.win > a.win) ? b : a)).plan
  return {
    expected: m.expected,
    line: line ?? 0,
    passShare: m.mix.short + m.mix.deep,
    lanes,
    parts,
    stopped: cards.filter((c) => counterFor(d, c) < 1).map((c) => c.id),
    helped: cards.filter((c) => counterFor(d, c) > 1).map((c) => c.id),
    pocket: m.pocket,
    plans,
    best,
    sub: bestSub(cards, bench, d, slotPools),
  }
}
