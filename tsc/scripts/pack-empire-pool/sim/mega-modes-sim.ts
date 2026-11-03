// Mega Draft modes: the salary cap's share and the Chemistry board, off the real
// dealer. Two drafters from both seats on the same boards.
//   esbuild this --bundle --platform=node --tsconfig=tsconfig.json --outfile=/tmp/mm.cjs
//   PACK_EMPIRE_SECRET=sim node /tmp/mm.cjs 400 [share] [caponly]   (DOLLAR=70 prices the pricer)
//
// 2026-11-03: cap share 0.4 left five free signings a lineup; 0.55 has a top-card
// drafter run dry (3.7 free) and a pricer at $40-70 beats it 60-67% and a plain
// reader 51-60%; at 0.6 pricing loses. On a Chemistry board a drafter who also
// weighs bonds (half his own, a quarter of the ones he denies) beats a plain
// reader 58% and a top-card drafter 76%, about 1,400 in chemistry a lineup; on a
// normal board with the same scoring, 48%. The stacks are what make it matter.
import { MEGA_CAP_SHARE, dealMegaBoard, megaCap, newServerSeed, priced } from '../../../src/lib/packEmpire/deal'
import {
  MEGA_TOTAL_PICKS,
  SLOTS,
  chemistryFor,
  chemistryPreview,
  megaPickOwner,
  megaWorth,
  signingPrice,
  type Player,
} from '../../../src/lib/packEmpire/rules'

const SHARE = Number(process.argv[3] ?? MEGA_CAP_SHARE)

type Seat = { roster: Player[]; left: number }
type Drafter = (left: Player[], me: Seat, them: Seat, capped: boolean, chem: boolean) => Player

const open = (s: Seat, pos: Player['pos']) => SLOTS.filter((x) => x.pool === pos).length - s.roster.filter((p) => p.pos === pos).length

function choose(worth: (p: Player, left: Player[], me: Seat, them: Seat, chem: boolean) => number): Drafter {
  return (left, me, them, capped, chem) => {
    const usable = left.filter((p) => open(me, p.pos) > 0)
    const table = capped ? usable.filter((p) => signingPrice(p, usable, me.left) != null) : usable
    return table.reduce((a, b) => (worth(b, left, me, them, chem) > worth(a, left, me, them, chem) ? b : a))
  }
}

const topCard = choose((p) => p.score)
const reader = choose((p, left, _me, them) => megaWorth(p, left, open(them, p.pos)))
const pricer = choose((p, left, _me, them) => megaWorth(p, left, open(them, p.pos)) - Number(process.env.DOLLAR ?? 70) * (p.salary ?? 0))
const chemist = choose(
  (p, left, me, them, chem) =>
    megaWorth(p, left, open(them, p.pos)) +
    (chem ? 0.5 * chemistryPreview(p, me.roster, true) + (open(them, p.pos) > 0 ? 0.25 * chemistryPreview(p, them.roster, true) : 0) : 0)
)

function play(board: Player[], a: Drafter, b: Drafter, capped: boolean, chem: boolean) {
  const cap = capped ? Math.round((megaCap(board) / MEGA_CAP_SHARE) * SHARE) : Infinity
  const seats: [Seat, Seat] = [
    { roster: [], left: cap },
    { roster: [], left: cap },
  ]
  let left = capped ? board.map(priced) : board
  const free = [0, 0]
  for (let n = 0; n < MEGA_TOTAL_PICKS; n++) {
    const s = megaPickOwner(n)
    const me = seats[s]
    const p = (s === 0 ? a : b)(left, me, seats[1 - s], capped, chem)
    if (capped) {
      const usable = left.filter((q) => open(me, q.pos) > 0)
      const price = signingPrice(p, usable, me.left) ?? 0
      if (price === 0) free[s]++
      me.left -= price
    }
    me.roster.push(p)
    left = left.filter((q) => q !== p)
  }
  const score = (s: Seat) => s.roster.reduce((t, p) => t + p.score, 0) + (chem ? chemistryFor(s.roster, true).total : 0)
  return { a: score(seats[0]), b: score(seats[1]), free, chemA: chem ? chemistryFor(seats[0].roster, true).total : 0 }
}

const N = Number(process.argv[2] ?? 300)
function duel(label: string, format: 'classic' | 'chem', x: Drafter, y: Drafter, capped: boolean, chem: boolean) {
  let wins = 0
  let games = 0
  let freeX = 0
  let chemX = 0
  for (let i = 0; i < N; i++) {
    const board = dealMegaBoard(newServerSeed(), format)
    const r1 = play(board, x, y, capped, chem)
    const r2 = play(board, y, x, capped, chem)
    wins += (r1.a > r1.b ? 1 : r1.a === r1.b ? 0.5 : 0) + (r2.b > r2.a ? 1 : r2.a === r2.b ? 0.5 : 0)
    freeX += r1.free[0] + r2.free[1]
    chemX += r1.chemA
    games += 2
  }
  console.log(`${label}: ${((100 * wins) / games).toFixed(1)}%  free signings/draft ${(freeX / games).toFixed(2)}  chem ${(chemX / N).toFixed(0)}`)
}

duel('cap: pricer v top card', 'classic', pricer, topCard, true, false)
duel('cap: pricer v reader', 'classic', pricer, reader, true, false)
duel('cap: reader v top card', 'classic', reader, topCard, true, false)
if (!process.argv[4]) duel('chem board: chemist v reader', 'chem', chemist, reader, false, true)
if (!process.argv[4]) duel('chem board: chemist v top card', 'chem', chemist, topCard, false, true)
if (!process.argv[4]) duel('classic board w/ chem scoring: chemist v reader', 'classic', chemist, reader, false, true)
if (!process.argv[4]) duel('no mode: reader v top card', 'classic', reader, topCard, false, false)
