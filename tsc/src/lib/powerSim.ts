// Monte Carlo season simulator for power-rankings projections.
//
// Plays out the remaining regular-season schedule many times from the
// current standings. Two kinds of uncertainty go into every run, and the
// odds are only honest with both:
//
//   1. How good each team really is. Three games at 157 points is a hot
//      start, not a 157-point team. Each team's scoring rate is shrunk
//      toward the league average in proportion to how little evidence there
//      is (a normal-normal update: n games of weekly noise against the
//      spread of true team quality), and every run draws a fresh "true"
//      rate from that posterior.
//   2. Week-to-week noise: each game draws both scores around the run's
//      true rates.
//
// The first version took each team's season PPG as its exact true rate.
// A 3-0 team averaging 30 over the league then won ~85% of its remaining
// games in every run, projected 12-2, and showed a 100% playoff chance a
// quarter of the way into the season. The percentages now also respect
// the math: 100% only once the current record has clinched it, 0% only
// once it is out of reach (see guarantees()).
//
// Who gets in follows the league's playoff format (lib/seasonRules):
// best records overall, division winners plus the best records (Sleeper's
// rule and the default with divisions), or the top N of each division.
// Division winners are seeded first whenever divisions decide spots, so
// they take the byes. Ties are broken by head-to-head among the tied teams,
// then division record (when they share a division), then points for.
//
// Checked against 238 finished seasons on the site (58 leagues): teams that
// started 3-0 made the playoffs 84% of the time and the model, run from
// week 3, gave them 85% on average; every 10% band from week 3 lands within
// a few points of what actually happened.

import type { PlayoffFormat } from '@/lib/seasonRules'

export type SimTeam = {
  teamId: string
  division: number | null
  ppg: number // points per game so far (0 with no games)
  games: number // games behind `ppg`
  startWins: number
  startLosses: number
  startTies: number
  startPf: number
}

// A settled regular-season game. Feeds head-to-head, division records and
// the league's scoring level + weekly noise.
export type SimGame = { a: string; b: string; sa: number; sb: number }

export type TeamProjection = {
  proj_wins: number
  proj_losses: number
  playoff_pct: number
  bye_pct: number
  conf_win_pct: number
  clinched_playoff: boolean
  eliminated: boolean
}

export type SimOptions = {
  playoffTeams: number
  byeTeams: number
  runs: number
  played: SimGame[]
  // Unset: division_winners with divisions, record without.
  format?: PlayoffFormat
}

type Format = { kind: PlayoffFormat; playoffTeams: number }

function formatFor(groups: Map<number, number[]>, playoffTeams: number, format?: PlayoffFormat): Format {
  if (groups.size < 2) return { kind: 'record', playoffTeams }
  return { kind: format ?? 'division_winners', playoffTeams }
}

export type TieKey = 'h2h' | 'div' | 'pf'

// Where every team stands today, under the same rules the sim seeds by.
export type StandingNow = {
  seed: number // 1 = top seed
  div_place: number | null // place within the division, null without divisions
  div_winner: boolean // leads its division today
  div_w: number
  div_l: number
  div_t: number
  // The tiebreaker that decided this team's division place against a team
  // on the same record, when there was one.
  tb: TieKey | null
}

// Calibrated on every finished regular season in pams, 2livecrew and wffb
// (2017-2025): one team's weekly score swings by ~19% of the league
// average, while the spread of true team quality (season PPG with the
// weekly noise taken out) is ~6%. So three games carry about 23% signal.
// Across 351 manager-seasons in seven leagues, a manager's past PPG
// predicted the next season's at r = 0.08, so history is no prior: every
// team starts at the league average.
const GAME_SD_REL = 0.19
const TEAM_SD_REL = 0.06
// The league's own weekly noise is estimated from this season's games and
// leans on the calibrated figure as if it were worth this many games.
const GAME_SD_PRIOR_DF = 30

