// The hard modes off the real dealer: run with
//   PACK_EMPIRE_SECRET=sim npx -y tsx scripts/pack-empire-pool/sim/hard-sim.ts 400
//
// Daily: how often a pack leaves nothing to take, and what the spread looks
// like between someone who knows every value and someone guessing, across
// every rule. Even: what chemistry is worth. Check this after any change to
// SHARED_WEIGHTS, RANGE_WIDTH, HARD_CHEM, the wild position weights or the
// planted team-seasons.
import { dailyPack, dailySet, evenPacks, newEvenSeed, newCaptainSeed, rangeOf, type DailyPick } from '../../../src/lib/packEmpire/deal'
import { soloPack } from '../../../src/lib/packEmpire/solo'
import { ruleForDay, scoreLineup, DAY_RULES } from '../../../src/lib/packEmpire/dayRules'
import { SLOTS, SLOT_COUNT, chemistryFor, chemistryPreview, lineupScore, slotForCard, type Player } from '../../../src/lib/packEmpire/rules'

const N = Number(process.argv[2] ?? 300)
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))]
const row = (name: string, a: number[]) =>
  console.log(`${name.padEnd(34)} p10 ${q(a, 0.1)}  med ${q(a, 0.5)}  p90 ${q(a, 0.9)}  max ${Math.max(...a)}`)

/** See a card's real worth, or a noisy guess at it. */
type Eye = (p: Player, roster: Player[]) => number
const knower: Eye = (p, r) => p.score + chemistryPreview(p, r, true)
const scoutRange: Eye = (p, r) => {
  const { lo, hi } = rangeOf(p)
  return (lo + hi) / 2 + chemistryPreview(p, r, true)
}
const guess: Eye = () => Math.random()

function playDaily(day: string, version: string, captain: number | null, eye: Eye) {
  const rule = ruleForDay(day)
  const cap = rule.noCaptain ? null : captain
  const set = dailySet(day, version)
  const picks: DailyPick[] = []
  const lineup: (Player | null)[] = Array(SLOT_COUNT).fill(null)
  let reserves = 0
  let forced = 0
  while (picks.length < SLOT_COUNT) {
    const { cards, reserve } = dailyPack(set, cap, picks)
    const filled = new Set(picks.map((p) => p.slot))
    const roster = lineup.filter(Boolean) as Player[]
    const fits = cards.filter((c) => (cap != null && picks.length === 0 ? true : slotForCard(c.pos, filled) >= 0))
    if (fits.length === 0) throw new Error(`dead end at pick ${picks.length}`)
    if (reserve) reserves++
    if (fits.length === 1) forced++
    const best = fits.reduce((a, b) => (eye(b, roster) > eye(a, roster) ? b : a))
    const slot = cap != null && picks.length === 0 ? cap : slotForCard(best.pos, filled)
    lineup[slot] = best
    picks.push({ id: best.id, slot })
  }
  const full = lineup as Player[]
  const score = scoreLineup(full, cap, rule)
  if (!Number.isFinite(score.total) || score.total !== score.cards + score.ruleDelta + score.chem.total) {
    throw new Error(`${rule.id}: the parts don't add up`)
  }
  return { score, reserves, forced, base: lineupScore(full) }
}

const days = Array.from({ length: N }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 1 + i))
  return d.toISOString().slice(0, 10)
})

for (const [name, eye] of [['knows every value', knower], ['range midpoint', scoutRange], ['blind guess', guess]] as [string, Eye][]) {
  const runs = days.map((d, i) => playDaily(d, 'range', [0, 1, 5, 8][i % 4], eye))
  row(`Daily, ${name}`, runs.map((r) => r.score.total))
  row(`  face value`, runs.map((r) => r.score.cards))
  row(`  chemistry`, runs.map((r) => r.score.chem.total))
  console.log(`  reserves a run ${(runs.reduce((s, r) => s + r.reserves, 0) / N).toFixed(2)}, runs with one ${(runs.filter((r) => r.reserves > 0).length / N * 100).toFixed(0)}%, forced picks ${(runs.reduce((s, r) => s + r.forced, 0) / N).toFixed(2)}`)
}

// A man never twice across a whole deal.
for (const d of days.slice(0, 40)) {
  const set = dailySet(d, 'range')
  const cards = [...set.wild.flat(), ...Object.values(set.captains).flat(), ...Object.values(set.reserves).flat()]
  const men = cards.map((c) => c.pid ?? c.id)
  if (new Set(men).size !== men.length) throw new Error(`${d}: a man dealt twice`)
  if (set.wild.some((p) => p.length !== 5 || new Set(p.map((c) => c.pos)).size !== 5)) throw new Error(`${d}: bad wild pack`)
}
console.log('deal check ok: no man twice, five positions in every wild pack')

// Even: greedy on value vs greedy on value plus chemistry, same packs.
const plain: number[] = []
const chem: number[] = []
const chemGain: number[] = []
let chemWins = 0
for (let i = 0; i < N; i++) {
  const packs = evenPacks(newEvenSeed('open'))
  const men = packs.flat().map((c) => c.pid ?? c.id)
  if (new Set(men).size !== 55) throw new Error('even deal repeats a man')
  const a = packs.map((p) => p.reduce((x, y) => (y.score > x.score ? y : x)))
  const b: Player[] = []
  for (const p of packs) b.push(p.reduce((x, y) => (knower(y, b) > knower(x, b) ? y : x)))
  const sa = lineupScore(a) + chemistryFor(a, true).total
  const sb = lineupScore(b) + chemistryFor(b, true).total
  plain.push(sa)
  chem.push(sb)
  chemGain.push(chemistryFor(b, true).total)
  if (sb > sa) chemWins++
}
row('Even, top card', plain)
row('Even, card + chemistry', chem)
row('  chemistry', chemGain)
console.log(`  chem drafter wins ${(chemWins / N * 100).toFixed(0)}% head to head`)

// Empire Builder on Range: how far a midpoint reader falls short of perfect.
const open: number[] = []
const mid: number[] = []
for (let i = 0; i < N; i++) {
  const captain = i % SLOT_COUNT
  const seed = newCaptainSeed(captain)
  const [t1, t2]: [string[], string[]] = [[], []]
  let s1 = 0
  const r2: Player[] = []
  for (let s = 0; s < SLOT_COUNT; s++) {
    const best = soloPack(seed, captain, s, t1).reduce((a, b) => (b.score > a.score ? b : a))
    t1.push(best.id)
    s1 += best.score
    const pack = soloPack(seed, captain, s, t2)
    const pick = pack.reduce((a, b) => (scoutRange(b, r2) > scoutRange(a, r2) ? b : a))
    t2.push(pick.id)
    r2.push(pick)
  }
  open.push(s1)
  mid.push(lineupScore(r2) + chemistryFor(r2, true).total)
}
row('Builder, perfect value', open)
row('Builder, Range midpoint', mid)
const rules = new Map<string, number>()
for (const d of days) rules.set(ruleForDay(d).id, (rules.get(ruleForDay(d).id) ?? 0) + 1)
console.log(`rules ${DAY_RULES.length}, seen in ${N} days: ${rules.size}`)
const seq = days.slice(0, DAY_RULES.length).map((d) => ruleForDay(d).id)
console.log('first run of days has repeats:', seq.length - new Set(seq).size, seq.slice(0, 8).join(' '))
void SLOTS
