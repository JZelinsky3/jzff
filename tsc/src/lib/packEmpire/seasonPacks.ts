// The packs a Season deals (League Mode's Season variation). SERVER ONLY: it
// deals through deal.ts. season.ts and scripts/pack-empire-pool/sim/season-sim.ts
// both deal from here, so the sim plays the game's own packs.
//
//   Draft Day   The Franchise Pack off the captain's table on the slot you pick.
//               The other ten are not all alike, and nothing says which is which
//               (Joey, 2026-11-07: "leave anonymous so u dont know, n dont know in
//               the rules either"): three run hot, four are ordinary League packs,
//               three run cold. A team comes out with real strengths and real holes
//               instead of eleven rares, and a cold pack can hand out a common.
//   Bench       BENCH_PACKS packs with no position: five cards, five positions.
//   Each game   The same kind of pack, its odds by how the game went (REWARD_TABLE).

import { dealPack, mixedPack } from './deal'
import { rngFor } from './defenses'
import { LEAGUE_ORDINARY, SLOTS, STANDINGS_WEIGHTS, type Player, type Weights } from './rules'
import type { RewardTier } from './seasonRules'

type Table = { normal: Weights; boosted: Weights }

export const FRANCHISE: Table = { normal: STANDINGS_WEIGHTS.standard_pack, boosted: STANDINGS_WEIGHTS.standard_pack }

// Best card in a pack, off the real pool (4,000 packs each):
//   hot       rare 36%, dynasty 47%, transcendent 15%, immortal 2%
//   ordinary  rare 82%, dynasty 15%, transcendent 3%
//   cold      common 69%, rare 26%, dynasty 4%
// Three of each puts a drafted eleven about 2% above all-ordinary on average,
// spread far wider.
const HOT_BASE: Weights = { common: 24, rare: 14, dynasty: 16, transcendent: 6.5, immortal: 2 }
const HOT: Table = { normal: HOT_BASE, boosted: { ...HOT_BASE, common: 0, rare: 22 } }
const COLD_BASE: Weights = { common: 62, rare: 7, dynasty: 2, transcendent: 0.4, immortal: 0.12 }
const COLD: Table = { normal: COLD_BASE, boosted: COLD_BASE }

export type DraftTier = 'franchise' | 'hot' | 'ordinary' | 'cold'

const SPREAD: DraftTier[] = ['hot', 'hot', 'hot', 'ordinary', 'ordinary', 'ordinary', 'ordinary', 'cold', 'cold', 'cold']

/** Which of a team's slot packs run hot or cold, by slot. Off the team's own
    label (which carries the league's server-only seed), so it never changes and
    nobody can work it out. */
export function draftTiers(label: string, franchise: number): DraftTier[] {
  const rnd = rngFor(`${label}|tiers`)
  const deck = [...SPREAD]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  let k = 0
  return SLOTS.map((_, slot) => (slot === franchise ? 'franchise' : deck[k++]))
}

const DRAFT_TABLE: Record<DraftTier, Table> = { franchise: FRANCHISE, hot: HOT, ordinary: LEAGUE_ORDINARY, cold: COLD }

export function draftPack(label: string, slot: number, franchise: number, exclude: string[]): Player[] {
  const table = DRAFT_TABLE[draftTiers(label, franchise)[slot]]
  return dealPack({ label, slot, base: table.normal, boosted: table.boosted, exclude })
}

/** Every game pays one of these; how good, by how it went (seasonRules.rewardFor).
    The same odds every time for the same tier. */
export const REWARD_TABLE: Record<RewardTier, Table> = {
  league: LEAGUE_ORDINARY,
  starter: FRANCHISE,
  rising: { normal: STANDINGS_WEIGHTS.rising_pack, boosted: STANDINGS_WEIGHTS.rising_pack },
}

export function benchPack(label: string, exclude: string[]): Player[] {
  return mixedPack({ label, base: LEAGUE_ORDINARY.normal, boosted: LEAGUE_ORDINARY.boosted, exclude })
}

export function rewardPack(label: string, tier: RewardTier, exclude: string[]): Player[] {
  const t = REWARD_TABLE[tier]
  return mixedPack({ label, base: t.normal, boosted: t.boosted, exclude })
}

/** The card a CPU keeps from a pack with no position: the biggest step up on
    the weakest man it would start at that position, counting the bench; when
    nothing's a step up, the biggest card. */
export function cpuPick(pack: Player[], roster: Player[], bench: Player[]): Player {
  const gain = (p: Player) => {
    const spots = SLOTS.filter((s) => s.pool === p.pos).length
    const held = [...roster, ...bench].filter((x) => x.pos === p.pos).sort((a, b) => b.score - a.score)
    return p.score - (held[spots - 1]?.score ?? 0)
  }
  return pack.reduce((a, b) => {
    const ga = gain(a)
    const gb = gain(b)
    if (ga > 0 || gb > 0) return gb > ga ? b : a
    return b.score > a.score ? b : a
  })
}
