// Salary Cap, Classic against Mystery, on the real dealer: what's left of the budget at
// the end, what the eleven are, and the score. The chooser weighs value against price
// and keeps enough back to sign someone in every pack still to come.
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/cap-mystery-sim.ts 3000 [budget] [table]
import { mysteryPack, mysterySlot, newCaptainSeed, newMysterySeed, salaryOf } from '../../../src/lib/packEmpire/deal'
import { soloPack } from '../../../src/lib/packEmpire/solo'
import { RARITIES, SALARY_CAP, SLOT_COUNT, type Player } from '../../../src/lib/packEmpire/rules'

const N = Number(process.argv[2] ?? 2000)
const BUDGET = Number(process.argv[3] ?? SALARY_CAP.own)

const GREEDY = process.argv[4] === 'greedy'

function choose(usable: Player[], left: number, packsLeft: number): Player {
  if (GREEDY) {
    const pay = usable.filter((c) => salaryOf(c) <= left)
    if (!pay.length) return usable.reduce((a, b) => (salaryOf(b) < salaryOf(a) ? b : a))
    return pay.reduce((a, b) => (b.score > a.score ? b : a))
  }
  const keep = Math.max(0, packsLeft - 1) * 3 // a little back for each pack after this one
  const pay = usable.filter((c) => salaryOf(c) <= left - keep)
  if (!pay.length) return usable.reduce((a, b) => (salaryOf(b) < salaryOf(a) ? b : a))
  return pay.reduce((a, b) => (b.score - 4 * salaryOf(b) > a.score - 4 * salaryOf(a) ? b : a))
}

function summary(label: string, runs: { left: number; score: number; kept: Player[]; outAt?: number | null }[]) {
  const lefts = runs.map((r) => r.left).sort((a, b) => a - b)
  const mix = Object.fromEntries(RARITIES.map((r) => [r, 0]))
  for (const run of runs) for (const c of run.kept) mix[c.rarity]++
  const total = runs.length * SLOT_COUNT
  const scores = runs.map((r) => r.score).sort((a, b) => a - b)
  const outAt = runs.map((r) => r.outAt).filter((x) => x != null).sort((a, b) => a - b)
  if (outAt.length) console.log(`  budget gone by pick ${outAt[outAt.length >> 1]} (median) in ${Math.round((outAt.length / runs.length) * 100)}% of runs`)
  console.log(`${label}: left median $${lefts[lefts.length >> 1]}M, 20M+ left in ${Math.round((lefts.filter((x) => x >= 20).length / runs.length) * 100)}% | score median ${scores[scores.length >> 1]} | kept ${RARITIES.map((r) => `${r.slice(0, 4)} ${((mix[r] / total) * 100).toFixed(1)}%`).join(' ')}`)
}

const classic = []
for (let i = 0; i < N; i++) {
  const captain = i % SLOT_COUNT
  const seed = newCaptainSeed(captain, 'cap')
  let left = BUDGET
  let out: number | null = null
  const kept: Player[] = []
  for (let s = 0; s < SLOT_COUNT; s++) {
    const pack = soloPack(seed, captain, s, kept.map((k) => k.id))
    const c = choose(pack, left, SLOT_COUNT - s)
    left -= salaryOf(c) <= left ? salaryOf(c) : 0
    kept.push(c)
    if (out == null && left < 5) out = s + 1
  }
  classic.push({ left, score: kept.reduce((a, c) => a + c.score, 0), kept, outAt: out })
}
summary(`Classic cap $${BUDGET}M`, classic)

const mystery = []
for (let i = 0; i < N; i++) {
  const captain = i % SLOT_COUNT
  const seed = newMysterySeed(captain, 'cap')
  let left = BUDGET
  let out: number | null = null
  const picks: { slot: number; id: string }[] = []
  const kept: Player[] = []
  for (let n = 0; n < SLOT_COUNT; n++) {
    const { cards } = mysteryPack(seed, captain, picks)
    const usable = cards.filter((c) => mysterySlot(captain, picks, c.pos) >= 0)
    const c = choose(usable, left, SLOT_COUNT - n)
    left -= salaryOf(c) <= left ? salaryOf(c) : 0
    picks.push({ slot: mysterySlot(captain, picks, c.pos), id: c.id })
    kept.push(c)
    if (out == null && left < 5) out = n + 1
  }
  mystery.push({ left, score: kept.reduce((a, c) => a + c.score, 0), kept, outAt: out })
}
summary(`Mystery cap $${BUDGET}M`, mystery)