// Box-Muller normal sample.
function gauss(mean: number, sd: number): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Everything the standings are decided on, indexed by team position.
type Table = {
  n: number
  div: Int32Array // -1 = no division
  pts: Float64Array // wins + half ties
  pf: Float64Array
  h2h: Float64Array // [i * n + j] = i's result credit against j
  h2hGames: Float64Array
  divPts: Float64Array
  divGames: Float64Array
}

function newTable(n: number, div: Int32Array): Table {
  return {
    n,
    div,
    pts: new Float64Array(n),
    pf: new Float64Array(n),
    h2h: new Float64Array(n * n),
    h2hGames: new Float64Array(n * n),
    divPts: new Float64Array(n),
    divGames: new Float64Array(n),
  }
}

function copyTable(from: Table, to: Table): void {
  to.pts.set(from.pts)
  to.pf.set(from.pf)
  to.h2h.set(from.h2h)
  to.h2hGames.set(from.h2hGames)
  to.divPts.set(from.divPts)
  to.divGames.set(from.divGames)
}

// Record one game's result. `credit` is i's share: 1 win, 0.5 tie, 0 loss.
function recordGame(t: Table, i: number, j: number, credit: number): void {
  t.h2h[i * t.n + j] += credit
  t.h2h[j * t.n + i] += 1 - credit
  t.h2hGames[i * t.n + j] += 1
  t.h2hGames[j * t.n + i] += 1
  if (t.div[i] >= 0 && t.div[i] === t.div[j]) {
    t.divPts[i] += credit
    t.divPts[j] += 1 - credit
    t.divGames[i] += 1
    t.divGames[j] += 1
  }
}

// Orders teams on the same record: head-to-head among them, then division
// record when they all share a division, then points for. Head-to-head is
// each team's win rate in games against the others in the tie; a team that
// hasn't met any of them sits at .500. `reasons`, when given, collects the
// tiebreaker that separated each team from its neighbour.
function breakTie(t: Table, block: number[], reasons?: Map<number, TieKey>): number[] {
  const h2h = new Map<number, number>()
  for (const a of block) {
    let credit = 0
    let games = 0
    for (const b of block) {
      if (b === a) continue
      credit += t.h2h[a * t.n + b]
      games += t.h2hGames[a * t.n + b]
    }
    h2h.set(a, games > 0 ? credit / games : 0.5)
  }
  const d0 = t.div[block[0]!]!
  const sameDiv = d0 >= 0 && block.every((x) => t.div[x] === d0)
  const divRate = (x: number) => (sameDiv && t.divGames[x] > 0 ? t.divPts[x] / t.divGames[x] : 0)
  const sorted = [...block].sort((x, y) =>
    (h2h.get(y)! - h2h.get(x)!) || (divRate(y) - divRate(x)) || (t.pf[y] - t.pf[x]),
  )
  if (reasons) {
    for (let k = 1; k < sorted.length; k++) {
      const x = sorted[k - 1]!
      const y = sorted[k]!
      const key: TieKey = h2h.get(x) !== h2h.get(y) ? 'h2h' : divRate(x) !== divRate(y) ? 'div' : 'pf'
      if (!reasons.has(x)) reasons.set(x, key)
      reasons.set(y, key)
    }
  }
  return sorted
}

function order(t: Table, members: number[], reasons?: Map<number, TieKey>): number[] {
  const sorted = [...members].sort((x, y) => t.pts[y] - t.pts[x])
  const out: number[] = []
  for (let i = 0; i < sorted.length;) {
    let j = i + 1
    while (j < sorted.length && t.pts[sorted[j]!] === t.pts[sorted[i]!]) j++
    if (j - i === 1) out.push(sorted[i]!)
    else out.push(...breakTie(t, sorted.slice(i, j), reasons))
    i = j
  }
  return out
}

function divisionGroups(t: Table): Map<number, number[]> {
  const groups = new Map<number, number[]>()
  for (let i = 0; i < t.n; i++) {
    if (t.div[i] < 0) continue
    const g = groups.get(t.div[i]!) ?? []
    g.push(i)
    groups.set(t.div[i]!, g)
  }
  return groups
}

