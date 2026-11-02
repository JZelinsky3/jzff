// How often a Canton turns up, off the real dealer: per ordinary pack, per captain
// pack, per Builder run (Classic and Mystery), and which ones.
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/canton-odds.ts 40000
import { mysteryPack, mysterySlot, newCaptainSeed, newMysterySeed } from '../../../src/lib/packEmpire/deal'
import { soloPack } from '../../../src/lib/packEmpire/solo'
import { SLOTS, SLOT_COUNT, type Player } from '../../../src/lib/packEmpire/rules'

const N = Number(process.argv[2] ?? 20000)
const isC = (p: Player) => p.rarity === 'canton'
const isI = (p: Player) => p.rarity === 'immortal'
let ord = 0, ordC = 0, cap = 0, capC = 0, runsC = 0, runsI = 0
const capByPos = new Map<string, [number, number]>()
const which = new Map<string, number>()
for (let i = 0; i < N; i++) {
  const captain = i % SLOT_COUNT
  const seed = newCaptainSeed(captain)
  const taken: string[] = []
  let sawC = false, sawI = false
  for (let s = 0; s < SLOT_COUNT; s++) {
    const pack = soloPack(seed, captain, s, taken)
    const hasC = pack.some(isC)
    pack.filter(isC).forEach((p) => which.set(p.name, (which.get(p.name) ?? 0) + 1))
    if (s === captain) {
      cap++; if (hasC) capC++
      const k = SLOTS[s].pool; const r = capByPos.get(k) ?? [0, 0]; r[0]++; if (hasC) r[1]++; capByPos.set(k, r)
    } else { ord++; if (hasC) ordC++ }
    sawC ||= hasC; sawI ||= pack.some(isI)
    taken.push(pack.reduce((a, b) => (b.score > a.score ? b : a)).id)
  }
  if (sawC) runsC++
  if (sawI) runsI++
}
let mRuns = 0
const M = Math.floor(N / 2)
for (let i = 0; i < M; i++) {
  const captain = i % SLOT_COUNT
  const seed = newMysterySeed(captain)
  const picks: { slot: number; id: string }[] = []
  let saw = false
  for (let n = 0; n < SLOT_COUNT; n++) {
    const { cards } = mysteryPack(seed, captain, picks)
    saw ||= cards.some(isC)
    const ok = cards.filter((c) => mysterySlot(captain, picks, c.pos) >= 0)
    const c = ok.reduce((a, b) => (b.score > a.score ? b : a))
    picks.push({ slot: mysterySlot(captain, picks, c.pos), id: c.id })
  }
  if (saw) mRuns++
}
const one = (a: number, b: number) => (b ? `1 in ${Math.round(a / b).toLocaleString()}` : 'none')
console.log(`Classic runs ${N}: a Canton in sight ${one(N, runsC)} runs (any Immortal+ ${one(N, runsI)})`)
console.log(`  ordinary pack ${one(ord, ordC)}, captain pack ${one(cap, capC)}`)
for (const [k, [n, c]] of capByPos) console.log(`    captain ${k}: ${one(n, c)}`)
console.log(`Mystery runs ${M}: a Canton in sight ${one(M, mRuns)}`)
console.log('which:', [...which].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(', '))
