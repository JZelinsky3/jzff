// What a Versus deal looks like and how the CPU stacks up against people, on the real
// dealer and the real CPU:
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/versus-sim.ts 800
//
// "Top card" takes the biggest number and ignores everything else. "Reader" weighs
// chemistry and the Battles too, the way a good drafter does. Check this after any
// change to a Versus table, the ceiling, or CPU_SKILL.
;(globalThis as { WebSocket?: unknown }).WebSocket ??= class {}
import { battlesFrom, drawBattles, settleBattles } from '../../../src/lib/packEmpire/battles'
import { CPU_SKILL, newEvenSeed, newVersusSeed, priced, readSeed } from '../../../src/lib/packEmpire/deal'
import { RARITIES, SALARY_CAP, SLOT_COUNT, chemistryPreview, signingPrice, type Difficulty, type Player } from '../../../src/lib/packEmpire/rules'
import { replaySolo, seedPack } from '../../../src/lib/packEmpire/solo'
import { cpuDraft } from '../../../src/lib/packEmpire/versus'
import { randomInt } from 'node:crypto'

const N = Number(process.argv[2] ?? 500)
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const quant = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)]
const line = (a: number[]) => `median ${quant(a, 0.5)} | p90 ${quant(a, 0.9)} | p99 ${quant(a, 0.99)} | max ${Math.max(...a)}`

/** One person's draft of a seed, in the CPU's own terms: it can weigh chemistry and Battles or not. */
function person(seed: string, ids: string[], reads: boolean) {
  const parsed = readSeed(seed)!
  const battles = battlesFrom(ids)
  const taken: string[] = []
  const roster: Player[] = []
  const picks: { slot: number; id: string }[] = []
  const capped = parsed.diff === 'cap'
  let left: number = parsed.even ? SALARY_CAP.shared : SALARY_CAP.own
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const pack = capped ? seedPack(seed, parsed, slot, taken).map(priced) : seedPack(seed, parsed, slot, taken)
    const onTable = capped ? pack.filter((p) => signingPrice(p, pack, left) != null) : pack
    const worth = (p: Player) => p.score + (reads ? chemistryPreview(p, roster, true) + 700 * battles.reduce((s, b) => s + b.lean(p, roster), 0) - (capped ? 70 * (p.salary ?? 0) : 0) : 0)
    const best = onTable.reduce((a, b) => (worth(b) > worth(a) ? b : a))
    if (capped) left -= signingPrice(best, pack, left) ?? 0
    taken.push(best.id)
    roster.push(best)
    picks.push({ slot, id: best.id })
  }
  const run = replaySolo(seed, picks)
  if (!run.ok) throw new Error(run.error)
  return run
}

function evenTable(diff: Difficulty) {
  let lone = 0
  let packs = 0
  let top2 = 0
  let immortals = 0
  const base: number[] = []
  const tops: Record<string, number> = {}
  for (let i = 0; i < N; i++) {
    const seed = newEvenSeed(diff)
    const parsed = readSeed(seed)!
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const pack = [...seedPack(seed, parsed, slot, [])].sort((a, b) => b.score - a.score)
      packs++
      const rank = (p: Player) => RARITIES.indexOf(p.rarity)
      if (rank(pack[0]) !== rank(pack[1])) lone++
      top2 += pack[0].score - pack[1].score
      tops[pack[0].rarity] = (tops[pack[0].rarity] ?? 0) + 1
      immortals += pack.filter((p) => rank(p) >= 4).length
    }
    base.push(person(seed, [], false).base)
  }
  console.log(`Even deal, top card, cards alone: ${line(base)}`)
  console.log(`  one card alone at the top rarity: ${pct(lone / packs)} of packs | gap, best to second best: ${Math.round(top2 / packs)} | immortals a game ${(immortals / N).toFixed(2)}`)
  console.log(`  best card in a pack: ${RARITIES.filter((r) => tops[r]).map((r) => `${r} ${pct(tops[r] / packs)}`).join(' ')}`)
}

function versusCpu(diff: Difficulty, even: boolean) {
  const out: Record<string, { w: number; t: number; l: number; you: number[]; cpu: number[] }> = {}
  for (const who of ['top', 'reader']) out[who] = { w: 0, t: 0, l: 0, you: [], cpu: [] }
  for (let i = 0; i < N; i++) {
    const ids = even ? drawBattles(randomInt) : []
    const yours = even ? newEvenSeed(diff) : newVersusSeed(randomInt(6), diff)
    const theirs = even ? yours : newVersusSeed(randomInt(6), diff)
    const cpu = cpuDraft(theirs, ids.length ? ids : null)
    if (!cpu) continue
    for (const who of ['top', 'reader']) {
      const run = person(yours, ids, who === 'reader')
      const paid = ids.length ? settleBattles(ids, run.lineup, cpu.lineup) : { host: 0, guest: 0 }
      const a = run.score + paid.host
      const b = cpu.score + paid.guest
      const row = out[who]
      row.you.push(a)
      row.cpu.push(b)
      if (a > b) row.w++
      else if (a === b) row.t++
      else row.l++
    }
  }
  for (const who of ['top', 'reader']) {
    const r = out[who]
    const n = r.you.length
    console.log(`  ${(even ? 'Even' : 'Classic').padEnd(8)}${diff.padEnd(7)} ${who.padEnd(7)} beats the CPU ${pct(r.w / n).padStart(6)}  ties ${pct(r.t / n).padStart(6)}  loses ${pct(r.l / n).padStart(6)}  | you ${quant(r.you, 0.5)} cpu ${quant(r.cpu, 0.5)}`)
  }
}

evenTable('open')
const base = Array.from({ length: N }, () => person(newVersusSeed(randomInt(6), 'open'), [], false).base)
console.log(`Classic Versus seat, top card: ${line(base)}`)
const grid = process.argv[3]
if (grid) {
  for (const cell of grid.split(',')) {
    const [misread, chem] = cell.split('/').map(Number)
    CPU_SKILL.open = { misread, chem }
    CPU_SKILL.cap = { misread, chem }
    console.log(`misread ${misread} chem ${chem}:`)
    versusCpu('open', true)
  }
} else {
  console.log('Against the CPU:')
  for (const d of ['open', 'cap'] as Difficulty[]) for (const even of [true, false]) versusCpu(d, even)
}