// Seed order: the first `playoffTeams` entries are the playoff field.
//   record            everyone by record
//   division_winners  the winners, then everyone else by record
//   per_division      the winners, then the rest of each division's top N,
//                     then any spots left over (an uneven split) by record,
//                     then the teams that missed
function seeds(t: Table, groups: Map<number, number[]>, fmt: Format, reasons?: Map<number, TieKey>) {
  const all = Array.from({ length: t.n }, (_, i) => i)
  const winners = new Set<number>()
  const placeOf = new Map<number, number>()
  const rankedByDiv: number[][] = []
  for (const g of groups.values()) {
    const ranked = order(t, g, reasons)
    ranked.forEach((x, k) => placeOf.set(x, k + 1))
    winners.add(ranked[0]!)
    rankedByDiv.push(ranked)
  }
  if (fmt.kind === 'record' || groups.size < 2) return { order: order(t, all), winners, placeOf }
  const first = order(t, [...winners])
  if (fmt.kind === 'division_winners') {
    return { order: [...first, ...order(t, all.filter((i) => !winners.has(i)))], winners, placeOf }
  }
  const perDiv = Math.floor(fmt.playoffTeams / groups.size)
  const qualified = new Set<number>(first)
  for (const ranked of rankedByDiv) ranked.slice(0, perDiv).forEach((x) => qualified.add(x))
  const second = order(t, all.filter((i) => qualified.has(i) && !winners.has(i)))
  const rest = order(t, all.filter((i) => !qualified.has(i)))
  const leftover = Math.max(0, fmt.playoffTeams - first.length - second.length)
  return { order: [...first, ...second, ...rest.slice(0, leftover), ...rest.slice(leftover)], winners, placeOf }
}

// What the current record already settles, whatever happens next. These are
// deliberately conservative (a team is only called clinched when no mix of
// results can pass it), so a spot won by a subtler route shows 99.9%.
function guarantees(
  t: Table,
  groups: Map<number, number[]>,
  maxPts: Float64Array,
  i: number,
  fmt: Format,
  byeTeams: number,
) {
  const playoffTeams = fmt.playoffTeams
  // Divisions decide playoff spots (and byes) unless the format is record.
  const hasDivs = fmt.kind !== 'record'
  const mine = t.div[i]!
  // Teams that could still finish level with or above i.
  const threats: number[] = []
  // Teams already certain to finish above i on record.
  let ahead = 0
  for (let j = 0; j < t.n; j++) {
    if (j === i) continue
    if (maxPts[j] >= t.pts[i]) threats.push(j)
    if (t.pts[j] > maxPts[i]) ahead++
  }
  // Division titles are tracked in every format (the conference odds).
  const rivals = groups.size >= 2 && mine >= 0 ? groups.get(mine)!.filter((j) => j !== i) : []
  const divClinched = groups.size >= 2 && mine >= 0 && rivals.every((j) => maxPts[j] < t.pts[i])
  const divOut = groups.size >= 2 && (mine < 0 || rivals.some((j) => t.pts[j] > maxPts[i]))

  let playoffClinched: boolean
  let eliminated: boolean
  if (fmt.kind === 'per_division' && mine >= 0) {
    // Only the division race counts, unless an uneven split leaves
    // wildcard spots, which can still rescue a team that falls short.
    const perDiv = Math.floor(playoffTeams / groups.size)
    const wildcards = playoffTeams - perDiv * groups.size
    playoffClinched = rivals.filter((j) => maxPts[j] >= t.pts[i]).length < perDiv
    eliminated = rivals.filter((j) => t.pts[j] > maxPts[i]).length >= perDiv &&
      (wildcards === 0 || ahead >= playoffTeams)
  } else if (fmt.kind === 'division_winners') {
    // Another division whose winner could be seeded over i with a worse
    // record: count it once when none of its teams is already a threat.
    let extra = 0
    for (const [d, g] of groups) {
      if (d !== mine && !g.some((j) => maxPts[j] >= t.pts[i])) extra++
    }
    playoffClinched = divClinched || threats.length + extra < playoffTeams
    eliminated = divOut && ahead >= playoffTeams
  } else {
    playoffClinched = threats.length < playoffTeams
    eliminated = ahead >= playoffTeams
  }
  // Byes go to the top seeds: the division winners whenever divisions
  // decide spots, the best records otherwise.
  const byeClinched = hasDivs ? divClinched && byeTeams >= groups.size : threats.length < byeTeams
  const byeOut = byeTeams === 0 || (hasDivs && byeTeams <= groups.size ? divOut : ahead >= byeTeams)
  return { playoffClinched, eliminated, byeClinched, byeOut, divClinched, divOut }
}

