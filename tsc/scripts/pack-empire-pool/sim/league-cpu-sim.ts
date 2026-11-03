// League Mode CPU, eight regular-season weeks on the real dealer, all on
// standard packs: the weekly score, how many it keeps, and against a drafter
// that takes the biggest number and keeps the biggest number.
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/league-cpu-sim.ts 200
import { dealPack } from '../../../src/lib/packEmpire/deal'
import { cpuDraftPicks, cpuLock, expectedTop } from '../../../src/lib/packEmpire/leagueCpu'
import {
  LEAGUE_BOOSTED,
  LEAGUE_WEIGHTS,
  REGULAR_WEEKS,
  SLOTS,
  SLOT_COUNT,
  chemistryFor,
  lineupScore,
  type Player,
} from '../../../src/lib/packEmpire/rules'

const N = Number(process.argv[2] ?? 200)

const t0 = Date.now()
for (let s = 0; s < SLOT_COUNT; s++) expectedTop('standard_pack', s)
console.log(`odds read in ${Date.now() - t0}ms`)
console.log(SLOTS.map((d, s) => `${d.key} ${expectedTop('standard_pack', s).toFixed(0)}`).join('  '))

function deal(seed: string) {
  return (slot: number, lineup: (Player | null)[]) =>
    dealPack({
      label: `league:${seed}`,
      slot,
      base: LEAGUE_WEIGHTS.standard_pack,
      boosted: LEAGUE_BOOSTED.standard_pack,
      exclude: lineup.filter((p): p is Player => !!p).map((p) => p.id),
    })
}

function season(n: number, naive: boolean) {
  const locks: { slot: number; player: Player }[] = []
  let total = 0
  for (let w = 1; w <= REGULAR_WEEKS; w++) {
    const seed = `sim${naive ? 'n' : 'c'}${n}w${w}`
    const lineup: (Player | null)[] = Array(SLOT_COUNT).fill(null)
    for (const l of locks) lineup[l.slot] = l.player
    const d = deal(seed)
    if (naive) {
      for (let s = 0; s < SLOT_COUNT; s++) {
        if (lineup[s]) continue
        lineup[s] = d(s, lineup).reduce((a, b) => (b.score > a.score ? b : a))
      }
    } else {
      for (const pk of cpuDraftPicks(lineup, d)) lineup[pk.slot] = d(pk.slot, lineup).find((p) => p.id === pk.id)!
    }
    const roster = lineup as Player[]
    total += lineupScore(roster) + chemistryFor(roster).total
    if (w < REGULAR_WEEKS) {
      const taken = new Set(locks.map((l) => l.slot))
      if (naive) {
        const open = roster.map((p, slot) => ({ p, slot })).filter((x) => !taken.has(x.slot))
        const b = open.reduce((a, c) => (c.p.score > a.p.score ? c : a))
        locks.push({ slot: b.slot, player: b.p })
      } else {
        const l = cpuLock(roster, taken)
        if (l) locks.push(l)
      }
    }
  }
  return { total, locks: locks.length }
}

for (const naive of [false, true]) {
  const t = Date.now()
  let sum = 0
  let kept = 0
  for (let n = 0; n < N; n++) {
    const r = season(n, naive)
    sum += r.total
    kept += r.locks
  }
  console.log(
    `${naive ? 'naive' : 'cpu  '}  season ${(sum / N).toFixed(0)}  keepers ${(kept / N).toFixed(1)}  ${((Date.now() - t) / N / REGULAR_WEEKS).toFixed(1)}ms a week`
  )
}
