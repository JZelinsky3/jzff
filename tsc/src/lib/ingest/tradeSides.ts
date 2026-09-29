// Writing a trade's sides without destroying its grade.
//
// THE BUG THIS EXISTS TO FIX
//
// Every platform ingest used to do this, in exactly these words:
//
//     await db.from('trade_sides').delete().eq('trade_id', tradeRow.id)
//     ... then insert each side fresh
//
// trade_grades.trade_side_id is `on delete cascade`, so that delete took
// every grade on the trade with it. The original comment was honest about
// the trade-off and correct at the time:
//
//     "grades aren't generated in Phase 1, so there's nothing to lose yet.
//      When grading lands in Phase 2 we'll switch this to per-side upsert
//      keyed by (trade_id, manager_id) to preserve grade history across
//      re-syncs."
//
// Phase 2 landed. The switch did not. So every sync silently wiped the
// league's grades, the next cron pass re-graded them from scratch, and the
// write-ups changed underneath people who had already read them. It stayed
// survivable only because a full sync ran weekly. Once a daily trades sweep
// existed the same bug started firing twice a day.
//
// THE FIX
//
// trade_sides already carries `unique (trade_id, manager_id)` (migration
// 0022), so the side identity the original comment wanted was available the
// whole time. Upserting on that key keeps each side's id stable, which keeps
// its grade attached, while still refreshing the derived assets payload on
// every sync.
//
// Sides are still pruned, but only ones that genuinely vanished: a manager
// who is no longer part of the trade. That is close to impossible for a
// completed trade and costs one query, but leaving orphans would be worse
// than the delete this replaces.

import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

export type TradeSideWrite = {
  managerId: string
  assets: unknown
  // Used only to name the side in a warning, so a failure points at the
  // team the reader can actually find on the platform.
  label: string
}

// Upsert every side of one trade, then drop any side no longer present.
// Returns how many sides were written plus any per-side warnings, matching
// what the callers already collect.
export async function writeTradeSides(
  db: Db,
  tradeId: string,
  sides: TradeSideWrite[],
  describe: (label: string, message: string) => string,
): Promise<{ written: number; warnings: string[] }> {
  const warnings: string[] = []
  const keptManagerIds: string[] = []
  let written = 0

  // Rank stamps outlive the sync. `rank_now` is written by the daily grading
  // job and `rank_at_trade` can come from a pass the platform payload knows
  // nothing about, so an ingest rebuilding the assets from scratch used to
  // erase both on every sync. That is why pams' trade cards showed no ranks
  // at all. Carry them over from what's stored whenever the fresh asset
  // doesn't bring its own.
  const { data: stored } = await db.from('trade_sides').select('manager_id, assets').eq('trade_id', tradeId)
  const storedByManager = new Map<string, Array<Record<string, unknown>>>()
  for (const row of stored ?? []) {
    if (Array.isArray(row.assets)) storedByManager.set(row.manager_id as string, row.assets as Array<Record<string, unknown>>)
  }

  for (const side of sides) {
    const assets = carryRanks(side.assets, storedByManager.get(side.managerId))
    const { error } = await db.from('trade_sides').upsert(
      { trade_id: tradeId, manager_id: side.managerId, assets },
      { onConflict: 'trade_id,manager_id' },
    )
    if (error) {
      warnings.push(describe(side.label, error.message))
      continue
    }
    keptManagerIds.push(side.managerId)
    written++
  }

  // Nothing written means the ingest failed for this trade, not that the
  // trade has no sides. Pruning here would delete the real sides (and their
  // grades) on the strength of a transient error, which is the exact failure
  // this module exists to prevent.
  if (keptManagerIds.length > 0) {
    const { error } = await db
      .from('trade_sides')
      .delete()
      .eq('trade_id', tradeId)
      .not('manager_id', 'in', `(${keptManagerIds.join(',')})`)
    if (error) warnings.push(describe('prune', error.message))
  }

  return { written, warnings }
}

const RANK_KEYS = ['rank_at_trade', 'rank_now'] as const

function assetKey(a: Record<string, unknown>): string | null {
  if (a.kind !== 'player') return null
  if (typeof a.player_id === 'string' && a.player_id) return `id:${a.player_id}`
  if (typeof a.name === 'string' && a.name) return `name:${a.name.toLowerCase()}`
  return null
}

function carryRanks(fresh: unknown, stored: Array<Record<string, unknown>> | undefined): unknown {
  if (!Array.isArray(fresh) || !stored?.length) return fresh
  const byKey = new Map<string, Record<string, unknown>>()
  for (const a of stored) {
    const k = assetKey(a)
    if (k) byKey.set(k, a)
  }
  return fresh.map((a) => {
    if (!a || typeof a !== 'object') return a
    const asset = a as Record<string, unknown>
    const k = assetKey(asset)
    const old = k ? byKey.get(k) : undefined
    if (!old) return asset
    let out = asset
    for (const field of RANK_KEYS) {
      if (out[field] == null && typeof old[field] === 'string') out = { ...out, [field]: old[field] }
    }
    return out
  })
}
