// What kind of player a card is, off the numbers of the season it's from.
// SERVER ONLY in practice: it reads data/card-stats.json (built by
// scripts/pack-empire-pool/build/stats.py), which the browser never needs. Pages
// send the tag and lanes they work out here.
//
// Rarity is still the size of a card: its value. An archetype only says WHERE that
// value goes, as shares across five lanes that add up to 1:
//   run      carries, and the line opening holes for them
//   short    the quick game: completions, catches underneath
//   deep     the shots downfield
//   redZone  finishing drives
//   protect  a line keeping its quarterback upright, which is what lets deep happen
// Joey's map: the line feeds run and protect (so deep), receivers short and deep,
// the quarterback short and deep, backs run and short. A 2,000-yard back and a
// 100-catch back can be worth the same and still help a team in different places.
//
// Cutoffs sit on the pool's own spread (measured 2026-11-07, 1,076 cards), so each
// tag takes a sensible share of its position: a quarter or so of receivers are Deep
// Threats, most backs are Bell Cows. Cards from before 1999 have the basics only
// (no attempts, targets or air yards), so they're read off what they have.

import stats from './data/card-stats.json'
import type { Player, PoolKey } from './rules'

export const LANES = ['run', 'short', 'deep', 'redZone', 'protect'] as const
export type Lane = (typeof LANES)[number]
export type Lanes = Record<Lane, number>

export const ARCHETYPES = {
  QB: ['Gunslinger', 'Surgeon', 'Dual Threat'],
  RB: ['Bell Cow', 'Receiving Back', 'Goal Line Back'],
  WR: ['Deep Threat', 'Possession', 'Red Zone Target'],
  TE: ['Seam Stretcher', 'Safety Valve', 'Blocking TE'],
  OL: ['Road Grader', 'Pass Protector', 'Anchor'],
} as const

export type ArchetypeTag = (typeof ARCHETYPES)[keyof typeof ARCHETYPES][number]

/** One season as numbers. Every key is optional: zeros are left out of the file. */
export type CardStats = {
  g?: number
  // Passing (QB): yards, TDs, INTs; from 1999 attempts, completions, sacks taken,
  // 20-yard completions and air yards.
  py?: number
  ptd?: number
  int?: number
  att?: number
  cmp?: number
  sk?: number
  p20?: number
  pay?: number
  // Rushing.
  car?: number
  ry?: number
  rtd?: number
  r20?: number
  // Receiving; from 1999 targets, 20-yard catches and air yards.
  rec?: number
  recy?: number
  rectd?: number
  tgt?: number
  c20?: number
  ay?: number
  // A lineman: honors (3 First-Team AP, 2 Second-Team or another First-Team,
  // 1 Pro Bowl), Pro Bowl, and his team's offense that year: points, rush yards
  // and pass yards a game, sacks allowed a game (1999 on), scoring rank.
  hon?: number
  pb?: number
  ppg?: number
  rpg?: number
  pypg?: number
  spg?: number
  rank?: number
}

export type Archetype = {
  tag: ArchetypeTag
  lanes: Lanes
  /** A quarterback's interceptions a game against the pool's typical one (1 = average). */
  giveaway: number
}

const STATS = stats as Record<string, CardStats>

export function statsOf(id: string): CardStats | null {
  return STATS[id] ?? null
}

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x))

/** Where x sits against the pool: 0 at the median, about ±1 at the 10th/90th. */
const spread = (x: number, p10: number, p50: number, p90: number) => clamp(x >= p50 ? (x - p50) / (p90 - p50) : (x - p50) / (p50 - p10))

function lanes(l: Partial<Lanes>): Lanes {
  const out = { run: 0, short: 0, deep: 0, redZone: 0, protect: 0, ...l }
  const total = LANES.reduce((n, k) => n + Math.max(0, out[k]), 0) || 1
  for (const k of LANES) out[k] = Math.max(0, out[k]) / total
  return out
}

type Group = keyof typeof ARCHETYPES

export function groupOf(pos: PoolKey): Group {
  return pos === 'OT' || pos === 'OG' || pos === 'C' ? 'OL' : pos
}

function qb(s: CardStats): Archetype {
  const g = s.g || 16
  const ryg = (s.ry ?? 0) / g
  const ypa = s.att ? (s.py ?? 0) / s.att : null
  const aypa = s.att && s.pay ? s.pay / s.att : null
  // Deep off yards an attempt and air yards an attempt where they exist; the old
  // cards have neither and sit in the middle.
  const deep = ypa == null ? 0 : (spread(ypa, 6.33, 7.39, 8.31) + (aypa == null ? spread(ypa, 6.33, 7.39, 8.31) : spread(aypa, 7.04, 8.0, 9.19))) / 2
  const run = clamp(ryg / 40, 0, 1.4)
  const rz = spread((s.ptd ?? 0) / g, 1.0, 1.62, 2.44)
  const tag: ArchetypeTag = ryg >= 30 ? 'Dual Threat' : deep >= 0.35 ? 'Gunslinger' : 'Surgeon'
  return {
    tag,
    lanes: lanes({ short: 0.46 - 0.15 * deep, deep: 0.34 + 0.15 * deep, run: 0.04 + 0.2 * run, redZone: 0.16 + 0.05 * rz }),
    giveaway: Math.max(0.4, ((s.int ?? 0) / g) / 0.71),
  }
}

