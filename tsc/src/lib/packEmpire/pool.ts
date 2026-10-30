// The player pool. SERVER ONLY.
//
// Every card is one season: 526 of them, 1970-2025, near the old pool's size
// at every position (QB 78, RB 86, WR 90, TE 74, OT 74, OG 72, C 52) and
// mixed so greedy play lands where it did on the old pool. Seasons before 2000
// only come in at dynasty and up, plus a few legends' best years at rare: the
// bronze cards are men people have watched. Built
// by scripts/pack-empire-pool off official stats, nflverse and the All-Pro and
// Pro Bowl rosters; see the note under rarityForScore in ./rules.ts for how a
// season becomes a score.
//
// A man can hold up to four cards, never two of the same rarity, so his
// versions run from his best year down. Two versions of one man never share a
// pack or a lineup (see dealPack).
//
// Bump POOL_VERSION whenever this changes: it is folded into every deal, so a
// run banked against an older pool fails to replay rather than being re-scored
// against players it never saw.
//
// Never import this from a client component. It is ~140KB, and the whole
// point of dealing on the server is that the browser never holds the pool.

import seasons from './data/season-pool.json'
import { POOL_KEYS, personOf, type Player, type PoolKey } from './rules'

export const POOL_VERSION = 'seasons-2026-10'

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
