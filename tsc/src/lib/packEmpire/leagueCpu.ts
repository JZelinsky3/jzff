// League Mode's CPU teams: how one plays its week. No difficulties: it drafts
// the best team it can and keeps the best man it can, off nothing a person
// couldn't see.
//
//   It chooses its boosted slot before the first pack, on what a boost is
//   worth at each position on average, never on what this week's packs hold.
//   It opens one pack at a time and takes the card worth most to the lineup it
//   has so far: his accolades plus the chemistry he brings with the men
//   already in it. Packs it hasn't opened don't exist to it yet.
//   Its keeper is the man furthest above what that slot usually pulls, and
//   only if he is above it at all. Next week's seed isn't dealt until next
//   week's draft starts, so there is nothing to peek at even by accident.
//
// Pure: the packs come in through `deal`, so the sim runs it on the real dealer.

import { dealPack } from './deal'
import {
  LEAGUE_BOOSTED,
  LEAGUE_WEIGHTS,
  SLOTS,
  SLOT_COUNT,
  chemistryPreview,
  type PackTier,
  type Player,
} from './rules'

/** Enough draws to read an average off; the same deck every time. */
const READ_DRAWS = 300

const topCache = new Map<string, number>()

/** What the best card in a pack at this slot is worth on average, at this
    tier. Off its own throwaway labels, so it is the odds and nothing else.
    Read once per position: the three receiver slots deal off one pool. */
export function expectedTop(tier: PackTier, slot: number): number {
  const pool = SLOTS[slot]?.pool
  if (!pool) return 0
  const key = `${tier}:${pool}`
  const hit = topCache.get(key)
  if (hit != null) return hit
  const first = SLOTS.findIndex((s) => s.pool === pool)
  let sum = 0
  for (let i = 0; i < READ_DRAWS; i++) {
    const pack = dealPack({
      label: `cpu-read:${tier}:${i}`,
      slot: first,
      base: LEAGUE_WEIGHTS[tier],
      boosted: LEAGUE_BOOSTED[tier],
      exclude: [],
    })
    sum += pack.reduce((m, p) => Math.max(m, p.score), 0)
  }
  const avg = sum / READ_DRAWS
  topCache.set(key, avg)
  return avg
}

/** Where the boosted pack does the most: the open slot it lifts furthest. */
export function cpuBoostSlot(tier: PackTier, open: number[]): number {
  if (tier === 'standard_pack' || !open.length) return -1
  let best = open[0]
  let lift = -Infinity
  for (const s of open) {
    const l = expectedTop(tier, s) - expectedTop('standard_pack', s)
    if (l > lift) {
      lift = l
      best = s
    }
  }
  return best
}

/**
 * The week's draft. `lineup` comes in with the carried locks in it; every
 * open slot gets one pack, in lineup order, and `deal` is handed the lineup
 * as it stands when that pack is opened, the same way a person's draft is
 * replayed. Returns the picks in the order made.
 */
export function cpuDraftPicks(
  lineup: (Player | null)[],
  deal: (slot: number, lineup: (Player | null)[]) => Player[]
): { slot: number; id: string }[] {
  const now = [...lineup]
  const picks: { slot: number; id: string }[] = []
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (now[slot]) continue
    const pack = deal(slot, now)
    if (!pack.length) continue
    const roster = now.filter((p): p is Player => !!p)
    const worth = (p: Player) => p.score + chemistryPreview(p, roster)
    const card = pack.reduce((a, b) => (worth(b) > worth(a) ? b : a))
    now[slot] = card
    picks.push({ slot, id: card.id })
  }
  return picks
}

/** The keeper: the man furthest above what his slot usually pulls from a
    standard pack. Nobody, if every man on the roster is at or under it. */
export function cpuLock(roster: (Player | null)[], lockedSlots: Set<number>): { slot: number; player: Player } | null {
  let pick: { slot: number; player: Player } | null = null
  let edge = 0
  roster.forEach((p, slot) => {
    if (!p || lockedSlots.has(slot)) return
    const e = p.score - expectedTop('standard_pack', slot)
    if (e > edge) {
      edge = e
      pick = { slot, player: p }
    }
  })
  return pick
}

/** Made up, every one. A league never uses the same one twice. */
export const CPU_TEAM_NAMES = [
  'Bay Street Barons',
  'Cold Creek Coyotes',
  'Copper Hill Miners',
  'Dune Road Drifters',
  'East End Anvils',
  'Fairground Foxes',
  'Granite Gulls',
  'Harbor Light Haulers',
  'High Plains Hawks',
  'Iron Bridge Hammers',
  'Juniper Junction',
  'Kettle River Kings',
  'Lakeshore Lumberjacks',
  'Mill Town Mallards',
  'North Pier Pilots',
  'Old Mill Owls',
  'Pine Ridge Rovers',
  'Quarry Road Quakes',
  'Redwater Rustlers',
  'Salt Flat Stallions',
  'Timberline Tusks',
  'Union Yard Wolves',
  'Valley Forge Vandals',
  'Westgate Wranglers',
]

export function cpuTeamName(taken: Set<string>): string {
  const free = CPU_TEAM_NAMES.filter((n) => !taken.has(n))
  if (free.length) return free[Math.floor(Math.random() * free.length)]
  let n = 2
  while (taken.has(`CPU ${n}`)) n++
  return `CPU ${n}`
}
