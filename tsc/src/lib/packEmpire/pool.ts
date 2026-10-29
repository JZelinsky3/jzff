// The player pool. SERVER ONLY.
//
// PLACEHOLDER DATA. This is the original hub's pool, carried over as found so
// the game is playable while the real one is built: 514 players, de-duplicated
// (the old files reused short ids across different players and listed sixteen
// players twice), with nflverse headshots matched by name. Who gets which value
// is being rebuilt from the ground up; the new pool only has to land on the
// scale in ./rules.ts (RARITY_FLOOR, ACCOLADE_POINTS) for every odd and tier
// in the game to keep meaning what it means now.
//
// Swapping it is this file and nothing else. Bump POOL_VERSION when you do:
// it is folded into every deal, so a run banked against the old pool fails to
// replay rather than being re-scored against players it never saw.
//
// Never import this from a client component. It is ~130KB, and the whole
// point of dealing on the server is that the browser never holds the pool.

import legacy from './data/legacy-pool.json'
import { POOL_KEYS, type Player, type PoolKey } from './rules'

export const POOL_VERSION = 'legacy-2026-04'

const ALL = legacy as Player[]

export const POOL: Record<PoolKey, Player[]> = Object.fromEntries(
  POOL_KEYS.map((k) => [k, ALL.filter((p) => p.pos === k)])
) as Record<PoolKey, Player[]>

const BY_ID = new Map(ALL.map((p) => [p.id, p]))

export function playerById(id: string): Player | null {
  return BY_ID.get(id) ?? null
}

export const POOL_SIZE = ALL.length
