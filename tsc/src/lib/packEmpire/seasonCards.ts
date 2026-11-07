// Cards into the Season sim: a lineup's Players become SimCards (seasonSim.ts),
// each with its archetype, its share of the team's chemistry and its real yards a
// catch and a carry for the box score. SERVER ONLY in practice: archetypes.ts reads
// the card-stats file, which the browser never gets.
//
// Chemistry is League's hard chemistry (both of a pair's bond points, real
// teammates double again), split half to each man in the bond, so a QB-WR stack
// lifts exactly the lanes those two play and a line that played together lifts the run.

import { archetypeOf, statsOf } from './archetypes'
import { chemistryFor, type Player } from './rules'
import type { SimCard } from './seasonSim'

export function simCard(p: Player, slot: number, chem = 0): SimCard {
  const s = statsOf(p.id)
  return {
    id: p.id,
    name: p.name,
    pos: p.pos,
    rarity: p.rarity,
    slot,
    value: p.score + chem,
    arch: archetypeOf(p),
    ypr: s?.rec && s.recy ? s.recy / s.rec : undefined,
    ypc: s?.car && s.ry ? s.ry / s.car : undefined,
  }
}

/** An eleven in SLOTS order. Empty slots sit out (a draft not finished yet). */
export function seasonCards(lineup: (Player | null)[]): SimCard[] {
  const men = lineup.filter((p): p is Player => !!p)
  const share = new Map<string, number>()
  for (const b of chemistryFor(men, true).bonds) {
    share.set(b.a, (share.get(b.a) ?? 0) + b.points / 2)
    share.set(b.b, (share.get(b.b) ?? 0) + b.points / 2)
  }
  return lineup.flatMap((p, slot) => (p ? [simCard(p, slot, share.get(p.id) ?? 0)] : []))
}

/** Bench cards: no slot of their own and no chemistry until they start. */
export function benchCards(bench: Player[]): SimCard[] {
  return bench.map((p) => simCard(p, -1))
}
