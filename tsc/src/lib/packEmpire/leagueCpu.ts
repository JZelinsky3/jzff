// League Mode's CPU teams: how one plays its week. No difficulties: it drafts
// the best team it can and keeps the best man it can, off nothing a person
// couldn't see.
//
//   It places its Standings Pack before the first pack, where that pack lifts
//   the slot most on average (and the week's twist, if it's on a position),
//   never on what this week's packs hold.
//   It opens one pack at a time and takes the card worth most to the lineup it
//   has so far: what he counts for under the week's twist plus the chemistry he
//   brings with the men already in. Packs it hasn't opened don't exist to it.
//   With a mulligan, it throws back the first pack whose best card is well
//   under what that pack usually holds, the way a person would.
//   Its keeper is the man furthest above what his slot usually pulls, and only
//   if he is above it at all. Next week's seed isn't dealt until next week's
//   draft starts, so there is nothing to peek at even by accident.
//
// Pure: the packs come in through `deal`, so the sim runs it on the real dealer.

import { dealPack } from './deal'
import { weekCardValue, weekChemPreview, weekRule } from './leagueWeek'
import {
  LEAGUE_ORDINARY,
  SLOTS,
  SLOT_COUNT,
  STANDINGS_WEIGHTS,
  type PackTier,
  type Player,
} from './rules'

/** Enough draws to read an average off; the same deck every time. */
const READ_DRAWS = 300

/** A pack whose best card is under this share of the usual goes back. */
const MULLIGAN_BAR = 0.6

const topCache = new Map<string, number>()

/** An ordinary pack, or a Standings Pack of a tier. */
export type Table = 'ordinary' | PackTier

/** What the best card in a pack at this slot is worth on average, off this
    table. Off its own throwaway labels, so it is the odds and nothing else.
    Read once per position: the three receiver slots deal off one pool. */
export function expectedTop(table: Table, slot: number): number {
  const pool = SLOTS[slot]?.pool
  if (!pool) return 0
  const key = `${table}:${pool}`
  const hit = topCache.get(key)
  if (hit != null) return hit
  const first = SLOTS.findIndex((s) => s.pool === pool)
  const odds = table === 'ordinary' ? LEAGUE_ORDINARY : { normal: STANDINGS_WEIGHTS[table], boosted: STANDINGS_WEIGHTS[table] }
  let sum = 0
  for (let i = 0; i < READ_DRAWS; i++) {
    const pack = dealPack({
      label: `cpu-read:${table}:${i}`,
      slot: first,
      base: odds.normal,
      boosted: odds.boosted,
      exclude: [],
    })
    sum += pack.reduce((m, p) => Math.max(m, p.score), 0)
  }
  const avg = sum / READ_DRAWS
  topCache.set(key, avg)
  return avg
}

/** What the twist does to a whole position, when it's a position twist. */
function slotMult(ruleId: string | null, slot: number): number {
  const rule = weekRule(ruleId)
  if (!rule.mult || rule.hint !== 'pos') return 1
  return rule.mult({ pos: SLOTS[slot].pool, team: '', rarity: 'common' })
}

/** Where the Standings Pack does the most: the open slot it lifts furthest. */
export function cpuBoostSlot(tier: PackTier, open: number[], ruleId: string | null = null): number {
  const doubled = weekRule(ruleId).captainMult ?? 1
  let best = open[0] ?? 0
  let lift = -Infinity
  for (const s of open) {
    const m = slotMult(ruleId, s)
    const l = expectedTop(tier, s) * m * doubled - expectedTop('ordinary', s) * m
    if (l > lift) {
      lift = l
      best = s
    }
  }
  return best
}

export type CpuWeek = {
  picks: { slot: number; id: string }[]
  /** Every pack opened, by slot, as the draft row keeps them. */
  packs: Record<number, Player[]>
  mulliganSlot: number | null
  thrown: Player[] | null
}

/**
 * The week's draft. `lineup` comes in with the carried locks in it; every
 * open slot gets one pack, in lineup order, and `deal` is handed the lineup
 * as it stands when that pack is opened. `redeal` is the mulligan: the same
 * slot, fresh, without the men just thrown back.
 */
export function cpuDraft({
  lineup,
  packSlot,
  tier,
  ruleId,
  mulligan,
  deal,
  redeal,
}: {
  lineup: (Player | null)[]
  packSlot: number
  tier: PackTier
  ruleId: string | null
  mulligan: boolean
  deal: (slot: number, lineup: (Player | null)[]) => Player[]
  redeal: (slot: number, lineup: (Player | null)[], thrown: Player[]) => Player[]
}): CpuWeek {
  const now = [...lineup]
  const out: CpuWeek = { picks: [], packs: {}, mulliganSlot: null, thrown: null }
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (now[slot]) continue
    let pack = deal(slot, now)
    if (!pack.length) continue
    const usual = expectedTop(slot === packSlot ? tier : 'ordinary', slot)
    if (mulligan && out.mulliganSlot == null && Math.max(...pack.map((p) => p.score)) < usual * MULLIGAN_BAR) {
      out.mulliganSlot = slot
      out.thrown = pack
      pack = redeal(slot, now, pack)
      if (!pack.length) continue
    }
    out.packs[slot] = pack
    const roster = now.filter((p): p is Player => !!p)
    const worth = (p: Player) => weekCardValue(ruleId, p, slot === packSlot) + weekChemPreview(ruleId, p, roster)
    const card = pack.reduce((a, b) => (worth(b) > worth(a) ? b : a))
    now[slot] = card
    out.picks.push({ slot, id: card.id })
  }
  return out
}

/** The keeper: the man furthest above what his slot usually pulls from an
    ordinary pack. Nobody, if every man on the roster is at or under it. */
export function cpuLock(roster: (Player | null)[], lockedSlots: Set<number>): { slot: number; player: Player } | null {
  let pick: { slot: number; player: Player } | null = null
  let edge = 0
  roster.forEach((p, slot) => {
    if (!p || lockedSlots.has(slot)) return
    const e = p.score - expectedTop('ordinary', slot)
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
