// Where the CPU lands on the blind modes, against someone who knows every value:
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/cpu-sim.ts 600
//
// Real people on the Daily score about 83% of a perfect draft on Range and 72%
// on Ball Knower (pe_daily_runs, 2026-10-31, 7 runs each). That's "average".
// Each row is a grid point of misread (how far out a read can be) and chem (how
// much of the chemistry on offer it sees).
import { CPU_SKILL, cpuEye, evenPacks, newCaptainSeed, newEvenSeed, rangeOf } from '../../../src/lib/packEmpire/deal'
import { soloPack } from '../../../src/lib/packEmpire/solo'
import { SLOT_COUNT, chemistryFor, chemistryPreview, lineupScore, type Player } from '../../../src/lib/packEmpire/rules'

const N = Number(process.argv[2] ?? 600)
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

type Table = { next: (slot: number, taken: string[]) => Player[] }

function table(even: boolean, diff: 'range' | 'season', i: number): Table {
  if (even) {
    const packs = evenPacks(newEvenSeed(diff))
    return { next: (slot) => packs[slot] }
  }
  const captain = [0, 1, 2, 5, 8][i % 5]
  const seed = newCaptainSeed(captain, diff)
  return { next: (slot, taken) => soloPack(seed, captain, slot, taken) }
}

function draft(t: Table, read: (p: Player) => number, chem: number) {
  const taken: string[] = []
  const roster: Player[] = []
  for (let s = 0; s < SLOT_COUNT; s++) {
    const pack = t.next(s, taken)
    const worth = (p: Player) => read(p) + chem * chemistryPreview(p, roster, true)
    const pick = pack.map((p) => ({ p, w: worth(p) })).reduce((a, b) => (b.w > a.w ? b : a)).p
    taken.push(pick.id)
    roster.push(pick)
  }
  return lineupScore(roster) + chemistryFor(roster, true).total
}

const swing = (m: number) => Math.exp(m * (2 * Math.random() - 1))

for (const even of [false, true]) {
  for (const diff of ['range', 'season'] as const) {
    const tables = Array.from({ length: N }, (_, i) => table(even, diff, i))
    const perfect = median(tables.map((t) => draft(t, (p) => p.score, 1)))
    console.log(`\n${even ? 'Even' : 'Classic'} ${diff}: perfect ${perfect}`)
    const real = median(tables.map((t, i) => draft(t, cpuEye(`CPU${i}`, diff), CPU_SKILL[diff]?.chem ?? 1)))
    console.log(`  CPU_SKILL as set: ${real} (${Math.round((real / perfect) * 100)}%)`)
    if (process.argv[3] !== 'grid') continue
    for (const m of diff === 'range' ? [0.3, 0.6, 0.9, 1.2] : [0.6, 1, 1.4, 1.8]) {
      const cells = [0, 0.25, 0.5, 0.75].map((c) => {
        const med = median(tables.map((t) => draft(t, (p) => {
          if (diff === 'season') return p.score * swing(m)
          const r = rangeOf(p)
          return ((r.lo + r.hi) / 2) * swing(m)
        }, c)))
        return `chem ${c}: ${med} (${Math.round((med / perfect) * 100)}%)`
      })
      console.log(`  misread ${m}  ${cells.join('   ')}`)
    }
  }
}
