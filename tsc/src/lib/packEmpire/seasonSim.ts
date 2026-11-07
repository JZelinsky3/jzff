// The Season sim (League Mode's Season variation): an eleven against a defense,
// eleven drives, a score and a box score. Pure and seeded: the server, the pages
// (the scouting report's projection) and scripts/pack-empire-pool/sim/season-sim.ts
// all run this same code, and a game re-run off its seed comes out the same, so a
// refresh never re-rolls one.
//
// How a game goes:
//  1. Every card puts its value (score plus its share of the team's chemistry)
//     into five lanes by its archetype (archetypes.ts). A defense's counters scale
//     the cards it's built to stop or that beat it.
//  2. The line's protection against the front's pass rush sets the pocket: a
//     collapsing pocket costs the deep game most and the short game a little.
//  3. Each lane's total over a typical Season roster's (REF), times what the front
//     gives up there, is that lane's efficiency. The play calling leans on what
//     works, but only partly: a one-dimensional offense still pays against the
//     front built for it.
//  4. Each of the eleven drives turns over, stalls, or reaches scoring range off
//     that, then the red zone decides seven or three.
//
// Rarity is still the size of everything: a better card is more of every lane it
// plays. The archetype decides where it lands, which is why the same two rosters
// can swap places from one front to the next.

import type { Archetype, ArchetypeTag, Lane } from './archetypes'
import { rngFor, type Defense } from './defenses'
import type { PoolKey } from './rules'

export type SimCard = {
  id: string
  name: string
  pos: PoolKey
  /** Index into SLOTS. */
  slot: number
  /** The card's score plus its half of every chemistry bond it's in. */
  value: number
  arch: Archetype
  /** From its real season, for the box score: yards a catch and a carry. */
  ypr?: number
  ypc?: number
}

export type TeamLanes = Record<Lane, number>

/** A typical Season roster's lane totals: the median of season-sim.ts's drafted
    rosters (greedy League packs, a Franchise Pack, hard chemistry). An offense
    that matches it against the base front scores about LINE_BASE. */
export const REF: TeamLanes = { run: 5300, short: 3710, deep: 2490, redZone: 1810, protect: 4030 }

export const DRIVES = 11

/** How hard the play calling leans into what's working: 0 never adjusts, 1 is
    proportional. Halfway, so a front built to stop you still costs you: at 0.8
    the offense dodged most of every front and the matchup barely registered. */
const LEAN = 0.5
const BASE_MIX = { run: 0.42, short: 0.38, deep: 0.2 }

// A drive reaches scoring range at 47% for a typical offense, a red-zone trip ends
// in a touchdown 56% of the time, field goals go in 86%: about 23-24 points.
const REACH = { at: -0.12, slope: 2.2 }
const FINISH = { at: 0.24, slope: 1.8 }
const FG = 0.86
const TURNOVER = 0.1

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

export function counterFor(d: Defense | null, tag: ArchetypeTag): number {
  return d?.counters[tag] ?? 1
}

/** Lane totals for an eleven, with a front's counters applied if one's given. */
export function laneTotals(cards: SimCard[], d: Defense | null = null): TeamLanes {
  const out: TeamLanes = { run: 0, short: 0, deep: 0, redZone: 0, protect: 0 }
  for (const c of cards) {
    const v = c.value * counterFor(d, c.arch.tag)
    for (const k of Object.keys(out) as Lane[]) out[k] += v * c.arch.lanes[k]
  }
  return out
}

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

export function matchup(cards: SimCard[], d: Defense): Matchup {
  const raw = laneTotals(cards, d)
  const pocket = clamp((raw.protect * d.rush) / REF.protect, 0.55, 1.25)
  const eff = {
    run: (raw.run / REF.run) * d.lanes.run,
    short: (raw.short / REF.short) * d.lanes.short * pocket ** 0.4,
    deep: (raw.deep / REF.deep) * d.lanes.deep * pocket,
    redZone: (raw.redZone / REF.redZone) * d.lanes.redZone,
  }
  const w = {
    run: BASE_MIX.run * eff.run ** LEAN,
    short: BASE_MIX.short * eff.short ** LEAN,
    deep: BASE_MIX.deep * eff.deep ** LEAN,
  }
  const sum = w.run + w.short + w.deep
  const mix = { run: w.run / sum, short: w.short / sum, deep: w.deep / sum }
  const drive = mix.run * eff.run + mix.short * eff.short + mix.deep * eff.deep
  const qb = cards.find((c) => c.pos === 'QB')
  const turnover = clamp((TURNOVER * Math.sqrt(qb?.arch.giveaway ?? 1) * d.takeaways) / Math.sqrt(pocket * drive), 0.03, 0.25)
  const reach = sigmoid(REACH.at + REACH.slope * Math.log(Math.max(drive, 0.05)))
  const finish = sigmoid(FINISH.at + FINISH.slope * Math.log(Math.max(eff.redZone, 0.05)))
  const expected = DRIVES * (1 - turnover) * reach * (finish * 7 + (1 - finish) * FG * 3)
  return { eff, pocket, mix, drive, turnover, reach, finish, expected }
}