function bounded(pct: number, sure: boolean, out: boolean): number {
  if (sure) return 100
  if (out) return 0
  return Math.min(99.9, Math.max(0.1, pct))
}

function buildBase(teams: SimTeam[], played: SimGame[]) {
  const n = teams.length
  const index = new Map(teams.map((t, i) => [t.teamId, i]))
  const div = new Int32Array(n)
  teams.forEach((t, i) => { div[i] = t.division ?? -1 })
  const base = newTable(n, div)
  teams.forEach((t, i) => {
    base.pts[i] = t.startWins + 0.5 * t.startTies
    base.pf[i] = t.startPf
  })
  for (const g of played) {
    const i = index.get(g.a)
    const j = index.get(g.b)
    if (i == null || j == null) continue
    recordGame(base, i, j, g.sa > g.sb ? 1 : g.sa < g.sb ? 0 : 0.5)
  }
  return { n, index, base, groups: divisionGroups(base) }
}

// Today's standings under the sim's rules: seed, division place, division
// record, and which tiebreaker (if any) decided the division place.
export function standingsNow(
  teams: SimTeam[],
  played: SimGame[],
  opts: { playoffTeams: number; format?: PlayoffFormat },
): Map<string, StandingNow> {
  const { index, base, groups } = buildBase(teams, played)
  const reasons = new Map<number, TieKey>()
  const s = seeds(base, groups, formatFor(groups, opts.playoffTeams, opts.format), reasons)
  const divRec = new Map<number, { w: number; l: number; t: number }>()
  for (const g of played) {
    const i = index.get(g.a)
    const j = index.get(g.b)
    if (i == null || j == null || base.div[i] < 0 || base.div[i] !== base.div[j]) continue
    const ri = divRec.get(i) ?? { w: 0, l: 0, t: 0 }
    const rj = divRec.get(j) ?? { w: 0, l: 0, t: 0 }
    if (g.sa > g.sb) { ri.w++; rj.l++ } else if (g.sa < g.sb) { ri.l++; rj.w++ } else { ri.t++; rj.t++ }
    divRec.set(i, ri)
    divRec.set(j, rj)
  }
  const out = new Map<string, StandingNow>()
  s.order.forEach((i, k) => {
    const r = divRec.get(i) ?? { w: 0, l: 0, t: 0 }
    out.set(teams[i]!.teamId, {
      seed: k + 1,
      div_place: s.placeOf.get(i) ?? null,
      div_winner: s.winners.has(i),
      div_w: r.w,
      div_l: r.l,
      div_t: r.t,
      tb: reasons.get(i) ?? null,
    })
  })
  return out
}

