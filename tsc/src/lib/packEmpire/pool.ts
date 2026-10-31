// The player pool. SERVER ONLY.
//
// Every card is one season: 1,000 of them, 626 men (QB 153, RB 200, WR 222,
// TE 150, OT 104, OG 95, C 76). Each rarity is about half the one under it:
// 526 common, 269 rare, 113 dynasty, 59 transcendent, 33 immortal. Seasons
// before 2000 belong to a short list of names people know (LEGENDS in the
// build), and every other card is a man with a real photo; nine famous
// men with none anywhere draw the portrait. Built by
// scripts/pack-empire-pool off official stats, nflverse and the All-Pro and
// Pro Bowl rosters; see the note under rarityForScore in ./rules.ts for how a
// season becomes a score.
//
// A man can hold up to four cards, never two of the same rarity, so his
// versions run from his best year down, and nobody at dynasty or better is on
// just one if he had a lesser year to add. Two versions of one man never share
// a pack or a lineup (see dealPack).
//
// Bump POOL_VERSION whenever this changes, or the odds in ./rules.ts do: it is
// folded into every deal, so a run banked against an older pool fails to replay
// rather than being re-scored against players it never saw.
//
// Never import this from a client component. It is ~140KB, and the whole
// point of dealing on the server is that the browser never holds the pool.

import addedAfterE from './data/added-after-10e.json'
import seasons from './data/season-pool.json'
import { POOL_KEYS, personOf, type Player, type PoolKey, type Rarity, type Weights } from './rules'

export const POOL_VERSION = 'seasons-2026-10f'

const ALL = seasons as Player[]

export const POOL: Record<PoolKey, Player[]> = Object.fromEntries(
  POOL_KEYS.map((k) => [k, ALL.filter((p) => p.pos === k)])
) as Record<PoolKey, Player[]>

/**
 * The pool as it stood at 'seasons-2026-10e', for Dailies dealt before
 * DAILY_NEW_POOL_FROM. A Daily can't change once it's out: people are part way
 * through it, and it re-deals for anyone who looks at their recap. Every card
 * from then is still here, unchanged and in the same order, so the old pool is
 * this one less what was added.
 */
export const POOL_BEFORE_VERSION = 'seasons-2026-10e'

/** The first Daily off the current pool. Set it to a day that hasn't started
    yet whenever POOL_VERSION moves, or that day's Daily re-deals under people. */
export const DAILY_NEW_POOL_FROM = '2026-11-01'

const ADDED = new Set(addedAfterE as string[])

export const POOL_BEFORE: Record<PoolKey, Player[]> = Object.fromEntries(
  POOL_KEYS.map((k) => [k, POOL[k].filter((p) => !ADDED.has(p.id))])
) as Record<PoolKey, Player[]>

/**
 * How many of each rarity every position held when the odds tables in
 * ./rules.ts were tuned. Those tables are weights per card, so a position that
 * gains commons would otherwise deal more commons, and only the skill positions
 * can grow (line seasons need an honor). cardWeight spreads each rarity's
 * tuned share over however many cards it holds now. So adding cards never moves
 * a pack's odds, in any mode, and this table doesn't change when the pool does.
 */
const TUNED_ON: Record<PoolKey, Record<Rarity, number>> = {
  QB: { common: 60, rare: 37, dynasty: 16, transcendent: 9, immortal: 7 },
  RB: { common: 68, rare: 47, dynasty: 20, transcendent: 10, immortal: 7 },
  WR: { common: 78, rare: 46, dynasty: 22, transcendent: 11, immortal: 6 },
  TE: { common: 59, rare: 35, dynasty: 15, transcendent: 8, immortal: 4 },
  OT: { common: 52, rare: 24, dynasty: 13, transcendent: 8, immortal: 3 },
  OG: { common: 44, rare: 25, dynasty: 13, transcendent: 7, immortal: 3 },
  C: { common: 38, rare: 19, dynasty: 10, transcendent: 6, immortal: 3 },
}

const HOLDS = new Map<string, number>()
for (const p of ALL) HOLDS.set(`${p.pos}|${p.rarity}`, (HOLDS.get(`${p.pos}|${p.rarity}`) ?? 0) + 1)

/** One card's weight on a table. Every draw goes through this. */
export function cardWeight(p: Player, weights: Weights): number {
  const base = Math.max(0, weights[p.rarity] ?? 0)
  const now = HOLDS.get(`${p.pos}|${p.rarity}`)
  const tuned = TUNED_ON[p.pos as PoolKey]?.[p.rarity]
  return now && tuned ? (base * tuned) / now : base
}

const BY_ID = new Map(ALL.map((p) => [p.id, p]))

export function playerById(id: string): Player | null {
  return BY_ID.get(id) ?? null
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
