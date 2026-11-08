// League Mode's Season variation on the real dealer: rosters drafted off League
// packs (one Franchise Pack on a random slot, ten ordinary, three wild bench
// packs), then eight-game seasons against seeded schedules. Measures what the plan
// set out to hit:
//   - REF: the median roster's lane totals (copy into seasonSim.ts REF)
//   - points: median about 24, most games 10 to 45
//   - clearing the line: about half for a typical roster
//   - a team that subs off the scouting report wins more than one that never does
//   - two receivers of the same value split apart against Lockdown Corners
//   - teams that start slow still make the top four
//   PACK_EMPIRE_SECRET=sim npx -y tsx --tsconfig tsconfig.json scripts/pack-empire-pool/sim/season-sim.ts [teams=600] [seasons=200]
import { DEFENSES, SEASON_GAMES, defenseById, scheduleFor } from '../../../src/lib/packEmpire/defenses'
import { SLOTS, type Player } from '../../../src/lib/packEmpire/rules'
import { benchCards, seasonCards, simCard } from '../../../src/lib/packEmpire/seasonCards'
import { benchPack, cpuPick, draftPack, rewardPack } from '../../../src/lib/packEmpire/seasonPacks'
import { rewardFor } from '../../../src/lib/packEmpire/seasonRules'
import { REF, bestSub, counterFor, laneTotals, matchup, simGame, type SimCard } from '../../../src/lib/packEmpire/seasonSim'

const TEAMS = Number(process.argv[2] ?? 600)
const SEASONS = Number(process.argv[3] ?? 200)
const POOLS = SLOTS.map((s) => s.pool)

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const best = (cards: Player[]) => cards.reduce((a, b) => (b.score > a.score ? b : a))

/** A Draft Day the way most people play it: the biggest card in every pack
    (three hot, four ordinary, three cold, unmarked), then the bench packs,
    keeping whatever steps up most. */
function draft(t: number): { lineup: Player[]; bench: Player[] } {
  const r = rng(t * 7919 + 13)
  const franchise = Math.floor(r() * 11)
  const lineup: Player[] = []
  for (let slot = 0; slot < 11; slot++) lineup.push(best(draftPack(`season-sim:${t}`, slot, franchise, lineup.map((p) => p.id))))
  const bench: Player[] = []
  for (let b = 0; b < 3; b++) bench.push(cpuPick(benchPack(`season-sim:${t}:bench${b}`, [...lineup, ...bench].map((p) => p.id)), lineup, bench))
  return { lineup, bench }
}

/** Every game pays a pack (REWARD=win to pay winners only): a loss an ordinary
    League pack, a win a Starter Pack, a win by BIG_WIN or more a Rising Pack. */
const WIN_ONLY = process.env.REWARD === 'win'

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

