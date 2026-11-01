// The player pool. SERVER ONLY.
//
// Every card is one season: 1,000 of them, 626 men. Each rarity is about half
// the one under it: 518 common, 269 rare, 120 dynasty, 57 transcendent, 36
// immortal. A card's value comes off a fixed scale per position, so it never
// moves when another card is added, and the top has no ceiling. Seasons
// before 2000 belong to a short list of names people know (LEGENDS in the
// build), and every other card is a man with a real photo; nine famous
// men with none anywhere draw the portrait. Built by
// scripts/pack-empire-pool off official stats, nflverse and the All-Pro and
// Pro Bowl rosters; see the note under rarityForScore in ./rules.ts for how a
// season becomes a score.
//
// A man can hold up to four cards, never two of the same rarity, across every
// position he's listed at, so his versions run from his best year down, and
// nobody at dynasty or better is on just one if he had a lesser year to add. Two
// seasons landing on one rarity settle in the build: within 200 of a line, one
// crosses it; otherwise the lesser goes in the vault (data/vaulted.json), never
// dealt again but still readable by any lineup or binder that holds it. Two
// versions of one man never share a pack or a lineup (see dealPack).
//
// Bump POOL_VERSION whenever this changes, or the odds in ./rules.ts do: it is
// folded into every deal, so a run banked against an older pool fails to replay
// rather than being re-scored against players it never saw.
//
// Never import this from a client component. It is ~140KB, and the whole
// point of dealing on the server is that the browser never holds the pool.

import addedAfterE from './data/added-after-10e.json'
import frozen from './data/season-pool-10h.json'
import seasons from './data/season-pool.json'
import vaulted from './data/vaulted.json'
import { POOL_KEYS, RARITY_FLOOR, personOf, tableRarity, type Player, type PoolKey, type TableRarity, type Weights } from './rules'

export const POOL_VERSION = 'seasons-2026-10m'

// Canton is set here rather than in the data, so the frozen Daily pools keep the
// Immortals they were dealt with. Nothing about a deal reads it: see tableRarity.
const ALL = (seasons as Player[]).map((p) => (p.score >= RARITY_FLOOR.canton ? { ...p, rarity: 'canton' as const } : p))

function byPosition(cards: Player[]): Record<PoolKey, Player[]> {
  return Object.fromEntries(POOL_KEYS.map((k) => [k, cards.filter((p) => p.pos === k)])) as Record<PoolKey, Player[]>
}

export const POOL = byPosition(ALL)

/**
 * What older Dailies are dealt from. A Daily can't change once it's out: people
 * are part way through it, and it re-deals for anyone who looks at their recap.
 * So data/season-pool-10h.json is the pool as it stood at 'seasons-2026-10h', kept
 * as it was: cards' values feed the deal, its traps and its ranges, so a card can
 * no longer be read off the live pool for a past day.
 *
 * Days before DAILY_H_FROM are on the older 10e pool, which is that file less
 * what was added after it. Days from DAILY_H_FROM on are on all of it.
 */
export const POOL_BEFORE_VERSION = 'seasons-2026-10e'
export const POOL_H_VERSION = 'seasons-2026-10h'
export const DAILY_H_FROM = '2026-11-01'

/** The first Daily off the current pool. Set it to a day that hasn't started
    yet whenever POOL_VERSION moves, or that day's Daily re-deals under people. */
export const DAILY_NEW_POOL_FROM = '2026-11-02'

const FROZEN = frozen as Player[]
const ADDED = new Set(addedAfterE as string[])

export const POOL_H = byPosition(FROZEN)
export const POOL_BEFORE = byPosition(FROZEN.filter((p) => !ADDED.has(p.id)))

/**
 * How many of each rarity every position held when the odds tables in
 * ./rules.ts were tuned. Those tables are weights per card, so a position that
 * gains commons would otherwise deal more commons, and only the skill positions
 * can grow (line seasons need an honor). cardWeight spreads each rarity's
 * tuned share over however many cards it holds now. So adding cards never moves
 * a pack's odds, in any mode, and this table doesn't change when the pool does.
 */