function rb(s: CardStats): Archetype {
  const g = s.g || 16
  const recg = (s.rec ?? 0) / g
  const tdg = ((s.rtd ?? 0) + (s.rectd ?? 0)) / g
  const ryg = (s.ry ?? 0) / g
  const catches = spread(recg, 1.18, 2.9, 5.0)
  const scores = spread(tdg, 0.29, 0.67, 1.19)
  // Volume first: a back who ran for 85+ a game carried the offense, however many
  // he punched in (Henry 2020 is a Bell Cow, not a goal-line back).
  const tag: ArchetypeTag = recg >= 4.2 ? 'Receiving Back' : ryg < 85 && tdg >= 0.9 ? 'Goal Line Back' : 'Bell Cow'
  return {
    tag,
    lanes: lanes({ run: 0.62 - 0.18 * catches, short: 0.18 + 0.18 * catches, redZone: 0.2 + 0.07 * scores }),
    giveaway: 1,
  }
}

function wr(s: CardStats): Archetype {
  const g = s.g || 16
  const ypr = s.rec ? (s.recy ?? 0) / s.rec : 13.58
  const adot = s.tgt && s.ay ? s.ay / s.tgt : null
  const big = s.rec && s.c20 != null ? s.c20 / s.rec : null
  const reads = [spread(ypr, 10.79, 13.58, 16.39), ...(adot == null ? [] : [spread(adot, 7.08, 10.9, 13.96)]), ...(big == null ? [] : [spread(big, 0.11, 0.19, 0.27)])]
  const deep = reads.reduce((a, b) => a + b, 0) / reads.length
  const tdg = (s.rectd ?? 0) / g
  const scores = spread(tdg, 0.25, 0.47, 0.83)
  const tag: ArchetypeTag = deep >= 0.45 ? 'Deep Threat' : tdg >= 0.7 ? 'Red Zone Target' : 'Possession'
  return {
    tag,
    lanes: lanes({ short: 0.45 - 0.2 * deep, deep: 0.38 + 0.2 * deep, redZone: 0.17 + 0.07 * scores }),
    giveaway: 1,
  }
}

function te(s: CardStats): Archetype {
  const g = s.g || 16
  const ypr = s.rec ? (s.recy ?? 0) / s.rec : 11.27
  const recyg = (s.recy ?? 0) / g
  const deep = spread(ypr, 9.24, 11.27, 13.54)
  const catching = spread(recyg, 27.65, 41.88, 72.77)
  const scores = spread((s.rectd ?? 0) / g, 0.12, 0.31, 0.67)
  const tag: ArchetypeTag = ypr >= 12.8 ? 'Seam Stretcher' : recyg < 32 ? 'Blocking TE' : 'Safety Valve'
  return {
    tag,
    lanes: lanes({
      short: 0.52 + 0.06 * catching,
      deep: 0.13 + 0.08 * deep,
      redZone: 0.2 + 0.06 * scores,
      // A tight end who didn't catch much was blocking.
      run: 0.15 - 0.1 * catching,
    }),
    giveaway: 1,
  }
}

function ol(s: CardStats): Archetype {
  const run = s.rpg == null ? 0 : spread(s.rpg, 98, 124.5, 155.4)
  // Sacks allowed exist from 1999. Before that, a team that threw for a lot was
  // at least keeping its passer upright: a weaker read, so it counts half.
  const protect = s.spg != null ? -spread(s.spg, 1.31, 1.94, 2.69) : s.pypg != null ? 0.5 * spread(s.pypg, 200.6, 249, 298.4) : 0
  const lean = run - protect
  const tag: ArchetypeTag = lean >= 0.3 ? 'Road Grader' : lean <= -0.3 ? 'Pass Protector' : 'Anchor'
  return { tag, lanes: lanes({ run: 0.5 + 0.2 * lean, protect: 0.5 - 0.2 * lean }), giveaway: 1 }
}

const READ: Record<Group, (s: CardStats) => Archetype> = { QB: qb, RB: rb, WR: wr, TE: te, OL: ol }

/** A card's archetype. A card with no stats on file (there shouldn't be one) gets
    its position's middle. */
export function archetypeOf(card: Pick<Player, 'id' | 'pos'>): Archetype {
  return READ[groupOf(card.pos)](statsOf(card.id) ?? {})
}
