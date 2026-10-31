// The player pool. SERVER ONLY.
//
// Every card is one season: 833 of them, 516 men (QB 129, RB 152, WR 163,
// TE 121, OT 100, OG 92, C 76). Each rarity is about half the one under it:
// 399 common, 233 rare, 109 dynasty, 59 transcendent, 33 immortal. Seasons
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

import seasons from './data/season-pool.json'
import { POOL_KEYS, personOf, type Player, type PoolKey } from './rules'

export const POOL_VERSION = 'seasons-2026-10e'

const ALL = seasons as Player[]

export const POOL: Record<PoolKey, Player[]> = Object.fromEntries(
  POOL_KEYS.map((k) => [k, ALL.filter((p) => p.pos === k)])
) as Record<PoolKey, Player[]>

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