const TUNED_ON: Record<PoolKey, Record<TableRarity, number>> = {
  QB: { common: 60, rare: 37, dynasty: 16, transcendent: 9, immortal: 7 },
  RB: { common: 68, rare: 47, dynasty: 20, transcendent: 10, immortal: 7 },
  WR: { common: 78, rare: 46, dynasty: 22, transcendent: 11, immortal: 6 },
  TE: { common: 59, rare: 35, dynasty: 15, transcendent: 8, immortal: 4 },
  OT: { common: 52, rare: 24, dynasty: 13, transcendent: 8, immortal: 3 },
  OG: { common: 44, rare: 25, dynasty: 13, transcendent: 7, immortal: 3 },
  C: { common: 38, rare: 19, dynasty: 10, transcendent: 6, immortal: 3 },
}

/**
 * Every immortal has its own odds off its value, so the odds open up exactly
 * where the values do: Faulk's 385 over Holmes is a real step, and Gronk and
 * Kelce, 105 apart, stay close. Each IMMORTAL_SPAN of value over the line is
 * IMMORTAL_SPREAD times harder to pull. There's no top, so a new best-ever season
 * needs nothing changed here. Shares only move inside a position's immortals,
 * which together stay exactly as likely as the tables say.
 */
const IMMORTAL_SPREAD = 6
const IMMORTAL_SPAN = 2400

/** The span on POOL_H, whose Dailies are already out. */
const IMMORTAL_SPAN_H = 1600

/**
 * Canton, the 5,200+ seasons and the top ten in the game, are this much harder again
 * on top of the curve. It comes out of the same shares, so a position's immortals as
 * a whole stay exactly as likely. Not on POOL_H.
 *
 * It was 2/3 until the ordinary immortal went up on 2026-11-01. This holds Canton to
 * half of that rise: all ten land within 2% of halfway between their old odds and
 * what the new table alone would have made them.
 */
const CANTON_PULL = 0.534

function immortalPull(score: number, span: number, canton: number): number {
  return IMMORTAL_SPREAD ** -((score - RARITY_FLOOR.immortal) / span) * (score >= RARITY_FLOOR.canton ? canton : 1)
}

function weigher(cards: Player[], span: number, canton = 1): (p: Player, weights: Weights) => number {
  const holds = new Map<string, number>()
  const key = (p: Player) => `${p.pos}|${tableRarity(p.rarity)}`
  for (const p of cards) holds.set(key(p), (holds.get(key(p)) ?? 0) + 1)

  const shares = new Map<string, number>()
  for (const [, list] of Object.entries(byPosition(cards))) {
    const top = list.filter((p) => tableRarity(p.rarity) === 'immortal')
    const whole = top.reduce((sum, p) => sum + immortalPull(p.score, span, canton), 0)
    for (const p of top) shares.set(p.id, (immortalPull(p.score, span, canton) * top.length) / whole)
  }

  return (p, weights) => {
    const rarity = tableRarity(p.rarity)
    const base = Math.max(0, weights[rarity] ?? 0) * (shares.get(p.id) ?? 1)
    const now = holds.get(key(p))
    const tuned = TUNED_ON[p.pos as PoolKey]?.[rarity]
    return now && tuned ? (base * tuned) / now : base
  }
}

/** One card's weight on a table. Every draw goes through this. */
export const cardWeight = weigher(ALL, IMMORTAL_SPAN, CANTON_PULL)

/** The same, for the Dailies dealt off POOL_H. */
export const cardWeightH = weigher(FROZEN, IMMORTAL_SPAN_H)

/** Cards out of the packs, as they were last dealt. */
export const VAULTED = vaulted as Player[]

const LIVE = new Map(ALL.map((p) => [p.id, p]))
const BY_ID = new Map([...VAULTED, ...ALL].map((p) => [p.id, p]))

/** Any card there has been, vault included, so a saved lineup still reads. */
export function playerById(id: string): Player | null {
  return BY_ID.get(id) ?? null
}

/** A card as the game deals it now, or null if it's in the vault. */
export function liveCard(id: string): Player | null {
  return LIVE.get(id) ?? null
}

/** The man a card id belongs to. An id from an older pool is its own man. */
export function personOfId(id: string): string {
  const p = BY_ID.get(id)
  return p ? personOf(p) : id
}

const VERSIONS = new Map<string, Player[]>()
for (const p of ALL) {
  const k = personOf(p)
  VERSIONS.set(k, [...(VERSIONS.get(k) ?? []), p])
}
for (const list of VERSIONS.values()) list.sort((a, b) => b.score - a.score)

/** Every card a man has, best season first: what a binder page shows. */
export function versionsOf(pid: string): Player[] {
  return VERSIONS.get(pid) ?? []
}

export const POOL_SIZE = ALL.length
