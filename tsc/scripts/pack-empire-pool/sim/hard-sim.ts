// The hard modes off the real dealer: run with
//   PACK_EMPIRE_SECRET=sim npx -y tsx scripts/pack-empire-pool/sim/hard-sim.ts 400
//
// Daily: how often a pack leaves nothing to take, and what the spread looks
// like between someone who knows every value and someone guessing, across
// every rule. Even: what chemistry and Battles are worth. Check this after any change to
// SHARED_WEIGHTS, RANGE_WIDTHS, HARD_CHEM, the wild position weights or the
// planted team-seasons.
import { dailyPack, dailyRange, dailySet, evenPacks, newEvenSeed, newCaptainSeed, priced, rangeOf, type DailyPick } from '../../../src/lib/packEmpire/deal'
import { BATTLES, BATTLE_BONUS, battlesFrom, drawBattles, settleBattles, type Battle } from '../../../src/lib/packEmpire/battles'
import { versionsOf } from '../../../src/lib/packEmpire/pool'
import { soloPack } from '../../../src/lib/packEmpire/solo'
import { ruleForDay, scoreLineup, DAY_RULES } from '../../../src/lib/packEmpire/dayRules'
import { SALARY_CAP, SLOTS, SLOT_COUNT, chemistryFor, chemistryPreview, lineupScore, signingPrice, slotForCard, type Player } from '../../../src/lib/packEmpire/rules'

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
const dailyScout: Eye = (p, r) => {
  const { lo, hi } = dailyRange(p, '2026-11-01')
  return (lo + hi) / 2 + chemistryPreview(p, r, true)
}
// What someone who only knows names does: takes the most famous man in the pack.
const fame: Eye = (p) => versionsOf(p.pid ?? p.id)[0]?.score ?? p.score
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

for (const [name, eye] of [['knows every value', knower], ['range midpoint', dailyScout], ['biggest name', fame], ['blind guess', guess]] as [string, Eye][]) {
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

// Even's Battles: can each one be contested, and does leaning into them pay?
// A category that mostly ties, or one a lean can't move, is dead weight: keep
// "lean takes it" well over the tie. In the table, ignoring them should lose
// and going all in should be no better than a moderate lean (CPU_BATTLE).
{
  const games = Array.from({ length: Math.min(N, 200) }, () => evenPacks(newEvenSeed('open')))
  const noisy = (packs: Player[][], set: Battle[], lean: number) => {
    const out: Player[] = []
    for (const p of packs) {
      const read = (c: Player) =>
        knower(c, out) + lean * set.reduce((s, b) => s + b.lean(c, out), 0) + (Math.random() + Math.random() - 1) * 500
      out.push(p.map((c) => ({ c, v: read(c) })).reduce((x, y) => (y.v > x.v ? y : x)).c)
    }
    return out
  }
  for (const b of BATTLES) {
    let take = 0
    let tie = 0
    for (const g of games) {
      const x = b.value(noisy(g, [b], 900))
      const y = b.value(noisy(g, [b], 0))
      if (x > y) take++
      else if (x === y) tie++
    }
    console.log(`${b.title.padEnd(26)} lean takes it ${Math.round((take / games.length) * 100)}%, tied ${Math.round((tie / games.length) * 100)}%`)
  }
  const leans = [0, 300, 700, 1400]
  console.log(`Battles at +${BATTLE_BONUS}, row's win % by how hard each side leans: ${leans.join(' / ')}`)
  for (const mine of leans) {
    const cells = leans.map((theirs) => {
      let won = 0
      for (const g of games) {
        const ids = drawBattles((n) => Math.floor(Math.random() * n))
        const set = battlesFrom(ids)
        const a = noisy(g, set, mine)
        const b = noisy(g, set, theirs)
        const paid = settleBattles(ids, a, b)
        const gap = lineupScore(a) + chemistryFor(a, true).total + paid.host - lineupScore(b) - chemistryFor(b, true).total - paid.guest
        won += gap > 0 ? 1 : gap === 0 ? 0.5 : 0
      }
      return Math.round((won / games.length) * 100)
    })
    console.log(`  ${String(mine).padEnd(6)} ${cells.join('  ')}`)
  }
}

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
// Salary Cap: a budget that bites, a reader beating a top-card drafter, and no
// one trick (value per dollar) that solves it.
{
  const dollar = 70
  const packsFor = (even: boolean): Player[][] => {
    if (even) return evenPacks(newEvenSeed('cap'))
    const captain = Math.floor(Math.random() * SLOT_COUNT)
    const seed = newCaptainSeed(captain, 'cap')
    const out: Player[][] = []
    const t: string[] = []
    for (let s = 0; s < SLOT_COUNT; s++) {
      const p = soloPack(seed, captain, s, t)
      t.push(p[0].id)
      out.push(p)
    }
    return out
  }
  const draft = (packs: Player[][], budget: number, worth: (p: Player, r: Player[]) => number) => {
    let left = budget
    const r: Player[] = []
    for (const raw of packs) {
      const pack = raw.map(priced)
      const best = pack
        .filter((p) => signingPrice(p, pack, left) != null)
        .reduce((a, b) => (worth(b, r) > worth(a, r) ? b : a))
      left -= signingPrice(best, pack, left) ?? 0
      if (left < 0) throw new Error('over the cap')
      r.push(best)
    }
    return lineupScore(r) + chemistryFor(r, true).total
  }
  for (const even of [false, true]) {
    const budget = even ? SALARY_CAP.shared : SALARY_CAP.own
    const decks = Array.from({ length: N }, () => packsFor(even))
    row(`Cap ${even ? 'shared' : 'own'} $${budget}M, top card`, decks.map((d) => draft(d, budget, knower)))
    row(`  weighing price`, decks.map((d) => draft(d, budget, (p, r) => knower(p, r) - dollar * (p.salary ?? 0))))
    row(`  value per dollar`, decks.map((d) => draft(d, budget, (p, r) => knower(p, r) / (p.salary ?? 1))))
  }
}

const rules = new Map<string, number>()
for (const d of days) rules.set(ruleForDay(d).id, (rules.get(ruleForDay(d).id) ?? 0) + 1)
console.log(`rules ${DAY_RULES.length}, seen in ${N} days: ${rules.size}`)
const seq = days.slice(0, DAY_RULES.length).map((d) => ruleForDay(d).id)
console.log('first run of days has repeats:', seq.length - new Set(seq).size, seq.slice(0, 8).join(' '))
void SLOTS
