// Greedy Empire Builder runs off the real dealer: captain on each slot in turn,
// open in slot order, keep the best card in every pack.
import { newCaptainSeed } from '../../../src/lib/packEmpire/deal'
import { soloPack } from '../../../src/lib/packEmpire/solo'
import { POOL } from '../../../src/lib/packEmpire/pool'
import { SLOT_COUNT, TIERS, tierFor, packOdds, SOLO_WEIGHTS, RARITIES, POOL_KEYS } from '../../../src/lib/packEmpire/rules'

const N = Number(process.argv[2] ?? 3000)
const scores: number[] = []
const byCap: number[][] = Array.from({ length: SLOT_COUNT }, () => [])
for (let i = 0; i < N; i++) {
  const captain = i % SLOT_COUNT
  const seed = newCaptainSeed(captain)
  const taken: string[] = []
  let total = 0
  for (let s = 0; s < SLOT_COUNT; s++) {
    const pack = soloPack(seed, captain, s, taken)
    const best = pack.reduce((a, b) => (b.score > a.score ? b : a))
    taken.push(best.id)
    total += best.score
  }
  scores.push(total)
  byCap[captain].push(total)
}
scores.sort((a, b) => a - b)
const q = (p: number) => scores[Math.floor(p * (scores.length - 1))]
console.log(`runs ${N}  p10 ${q(0.1)}  p25 ${q(0.25)}  median ${q(0.5)}  p75 ${q(0.75)}  p90 ${q(0.9)}  p99 ${q(0.99)}  max ${scores[scores.length - 1]}`)
for (const t of TIERS) {
  const n = scores.filter((s) => tierFor(s) === t).length
  console.log(`  ${t.label.padEnd(20)} ${(100 * n / N).toFixed(1)}%`)
}
const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)]
console.log('median by captain slot', byCap.map(med).join(' '))
for (const k of POOL_KEYS) {
  const o = packOdds(POOL[k], SOLO_WEIGHTS.normal)
  console.log(k.padEnd(3), POOL[k].length, RARITIES.map((r) => `${r.slice(0, 3)} ${(o[r] * 100).toFixed(1)}%`).join('  '))
}