const t0 = Date.now()
const teams = Array.from({ length: TEAMS }, (_, t) => draft(t))
console.log(`${TEAMS} rosters drafted in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

// ── REF ──
const totals = teams.map((t) => laneTotals(seasonCards(t.lineup)))
const lanes = ['run', 'short', 'deep', 'redZone', 'protect'] as const
console.log('\nMedian lane totals (REF now):')
for (const k of lanes) console.log(`  ${k.padEnd(8)} ${pct(totals.map((x) => x[k]), 0.5).toFixed(0).padStart(6)}   (REF ${REF[k]})`)
console.log(`  roster value median ${pct(teams.map((t) => t.lineup.reduce((n, p) => n + p.score, 0)), 0.5)}`)

// ── Points against each front ──
console.log('\nExpected points, median roster, by front:')
for (const d of DEFENSES) {
  const ex = teams.map((t) => matchup(seasonCards(t.lineup), d).expected)
  console.log(`  ${d.name.padEnd(18)} p10 ${pct(ex, 0.1).toFixed(1).padStart(5)}  p50 ${pct(ex, 0.5).toFixed(1).padStart(5)}  p90 ${pct(ex, 0.9).toFixed(1).padStart(5)}`)
}

// ── Seasons: never subs vs subs off the scouting report ──
type Run = { wins: number; pts: number[]; yds: number[]; won: boolean[]; cleared: number; games: number; afterTwo: number; afterFour: number }
/** none: never subs. value: starts the biggest card at each spot, whatever the front. scout: subs off the scouting report. */
type Subs = 'none' | 'value' | 'scout'
function season(team: { lineup: Player[]; bench: Player[] }, seed: string, subs: Subs, teamNo: number): Run {
  const lineup = [...team.lineup]
  const bench = [...team.bench]
  const out: Run = { wins: 0, pts: [], yds: [], won: [], cleared: 0, games: 0, afterTwo: 0, afterFour: 0 }
  for (const wk of scheduleFor(seed)) {
    const d = defenseById(wk.defense)!
    // Subs off the scouting report until none helps by a point.
    for (let n = 0; subs !== 'none' && bench.length && n < 4; n++) {
      const sub = subs === 'scout' ? bestSub(seasonCards(lineup), benchCards(bench), d, POOLS) : valueSub(lineup, bench)
      if (!sub) break
      const i = bench.findIndex((p) => p.id === sub.benchId)
      const out_ = lineup[sub.slot]
      lineup[sub.slot] = bench[i]
      bench[i] = out_
    }
    const g = simGame(seasonCards(lineup), d, `${seed}|${teamNo}|${wk.week}`)
    out.pts.push(g.points)
    out.yds.push(g.yards)
    out.games++
    const won = g.points >= wk.line
    out.won.push(won)
    if (won) {
      out.wins++
      out.cleared++
    }
    // The game's pack: its best card goes to the bench; a full bench drops its worst.
    if (won || !WIN_ONLY) {
      const pack = rewardPack(`season-sim:${teamNo}:${seed}:r${wk.week}`, rewardFor(g.points, wk.line), [...lineup, ...bench].map((p) => p.id))
      bench.push(cpuPick(pack, lineup, bench))
      if (bench.length > 6) bench.splice(bench.indexOf(bench.reduce((a, b) => (b.score < a.score ? b : a))), 1)
    }
    if (wk.week === 2) out.afterTwo = out.wins
    if (wk.week === 4) out.afterFour = out.wins
  }
  return out
}

/** The biggest bench card over a smaller starter at his position. */
function valueSub(lineup: Player[], bench: Player[]): { benchId: string; slot: number } | null {
  let best_: { benchId: string; slot: number; gain: number } | null = null
  for (const b of bench)
    lineup.forEach((p, slot) => {
      if (POOLS[slot] === b.pos && b.score - p.score > 0 && (!best_ || b.score - p.score > best_.gain)) best_ = { benchId: b.id, slot, gain: b.score - p.score }
    })
  return best_
}

const plain: Run[] = []
const byValue: Run[] = []
const smart: Run[] = []
const luck: Run[] = []
// The luck-only line: twelve copies of one middling roster, so only the dice differ.
const mid = [...teams].sort((a, b) => a.lineup.reduce((n, p) => n + p.score, 0) - b.lineup.reduce((n, p) => n + p.score, 0))[Math.floor(TEAMS / 2)]
for (let s = 0; s < SEASONS; s++) {
  const seed = `sim-${s}`
  for (let k = 0; k < 12; k++) {
    const t = (s * 12 + k) % TEAMS
    plain.push(season(teams[t], seed, 'none', t))
    byValue.push(season(teams[t], seed, 'value', t))
    smart.push(season(teams[t], seed, 'scout', t))
    luck.push(season(mid, seed, 'scout', 100000 + s * 12 + k))
  }
}
const allPts = plain.flatMap((x) => x.pts)
const byWeek = (runs: Run[]) => Array.from({ length: SEASON_GAMES }, (_, w) => pct(runs.map((x) => x.pts[w]), 0.5))
const clearByWeek = (runs: Run[]) => Array.from({ length: SEASON_GAMES }, (_, w) => Math.round((100 * runs.filter((x) => x.won[w]).length) / runs.length))
console.log(`\nMedian points by week (subs off the report): ${byWeek(smart).join(' ')}`)
console.log(`Cleared the line by week:                    ${clearByWeek(smart).join('% ')}%`)
console.log(`Season PPG across teams, p10 / p50 / p90: ${pct(smart.map((x) => mean(x.pts)), 0.1).toFixed(1)} / ${pct(smart.map((x) => mean(x.pts)), 0.5).toFixed(1)} / ${pct(smart.map((x) => mean(x.pts)), 0.9).toFixed(1)}, best ${Math.max(...smart.map((x) => mean(x.pts))).toFixed(1)}`)
console.log(`Yards a game: median ${pct(smart.flatMap((x) => x.yds), 0.5)}, p90 ${pct(smart.flatMap((x) => x.yds), 0.9)}`)
const winDist = Array.from({ length: 9 }, (_, w) => Math.round((100 * smart.filter((x) => x.wins === w).length) / smart.length))
console.log(`Wins a season, 0..8: ${winDist.join('% ')}%`)
console.log(`\nGames (never subs): median ${pct(allPts, 0.5)}, p10 ${pct(allPts, 0.1)}, p90 ${pct(allPts, 0.9)}, min ${Math.min(...allPts)}, max ${Math.max(...allPts)}`)
console.log(`  cleared the line ${((100 * mean(plain.map((x) => x.cleared))) / SEASON_GAMES).toFixed(1)}% of games`)
console.log(`  wins a season: never subs ${mean(plain.map((x) => x.wins)).toFixed(2)}, biggest card ${mean(byValue.map((x) => x.wins)).toFixed(2)}, off the report ${mean(smart.map((x) => x.wins)).toFixed(2)}`)

// Comebacks: of each 12-team league, the bottom third after N games, how often top four at the end.
function comeback(runs: Run[], at: 'afterTwo' | 'afterFour') {
  let slow = 0
  let back = 0
  for (let s = 0; s < SEASONS; s++) {
    const league = runs.slice(s * 12, s * 12 + 12)
    const bottom = new Set([...league].sort((a, b) => a[at] - b[at] || mean(a.pts.slice(0, at === 'afterTwo' ? 2 : 4)) - mean(b.pts.slice(0, at === 'afterTwo' ? 2 : 4))).slice(0, 4))
    const top = new Set([...league].sort((a, b) => b.wins - a.wins || mean(b.pts) - mean(a.pts)).slice(0, 4))
    for (const t of bottom) {
      slow++
      if (top.has(t)) back++
    }
  }
  return ((100 * back) / slow).toFixed(1)
}
console.log(`  bottom third after 2 games that finish top four: ${comeback(smart, 'afterTwo')}% (luck alone ${comeback(luck, 'afterTwo')}%)`)
// In plain terms: a team that starts 0-2, how often it makes a top four or a top six of twelve.
function fromStart(runs: Run[], cut: number) {
  let n = 0
  let made = 0
  for (let s = 0; s < SEASONS; s++) {
    const league = runs.slice(s * 12, s * 12 + 12)
    const top = new Set([...league].sort((a, b) => b.wins - a.wins || mean(b.pts) - mean(a.pts)).slice(0, cut))
    for (const t of league)
      if (t.afterTwo === 0) {
        n++
        if (top.has(t)) made++
      }
  }
  return `${((100 * made) / Math.max(1, n)).toFixed(1)}%`
}
console.log(`  0-2 starts that make the top four: ${fromStart(smart, 4)} (luck ${fromStart(luck, 4)}), top six: ${fromStart(smart, 6)} (luck ${fromStart(luck, 6)})`)
console.log(`  bottom third after 4 games that finish top four: ${comeback(smart, 'afterFour')}% (luck alone ${comeback(luck, 'afterFour')}%)`)

// ── Same value, different kind: receivers against Lockdown Corners and Cover Three ──
const wrs = teams.flatMap((t) => t.lineup.slice(2, 5).concat(t.bench.filter((p) => p.pos === 'WR')))
const uniq = [...new Map(wrs.map((p) => [p.id, p])).values()]
const deep = uniq.filter((p) => simCard(p, 2).arch.tag === 'Deep Threat')
const poss = uniq.filter((p) => simCard(p, 2).arch.tag === 'Possession')
const lock = defenseById('lockdown')!
const zone = defenseById('zone')!
const base = defenseById('base')!
const diffs: { lock: number; zone: number; base: number }[] = []
for (const a of deep) {
  const b = poss.find((x) => Math.abs(x.score - a.score) <= a.score * 0.04)
  if (!b) continue
  const roster = teams[diffs.length % TEAMS].lineup
  const withA = seasonCards(roster.map((p, i) => (i === 2 ? a : p)))
  const withB = seasonCards(roster.map((p, i) => (i === 2 ? b : p)))
  const rel = (d: typeof lock) => (matchup(withB, d).expected - matchup(withA, d).expected) / matchup(withA, d).expected
  // The receiver's own share of the passing game, not the team's points.
  const own = (cs: SimCard[], d: typeof lock, id: string) => {
    const tot = laneTotals(cs, d)
    const c = cs.find((x) => x.id === id)!
    const counter = counterFor(d, c)
    return (c.value * counter * (c.arch.lanes.short * d.lanes.short + c.arch.lanes.deep * d.lanes.deep)) / (tot.short + tot.deep)
  }
  diffs.push({ lock: own(withB, lock, b.id) / own(withA, lock, a.id) - 1, zone: own(withB, zone, b.id) / own(withA, zone, a.id) - 1, base: rel(base) })
}
console.log(`\nSame-value receivers (Possession vs Deep Threat), ${diffs.length} pairs:`)
console.log(`  Possession's own production vs Lockdown Corners: ${(100 * mean(diffs.map((x) => x.lock))).toFixed(1)}%`)
console.log(`  Possession's own production vs Cover Three Zone: ${(100 * mean(diffs.map((x) => x.zone))).toFixed(1)}%`)
console.log(`  team points vs the base front: ${(100 * mean(diffs.map((x) => x.base))).toFixed(1)}%`)
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`)