// ============================================================
// A game
// ============================================================

export type DriveEnd = 'td' | 'fg' | 'miss' | 'punt' | 'turnover'

export type Drive = { end: DriveEnd; yards: number; points: number; by?: string }

/** One man's game. Linemen get a grade instead of numbers. */
export type BoxLine = {
  id: string
  name: string
  pos: PoolKey
  slot: number
  passYds?: number
  passTd?: number
  int?: number
  car?: number
  rushYds?: number
  rushTd?: number
  rec?: number
  recYds?: number
  recTd?: number
  fum?: number
  grade?: number
  /** Fantasy-style points off the line: what MVP and the leaders read. */
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
  matchup: Matchup
}

const RECEIVER = new Set<PoolKey>(['RB', 'WR', 'TE'])
const LINE = new Set<PoolKey>(['OT', 'OG', 'C'])
const YPR: Partial<Record<PoolKey, number>> = { WR: 13.5, TE: 11.3, RB: 8 }
const YPC: Partial<Record<PoolKey, number>> = { RB: 4.5, QB: 5.5 }

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

/** Shares a total out in whole numbers by weight, so the lines add up to the team's. */
function shareOut(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0)
  if (sum <= 0 || total <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (Math.max(0, w) / sum) * total)
  const out = raw.map(Math.floor)
  let left = Math.round(total) - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0])
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]]++
  return out
}

const fantasy = (l: BoxLine) =>
  (l.passYds ?? 0) * 0.04 +
  (l.passTd ?? 0) * 4 -
  (l.int ?? 0) * 2 +
  ((l.rushYds ?? 0) + (l.recYds ?? 0)) * 0.1 +
  (l.rec ?? 0) * 0.5 +
  ((l.rushTd ?? 0) + (l.recTd ?? 0)) * 6 -
  (l.fum ?? 0) * 2 +
  (l.grade ?? 0) / 8

