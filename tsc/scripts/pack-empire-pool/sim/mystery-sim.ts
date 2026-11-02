// Mystery Builder on the real dealer: greedy (best card that fits) against a
// planner that holds out for scarce positions, how often a reserve comes up, and
// a replay of every run through replaySolo so the dealer and the scorer agree.
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/mystery-sim.ts 3000
import { mysteryPack, mysterySlot, newMysterySeed } from '../../../src/lib/packEmpire/deal'
import { replaySolo, type SoloPick } from '../../../src/lib/packEmpire/solo'
import { SLOTS, SLOT_COUNT, TIERS, tierFor, type Player } from '../../../src/lib/packEmpire/rules'

const N = Number(process.argv[2] ?? 2000)
type Chooser = (usable: Player[], picks: SoloPick[]) => Player

const greedy: Chooser = (usable) => usable.reduce((a, b) => (b.score > a.score ? b : a))

// How often each position turns up in a wild pack (WILD_POOL_WEIGHT, about): a card
// at a position with few chances left is worth more than its number.
const planner: Chooser = (usable, picks) => {
  const left = SLOT_COUNT - picks.length
  const filled = new Set(picks.map((p) => p.slot))
  const open = (pos: string) => SLOTS.filter((s, i) => s.pool === pos && !filled.has(i)).length
  return usable.reduce((a, b) => {
    const w = (p: Player) => p.score * (1 + (open(p.pos) > 0 ? 0.35 * Math.max(0, open(p.pos) - left / 4) : 0))
    return w(b) > w(a) ? b : a
  })
}

function play(choose: Chooser) {
  const scores: number[] = []
  let reserves = 0
  let mismatched = 0
  for (let i = 0; i < N; i++) {
    const captain = i % SLOT_COUNT
    const seed = newMysterySeed(captain)
    const picks: SoloPick[] = []
    for (let n = 0; n < SLOT_COUNT; n++) {
      const { cards, reserve } = mysteryPack(seed, captain, picks)
      if (reserve) reserves++
      const usable = cards.filter((c) => mysterySlot(captain, picks, c.pos) >= 0)
      const card = choose(usable, picks)
      picks.push({ slot: mysterySlot(captain, picks, card.pos), id: card.id })
    }
    const run = replaySolo(seed, picks)
    if (!run.ok) mismatched++
    else scores.push(run.score)
  }
  scores.sort((a, b) => a - b)
  const q = (p: number) => scores[Math.floor(p * (scores.length - 1))]
  console.log(`median ${q(0.5)}  p10 ${q(0.1)}  p90 ${q(0.9)}  max ${scores[scores.length - 1]}  reserves/run ${(reserves / N).toFixed(2)}  replay failures ${mismatched}`)
  for (const t of TIERS.slice(0, 4)) console.log(`  ${t.label.padEnd(20)} ${((100 * scores.filter((s) => tierFor(s) === t).length) / scores.length).toFixed(1)}%`)
}

console.log('greedy'); play(greedy)
console.log('planner'); play(planner)