export function simulateSeason(
  teams: SimTeam[],
  remaining: { a: string; b: string }[],
  opts: SimOptions,
): Map<string, TeamProjection> {
  const { n, index, base, groups } = buildBase(teams, opts.played)
  const fmt = formatFor(groups, opts.playoffTeams, opts.format)

  const games: [number, number][] = []
  const remainingCount = new Float64Array(n)
  for (const m of remaining) {
    const i = index.get(m.a)
    const j = index.get(m.b)
    if (i == null || j == null) continue
    games.push([i, j])
    remainingCount[i]++
    remainingCount[j]++
  }

  // League scoring level and weekly noise from this season's games.
  let sum = 0
  let count = 0
  for (const g of opts.played) { sum += g.sa + g.sb; count += 2 }
  const leagueMean = count > 0 ? sum / count : 100
  const perTeam = new Map<string, number[]>()
  const addScore = (id: string, v: number) => {
    const arr = perTeam.get(id) ?? []
    arr.push(v)
    perTeam.set(id, arr)
  }
  for (const g of opts.played) { addScore(g.a, g.sa); addScore(g.b, g.sb) }
  let ss = 0
  let df = 0
  for (const scores of perTeam.values()) {
    if (scores.length < 2) continue
    const m = scores.reduce((s, v) => s + v, 0) / scores.length
    for (const v of scores) ss += (v - m) ** 2
    df += scores.length - 1
  }
  const priorSd = GAME_SD_REL * leagueMean
  const gameSd = Math.sqrt((ss + GAME_SD_PRIOR_DF * priorSd ** 2) / (df + GAME_SD_PRIOR_DF))
  const teamSd = TEAM_SD_REL * leagueMean

  // Posterior of each team's true scoring rate.
  const mu = new Float64Array(n)
  const muSd = new Float64Array(n)
  teams.forEach((t, i) => {
    const g = t.games > 0 && t.ppg > 0 ? t.games : 0
    const prec = 1 / teamSd ** 2 + g / gameSd ** 2
    mu[i] = (leagueMean / teamSd ** 2 + (g * t.ppg) / gameSd ** 2) / prec
    muSd[i] = Math.sqrt(1 / prec)
  })

  const tally = teams.map(() => ({ wins: 0, playoff: 0, bye: 0, confWin: 0 }))
  const run = newTable(n, base.div)
  const wins = new Float64Array(n)
  const strength = new Float64Array(n)
  const runs = Math.max(1, opts.runs)
  for (let r = 0; r < runs; r++) {
    copyTable(base, run)
    for (let i = 0; i < n; i++) {
      wins[i] = teams[i]!.startWins
      strength[i] = gauss(mu[i]!, muSd[i]!)
    }
    for (const [i, j] of games) {
      const sa = gauss(strength[i]!, gameSd)
      const sb = gauss(strength[j]!, gameSd)
      run.pf[i] += sa
      run.pf[j] += sb
      const aWon = sa >= sb
      if (aWon) { wins[i]++; run.pts[i]++ } else { wins[j]++; run.pts[j]++ }
      recordGame(run, i, j, aWon ? 1 : 0)
    }
    const s = seeds(run, groups, fmt)
    s.order.forEach((i, k) => {
      const acc = tally[i]!
      if (k < opts.playoffTeams) acc.playoff++
      if (k < opts.byeTeams) acc.bye++
    })
    for (const i of s.winners) tally[i]!.confWin++
    for (let i = 0; i < n; i++) tally[i]!.wins += wins[i]!
  }

  const maxPts = new Float64Array(n)
  for (let i = 0; i < n; i++) maxPts[i] = base.pts[i]! + remainingCount[i]!

  const pct = (c: number) => Math.round((c / runs) * 1000) / 10
  const out = new Map<string, TeamProjection>()
  teams.forEach((t, i) => {
    const acc = tally[i]!
    const sure = guarantees(base, groups, maxPts, i, fmt, opts.byeTeams)
    // Games already banked include ties, which are neither a win nor a loss.
    // Leaving them out shortens the projected season for exactly the teams
    // that tied. Simulated games can't tie, so every remaining game lands in
    // the W or L column.
    const played = t.startWins + t.startLosses + t.startTies
    const totalGames = played + remainingCount[i]!
    const projWins = Math.round(acc.wins / runs)
    out.set(t.teamId, {
      proj_wins: projWins,
      proj_losses: Math.max(0, totalGames - t.startTies - projWins),
      playoff_pct: bounded(pct(acc.playoff), sure.playoffClinched, sure.eliminated),
      bye_pct: bounded(pct(acc.bye), sure.byeClinched, sure.byeOut),
      conf_win_pct: groups.size >= 2 ? bounded(pct(acc.confWin), sure.divClinched, sure.divOut) : 0,
      clinched_playoff: sure.playoffClinched,
      eliminated: sure.eliminated,
    })
  })
  return out
}
