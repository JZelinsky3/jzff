// The packs a Season deals (League Mode's Season variation). SERVER ONLY: it
// deals through deal.ts. season.ts and scripts/pack-empire-pool/sim/season-sim.ts
// both deal from here, so the sim plays the game's own packs.
//
//   Draft Day   The Franchise Pack off the captain's table on the slot you pick.
//               The other ten are not all alike, and nothing says which is which
//               (Joey, 2026-11-07: "leave anonymous so u dont know, n dont know in
//               the rules either"): three run hot, four are middling, three run
//               cold. A team comes out with real strengths and real holes instead
//               of eleven rares, and a cold pack usually hands out a common.
//   Bench       BENCH_PACKS packs with no position: five cards, five positions.
//   Each game   The same kind of pack, its odds by how the game went (REWARD_TABLE).

import { archetypeOf } from './archetypes'
import { dealPack, drawCards, mixedPack } from './deal'
import { rngFor } from './defenses'
import { LEAGUE_ORDINARY, POOL_KEYS, SLOTS, STANDINGS_WEIGHTS, type Player, type Rarity, type Weights } from './rules'
import { POOL } from './pool'
import { STYLE_LOOK, type PackFocus, type PackStyle, type RewardTier } from './seasonRules'
import { planTags } from './seasonSim'

type Table = { normal: Weights; boosted: Weights }

export const FRANCHISE: Table = { normal: STANDINGS_WEIGHTS.standard_pack, boosted: STANDINGS_WEIGHTS.standard_pack }

// Each pack is good or bad as a whole, not one card in five (Joey, 2026-11-07:
// "80% of the packs were 4 common n 1 non common... the whole pack should be
// buffed or bad"), so no boosted card. Off the real pool, 3,000 packs each:
//   hot       a card: rare 82%, dynasty 12%, common 4%; a pack: no common 82%,
//             one 17%; its best: rare 44%, dynasty 44%, transcendent 11%
//   ordinary  a card: common 45%, rare 50%, dynasty 5%; best: rare 73%,
//             dynasty 22%, transcendent 3%
//   cold      a card: common 96%; best: common 80%, rare 18%
const HOT_BASE: Weights = { common: 1, rare: 40, dynasty: 12, transcendent: 5, immortal: 1.2 }
const ORDINARY_BASE: Weights = { common: 12, rare: 24, dynasty: 5, transcendent: 1.2, immortal: 0.3 }
const COLD_BASE: Weights = { common: 30, rare: 2.4, dynasty: 0.3, transcendent: 0.05, immortal: 0.01 }
const HOT: Table = { normal: HOT_BASE, boosted: HOT_BASE }
const ORDINARY: Table = { normal: ORDINARY_BASE, boosted: ORDINARY_BASE }
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

const DRAFT_TABLE: Record<DraftTier, Table> = { franchise: FRANCHISE, hot: HOT, ordinary: ORDINARY, cold: COLD }

/** A slot's pack. `special` is what the chosen slot deals off instead of the
    Franchise table: next season's Standings Pack. */
export function draftPack(label: string, slot: number, franchise: number, exclude: string[], special: Weights | null = null): Player[] {
  const table = slot === franchise && special ? { normal: special, boosted: special } : DRAFT_TABLE[draftTiers(label, franchise)[slot]]
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

/** Every card in the pool that fits a play style, built once per style. */
const STYLE_CARDS = new Map<PackStyle, Player[]>()
function styleCards(style: PackStyle): Player[] {
  let got = STYLE_CARDS.get(style)
  if (!got) {
    const tags = new Set<string>(planTags(STYLE_LOOK[style].plan))
    got = POOL_KEYS.flatMap((k) => POOL[k]).filter((p) => tags.has(archetypeOf(p).tag))
    STYLE_CARDS.set(style, got)
  }
  return got
}

/**
 * A game's pack. With a focus, two or three of its five cards (the seed says
 * which) are that position or fit that play style, on the same odds; the rest
 * are any position, as ever. Dealt when it's opened, so the focus is chosen first.
 */
export function rewardPack(label: string, tier: RewardTier, exclude: string[], focus: PackFocus | null = null): Player[] {
  const t = REWARD_TABLE[tier]
  if (!focus) return mixedPack({ label, base: t.normal, boosted: t.boosted, exclude })
  const rnd = rngFor(`${label}|focus`)
  const n = rnd() < 0.5 ? 2 : 3
  const pool = focus.kind === 'pos' ? POOL[focus.pos] : styleCards(focus.style)
  const fitted = drawCards({ label: `${label}|focus`, cards: pool, weights: t.normal, exclude, n })
  const rest = mixedPack({ label, base: t.normal, boosted: t.boosted, exclude: [...exclude, ...fitted.map((p) => p.id)] })
    .filter((p) => focus.kind !== 'pos' || p.pos !== focus.pos)
    .slice(0, 5 - fitted.length)
  const out = [...fitted, ...rest]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A trade: three bench cards of one rarity in, three cards of the next rarity
    up out, five positions dealt and the first three of that rarity kept, so you
    choose one (Joey, 2026-11-07: so cards down the rarities don't just sit). */
export const TRADE_IN = 3
export const TRADE_OUT = 3

export function tradePack(label: string, rarity: Rarity, exclude: string[]): Player[] {
  const only = { common: 0, rare: 0, dynasty: 0, transcendent: 0, immortal: 0, [rarity === 'canton' ? 'immortal' : rarity]: 1 } as Weights
  const dealt = mixedPack({ label, base: only, boosted: only, exclude })
  const right = dealt.filter((p) => p.rarity === rarity)
  return [...right, ...dealt.filter((p) => p.rarity !== rarity)].slice(0, TRADE_OUT)
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
