// Mega Draft first-pick odds off the real dealer: two seats, same strategy,
// who wins? Run after any change to the pool, MEGA_WEIGHTS or the draft order.
//   esbuild this --bundle --platform=node --tsconfig=tsconfig.json --outfile=/tmp/m.cjs
//   PACK_EMPIRE_SECRET=sim node /tmp/m.cjs 3000
//
// 2026-10-30: an unchecked board gave first pick 65% between equal players
// (+488 a draft). With the fair-board check: top card v top card 49%, reading
// the board both ways 51%, and a board reader beats a top-card picker about
// 67% from either seat. Immortals on a board 0/1/2/3: 34/33/24/7%, unchanged.
import { dealMegaBoard, newServerSeed } from '../../../src/lib/packEmpire/deal'
import { MEGA_TOTAL_PICKS, SLOTS, megaPickOwner, megaWorth, type Player } from '../../../src/lib/packEmpire/rules'

type Pick = (left: Player[], mine: Record<string, number>, theirs: Record<string, number>) => Player | null

const best =
  (worth: (p: Player, left: Player[], rivalOpen: number) => number): Pick =>
  (left, mine, theirs) => {
    let top: Player | null = null
    let topWorth = -Infinity
    for (const p of left) {
      if (mine[p.pos] <= 0) continue
      const w = worth(p, left, theirs[p.pos])
      if (w > topWorth) {
        topWorth = w
        top = p
      }
    }
    return top
  }

const topCard = best((p) => p.score)
const reader = best(megaWorth)
const cpu = best((p, left, rivals) => megaWorth(p, left, rivals) + (Math.random() - 0.5) * 0.1 * p.score)

function margin(board: Player[], a: Pick, b: Pick): number {
  const need = (): Record<string, number> => {
    const n: Record<string, number> = {}
    for (const s of SLOTS) n[s.pool] = (n[s.pool] ?? 0) + 1
    return n
  }
  const needs = [need(), need()]
  const score = [0, 0]
  let left = [...board]
  for (let n = 0; n < MEGA_TOTAL_PICKS; n++) {
    const s = megaPickOwner(n)
    const p = (s === 0 ? a : b)(left, needs[s], needs[s === 0 ? 1 : 0])
    if (!p) continue
    left = left.filter((q) => q.id !== p.id)
    needs[s][p.pos]--
    score[s] += p.score
  }
  return score[0] - score[1]
}

const N = Number(process.argv[2] ?? 2000)
const pairs: [string, Pick, Pick][] = [
  ['top card v top card', topCard, topCard],
  ['reader v reader', reader, reader],
  ['cpu v cpu', cpu, cpu],
  ['top card first, reader second', topCard, reader],
  ['reader first, top card second', reader, topCard],
]
const wins = pairs.map(() => 0)
const immortals = [0, 0, 0, 0, 0]
const t0 = Date.now()
const boards = Array.from({ length: N }, () => dealMegaBoard(newServerSeed()))
const dealMs = (Date.now() - t0) / N
for (const b of boards) {
  immortals[Math.min(4, b.filter((p) => p.rarity === 'immortal').length)]++
  pairs.forEach(([, x, y], j) => {
    const m = margin(b, x, y)
    wins[j] += m > 0 ? 1 : m === 0 ? 0.5 : 0
  })
}
console.log(`${N} boards, ${dealMs.toFixed(1)}ms a deal`)
pairs.forEach(([n], j) => console.log(`  ${n.padEnd(32)} first seat wins ${((100 * wins[j]) / N).toFixed(1)}%`))
console.log(`  immortals 0/1/2/3/4+: ${immortals.map((n) => `${((100 * n) / N).toFixed(0)}%`).join(' / ')}`)