export function simGame(cards: SimCard[], d: Defense, seed: string): GameResult {
  const m = matchup(cards, d)
  const rnd = rngFor(`game|${seed}`)
  const v = (c: SimCard, lane: Lane) => c.value * counterFor(d, c.arch.tag) * c.arch.lanes[lane]

  const skill = cards.filter((c) => !LINE.has(c.pos))
  const line = cards.filter((c) => LINE.has(c.pos))
  const qb = cards.find((c) => c.pos === 'QB') ?? null
  const runners = skill.filter((c) => c.pos === 'RB' || c.pos === 'QB')
  const catchers = skill.filter((c) => RECEIVER.has(c.pos))

  const lines = new Map<string, BoxLine>(cards.map((c) => [c.id, { id: c.id, name: c.name, pos: c.pos, slot: c.slot, pts: 0 }]))
  const add = (id: string, k: keyof BoxLine, n: number) => {
    const l = lines.get(id)
    if (l) (l[k] as number | undefined) = ((l[k] as number | undefined) ?? 0) + n
  }

  const drives: Drive[] = []
  let rushYds = 0
  let passYds = 0
  for (let i = 0; i < DRIVES; i++) {
    let end: DriveEnd
    let yards: number
    if (rnd() < m.turnover) {
      end = 'turnover'
      yards = Math.round(rnd() * 32)
    } else if (rnd() < m.reach) {
      end = rnd() < m.finish ? 'td' : rnd() < FG ? 'fg' : 'miss'
      yards = end === 'td' ? 60 + Math.round(rnd() * 25) : 42 + Math.round(rnd() * 22)
    } else {
      end = 'punt'
      yards = 6 + Math.round(rnd() * 34)
    }
    // The yards split by the play calling, with a little drive-to-drive wobble.
    const runShare = clamp(m.mix.run + (rnd() - 0.5) * 0.24, 0.05, 0.9)
    const r = Math.round(yards * runShare)
    rushYds += r
    passYds += yards - r

    let by: string | undefined
    if (end === 'td') {
      // Whoever finishes drives: red-zone weight, a quarterback only for what he runs in.
      const scorer = pickBy(
        skill,
        (c) => (c.pos === 'QB' ? v(c, 'redZone') * (c.arch.lanes.run / (c.arch.lanes.run + c.arch.lanes.short + c.arch.lanes.deep)) : v(c, 'redZone')),
        rnd()
      )
      if (scorer) {
        by = scorer.id
        const rushing =
          scorer.pos === 'QB' || (scorer.pos === 'RB' && rnd() < scorer.arch.lanes.run / (scorer.arch.lanes.run + scorer.arch.lanes.short))
        if (rushing) add(scorer.id, 'rushTd', 1)
        else {
          add(scorer.id, 'recTd', 1)
          if (qb) add(qb.id, 'passTd', 1)
        }
      }
    } else if (end === 'turnover') {
      if (qb && rnd() < 0.75) add(qb.id, 'int', 1)
      else {
        const f = pickBy(runners.length ? runners : skill, (c) => v(c, 'run') + v(c, 'short') * 0.3, rnd())
        if (f) add(f.id, 'fum', 1)
      }
    }
    drives.push({ end, yards, points: end === 'td' ? 7 : end === 'fg' ? 3 : 0, by })
  }

  // The yards out to the men who gained them, by how much of each lane they carry.
  const rushShares = shareOut(rushYds, runners.map((c) => v(c, 'run') * (0.85 + rnd() * 0.3)))
  runners.forEach((c, i) => {
    if (!rushShares[i]) return
    add(c.id, 'rushYds', rushShares[i])
    add(c.id, 'car', Math.max(1, Math.round(rushShares[i] / (c.ypc ?? YPC[c.pos] ?? 4.5))))
  })
  const recShares = shareOut(passYds, catchers.map((c) => (v(c, 'short') + v(c, 'deep') * 1.5) * (0.75 + rnd() * 0.5)))
  catchers.forEach((c, i) => {
    if (!recShares[i]) return
    add(c.id, 'recYds', recShares[i])
    add(c.id, 'rec', Math.max(1, Math.round(recShares[i] / (c.ypr ?? YPR[c.pos] ?? 12))))
  })
  if (qb) add(qb.id, 'passYds', passYds)

  // The line: graded on the pocket and the run game, each man leaning his way.
  const sacks = Math.max(0, Math.round((2.4 / m.pocket ** 1.5) * (0.6 + rnd() * 0.8)))
  for (const c of line) {
    const g = 62 + 30 * (m.pocket - 1) * (0.5 + c.arch.lanes.protect) + 30 * (m.eff.run - 1) * (0.5 + c.arch.lanes.run) + (rnd() - 0.5) * 14
    add(c.id, 'grade', Math.round(clamp(g, 25, 99)))
  }

  const box = [...lines.values()].map((l) => ({ ...l, pts: Math.round(fantasy(l) * 10) / 10 })).sort((a, b) => a.slot - b.slot)
  return {
    points: drives.reduce((n, x) => n + x.points, 0),
    yards: rushYds + passYds,
    rushYds,
    passYds,
    sacks,
    drives,
    box,
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

/** The one swap from the bench that helps most against this front, if any helps
    by half a point or more of projection. */
export function bestSub(cards: SimCard[], bench: SimCard[], d: Defense, slotPools: PoolKey[]): Sub | null {
  const now = matchup(cards, d).expected
  let best: Sub | null = null
  for (const b of bench) {
    for (const c of cards) {
      if (!slotFits(b.pos, c.slot, slotPools)) continue
      const next = cards.map((x) => (x.id === c.id ? { ...b, slot: c.slot } : x))
      const gain = matchup(next, d).expected - now
      if (gain >= 0.5 && (!best || gain > best.gain)) best = { benchId: b.id, slot: c.slot, outId: c.id, gain }
    }
  }
  return best
}

export type Scouting = {
  expected: number
  line: number
  /** Share of plays thrown, from the play calling against this front. */
  passShare: number
  /** Lanes against this front, best first: what's open and what isn't. */
  lanes: { lane: 'run' | 'short' | 'deep' | 'redZone'; eff: number }[]
  /** Your cards this front is built to stop, and the ones that beat it. */
  stopped: string[]
  helped: string[]
  pocket: number
  sub: Sub | null
}

export function scout(cards: SimCard[], bench: SimCard[], d: Defense, line: number, slotPools: PoolKey[]): Scouting {
  const m = matchup(cards, d)
  const lanes = (Object.entries(m.eff) as [Scouting['lanes'][number]['lane'], number][])
    .map(([lane, eff]) => ({ lane, eff }))
    .sort((a, b) => b.eff - a.eff)
  return {
    expected: m.expected,
    line,
    passShare: m.mix.short + m.mix.deep,
    lanes,
    stopped: cards.filter((c) => counterFor(d, c.arch.tag) < 1).map((c) => c.id),
    helped: cards.filter((c) => counterFor(d, c.arch.tag) > 1).map((c) => c.id),
    pocket: m.pocket,
    sub: bestSub(cards, bench, d, slotPools),
  }
}
