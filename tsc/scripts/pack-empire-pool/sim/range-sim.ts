// What a Range card's range is worth, off the real dealer: run with
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/range-sim.ts 1500
//
// Each design is a set of widths plus how far the value can sit from the ends.
// Readers: midpoint, top of the range, bottom of the range, and "learned", who
// has worked out what a given range usually hides (the best anyone can do
// without knowing the player). "memory" is a person who half remembers the
// season, value give or take 40%, and only trusts it inside the range: compare
// it with "no range" to see what the range is actually worth to a real player.
//
// Keep the top and the midpoint well apart, and neither close to perfect.
import { POOL } from '../../../src/lib/packEmpire/pool'
import { cardWeight } from '../../../src/lib/packEmpire/pool'
import { newCaptainSeed } from '../../../src/lib/packEmpire/deal'
import { soloPack } from '../../../src/lib/packEmpire/solo'
import {
  POOL_KEYS,
  SLOT_COUNT,
  SOLO_WEIGHTS,
  VALUE_TOP,
  chemistryFor,
  chemistryPreview,
  lineupScore,
  type Player,
} from '../../../src/lib/packEmpire/rules'

const N = Number(process.argv[2] ?? 1500)

type Design = { name: string; widths: number[]; edge: number }

const DESIGNS: Design[] = [
  { name: 'today: 2000, 8-92%', widths: [2000], edge: 0.08 },
  { name: '2000/2500, anywhere', widths: [2000, 2500], edge: 0 },
  { name: '1000-2500, anywhere', widths: [1000, 1500, 2000, 2500], edge: 0 },
  { name: '1400/2000/2500, anywhere', widths: [1400, 2000, 2500], edge: 0 },
  { name: '800/1400/2000/2500, anywhere', widths: [800, 1400, 2000, 2500], edge: 0 },
]

/** Every start a card can print at this width, on the hundreds, value inside. */
function starts(score: number, width: number, edge: number): number[] {
  const lowest = Math.max(0, score - (1 - edge) * width)
  const highest = Math.max(lowest, score - edge * width)
  const first = Math.ceil(lowest / 100) * 100
  const last = Math.floor(highest / 100) * 100
  const out: number[] = []
  for (let lo = first; lo <= last; lo += 100) out.push(Math.max(0, Math.min(lo, VALUE_TOP - width)))
  return out.length ? [...new Set(out)] : [Math.max(0, Math.min(Math.floor(score / 100) * 100, VALUE_TOP - width))]
}

type Printed = { lo: number; hi: number }

function printer(d: Design) {
  const seen = new Map<string, Printed>()
  return (p: Player): Printed => {
    const hit = seen.get(p.id)
    if (hit) return hit
    const width = d.widths[Math.floor(Math.random() * d.widths.length)]
    const list = starts(p.score, width, d.edge)
    const lo = list[Math.floor(Math.random() * list.length)]
    const out = { lo, hi: Math.min(lo + width, VALUE_TOP) }
    seen.set(p.id, out)
    return out
  }
}

/** What a printed range hides on average, by position, across the dealt mix. */
function learned(d: Design) {
  const sum = new Map<string, [number, number]>()
  for (const k of POOL_KEYS) {
    for (const p of POOL[k]) {
      const w = cardWeight(p, SOLO_WEIGHTS.normal)
      for (const width of d.widths) {
        const list = starts(p.score, width, d.edge)
        for (const lo of list) {
          const key = `${k}|${lo}|${width}`
          const at = sum.get(key) ?? [0, 0]
          at[0] += (w * p.score) / list.length
          at[1] += w / list.length
          sum.set(key, at)
        }
      }
    }
  }
  return (p: Player, r: Printed) => {
    const at = sum.get(`${p.pos}|${r.lo}|${r.hi - r.lo}`)
    return at ? at[0] / at[1] : (r.lo + r.hi) / 2
  }
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

type Reader = (p: Player, r: Printed) => number

function draft(seed: string, captain: number, read: (p: Player) => number) {
  const taken: string[] = []
  const roster: Player[] = []
  let hit = 0
  for (let s = 0; s < SLOT_COUNT; s++) {
    const pack = soloPack(seed, captain, s, taken)
    const score = (p: Player) => read(p) + chemistryPreview(p, roster, true)
    const pick = pack.reduce((a, b) => (score(b) > score(a) ? b : a))
    if (pick.score === Math.max(...pack.map((p) => p.score))) hit++
    taken.push(pick.id)
    roster.push(pick)
  }
  return { total: lineupScore(roster) + chemistryFor(roster, true).total, hit }
}

const seeds = Array.from({ length: N }, (_, i) => {
  const captain = [0, 1, 2, 5, 8][i % 5]
  return { captain, seed: newCaptainSeed(captain, 'range') }
})

function line(name: string, read: (p: Player) => number, perfect: number) {
  const runs = seeds.map((s) => draft(s.seed, s.captain, read))
  const med = median(runs.map((r) => r.total))
  const hit = runs.reduce((sum, r) => sum + r.hit, 0) / (runs.length * SLOT_COUNT)
  console.log(`  ${name.padEnd(22)} ${String(med).padStart(6)}   ${String(Math.round((med / perfect) * 100)).padStart(3)}% of perfect   best card ${Math.round(hit * 100)}% of packs`)
  return med
}

const perfect = median(seeds.map((s) => draft(s.seed, s.captain, (p) => p.score).total))
console.log(`Builder, ${N} runs. Perfect ${perfect}`)
const noisy = new Map<string, number>()
const remembered = (p: Player) => {
  let v = noisy.get(p.id)
  if (v == null) {
    v = p.score * (0.6 + 0.8 * Math.random())
    noisy.set(p.id, v)
  }
  return v
}
line('no range, memory', remembered, perfect)
line('blind guess', () => Math.random(), perfect)

for (const d of DESIGNS) {
  console.log(`\n${d.name}`)
  const print = printer(d)
  const hidden = learned(d)
  const via = (r: Reader) => (p: Player) => r(p, print(p))
  line('midpoint', via((_, r) => (r.lo + r.hi) / 2), perfect)
  line('top of range', via((_, r) => r.hi), perfect)
  line('bottom of range', via((_, r) => r.lo), perfect)
  line('learned', via(hidden), perfect)
  line('memory, inside range', via((p, r) => Math.max(r.lo, Math.min(r.hi, remembered(p)))), perfect)
}
