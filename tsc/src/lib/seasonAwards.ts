// End-of-season awards, settled entirely by the data.
//
// Nobody votes on these. Every one of them falls out of the weekly scores and
// the weekly lineups, which means they are arguments the league cannot have:
// the manager who left the most points on his bench left the most points on
// his bench.
//
// All of it is regular season only. Playoff weeks are excluded because half
// the league is not playing them, and an award half the league cannot win is
// not an award.

import { createAdminClient } from '@/lib/supabase/admin'
import { leagueName } from '@/lib/pamsNames'

/** One manager's week: what they scored and what they were up against. */
export type WeekLine = {
  week: number
  managerId: string
  points: number
  opponentId: string
  opponentPoints: number
}

/** One roster spot in one week. */
export type LineupSlot = {
  week: number
  managerId: string
  slot: string
  isStarter: boolean
  position: string | null
  points: number
}

export type AwardsInput = {
  year: number
  /** Last week of the regular season. Weeks after this are dropped. */
  regularWeeks: number
  managers: { id: string; name: string }[]
  weeks: WeekLine[]
  lineups: LineupSlot[]
}

export type Runner = { name: string; value: string }

export type Award = {
  key: string
  /** The trophy. */
  title: string
  /** What it is actually measuring, in a few words. */
  kicker: string
  winner: string
  /** The number, formatted for the card. */
  value: string
  /** One sentence of context. */
  detail: string
  /** Second and third place, where the award has a field. */
  runners: Runner[]
}

// The nine slots PA Milk Society starts. Used to rebuild the best lineup each
// manager could have started from the players they actually rostered.
const OPTIMAL_SLOTS: ReadonlyArray<readonly string[]> = [
  ['QB'],
  ['RB'], ['RB'],
  ['WR'], ['WR'],
  ['TE'],
  ['RB', 'WR', 'TE'], // R/W/T flex
  ['K'],
  ['DEF'],
]

/**
 * The most points a manager could have started that week. Greedy by slot,
 * scarcest first, which is exact for this slot chart because the only
 * multi-position slot is the flex and it is filled last.
 *
 * Players on injured reserve are excluded: they were not startable, so
 * counting them would invent a decision nobody was allowed to make.
 */
export function optimalPoints(players: LineupSlot[]): number {
  const pool = players
    .filter((p) => p.slot !== 'RES' && p.position)
    .sort((a, b) => b.points - a.points)
  const used = new Array(pool.length).fill(false)
  let total = 0
  for (const eligible of OPTIMAL_SLOTS) {
    for (let i = 0; i < pool.length; i++) {
      if (!used[i] && eligible.includes(pool[i].position!)) {
        used[i] = true
        total += pool[i].points
        break
      }
    }
  }
  return total
}

type Row = {
  id: string
  name: string
  games: WeekLine[]
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  /** Points actually started, and the best that was available. */
  started: number
  optimal: number
  /** Optimal minus started: what the bench cost them. */
  left: number
  efficiency: number
  /** Standard deviation of the weekly score. */
  volatility: number
  /** Wins if they had played every other manager every week, scaled to a season. */
  allPlayWins: number
}

function buildRows(input: AwardsInput): Row[] {
  const inReg = (w: number) => w >= 1 && w <= input.regularWeeks
  const weeks = input.weeks.filter((g) => inReg(g.week))
  const lineups = input.lineups.filter((l) => inReg(l.week))

  const byManagerWeek = new Map<string, LineupSlot[]>()
  for (const l of lineups) {
    const key = `${l.managerId}|${l.week}`
    const bucket = byManagerWeek.get(key)
    if (bucket) bucket.push(l)
    else byManagerWeek.set(key, [l])
  }

  const rows: Row[] = []
  for (const m of input.managers) {
    const games = weeks.filter((g) => g.managerId === m.id).sort((a, b) => a.week - b.week)
    if (!games.length) continue

    const pointsFor = games.reduce((a, g) => a + g.points, 0)
    const mean = pointsFor / games.length

    let started = 0
    let optimal = 0
    for (const g of games) {
      const roster = byManagerWeek.get(`${m.id}|${g.week}`)
      if (!roster?.length) continue
      started += roster.filter((p) => p.isStarter).reduce((a, p) => a + p.points, 0)
      optimal += optimalPoints(roster)
    }

    // All-play: score against every other score in the same week. This is the
    // record a manager would have had with no schedule at all.
    let beat = 0
    let played = 0
    for (const g of games) {
      for (const other of weeks) {
        if (other.week !== g.week || other.managerId === m.id) continue
        played++
        if (g.points > other.points) beat++
      }
    }

    rows.push({
      id: m.id,
      name: m.name,
      games,
      wins: games.filter((g) => g.points > g.opponentPoints).length,
      losses: games.filter((g) => g.points < g.opponentPoints).length,
      pointsFor,
      pointsAgainst: games.reduce((a, g) => a + g.opponentPoints, 0),
      started,
      optimal,
      left: optimal - started,
      efficiency: optimal > 0 ? started / optimal : 0,
      volatility: Math.sqrt(games.reduce((a, g) => a + (g.points - mean) ** 2, 0) / games.length),
      allPlayWins: played ? Math.round((beat / played) * games.length) : 0,
    })
  }
  return rows
}

const one = (n: number) => n.toFixed(1)
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

/** Rank a field and turn the top three into an award. */
function leaderboard(
  rows: Row[],
  by: (r: Row) => number,
  format: (r: Row) => string,
): { winner: Row; runners: Runner[] } | null {
  const sorted = [...rows].sort((a, b) => by(b) - by(a))
  if (!sorted.length) return null
  return {
    winner: sorted[0],
    runners: sorted.slice(1, 3).map((r) => ({ name: r.name, value: format(r) })),
  }
}

/**
 * The whole slate. Awards that have no data behind them are dropped rather
 * than rendered empty, so a season without lineup coverage still produces the
 * scoreboard-only trophies.
 */
export function computeAwards(input: AwardsInput): Award[] {
  const rows = buildRows(input)
  const awards: Award[] = []
  if (!rows.length) return awards

  const hasLineups = rows.some((r) => r.optimal > 0)
  const games = input.weeks.filter((g) => g.week >= 1 && g.week <= input.regularWeeks)
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? 'somebody'

  // ── Bench management ──
  if (hasLineups) {
    const bench = leaderboard(rows.filter((r) => r.optimal > 0), (r) => r.left, (r) => `${one(r.left)} pts`)
    if (bench) {
      awards.push({
        key: 'bench-coat',
        title: 'The Bench Coat',
        kicker: 'Most points left sitting',
        winner: bench.winner.name,
        value: `${one(bench.winner.left)} pts`,
        detail: `Started ${pct(bench.winner.efficiency)} of what was on the roster. Over fourteen weeks that is ${one(bench.winner.left / input.regularWeeks)} points a week thrown in the bin, which is more than most games are decided by.`,
        runners: bench.runners,
      })
    }

    const steady = leaderboard(rows.filter((r) => r.optimal > 0), (r) => r.efficiency, (r) => pct(r.efficiency))
    if (steady) {
      awards.push({
        key: 'steady-hand',
        title: 'The Steady Hand',
        kicker: 'Best lineup efficiency',
        winner: steady.winner.name,
        value: pct(steady.winner.efficiency),
        detail: `Only ${one(steady.winner.left)} points left on the bench all year. Nobody in the league got closer to starting the right nine.`,
        runners: steady.runners,
      })
    }
  }

  // ── Schedule luck ──
  const unlucky = [...rows].sort((a, b) => (a.wins - a.allPlayWins) - (b.wins - b.allPlayWins))[0]
  if (unlucky && unlucky.wins - unlucky.allPlayWins < 0) {
    const gap = unlucky.allPlayWins - unlucky.wins
    awards.push({
      key: 'hard-luck',
      title: 'Hard Luck',
      kicker: 'Robbed by the schedule',
      winner: unlucky.name,
      value: `${gap} win${gap > 1 ? 's' : ''} short`,
      detail: `Finished ${unlucky.wins}-${unlucky.losses}, but against the whole league every week it would have been ${unlucky.allPlayWins}-${input.regularWeeks - unlucky.allPlayWins}. Scored plenty and kept drawing the wrong opponent.`,
      runners: [...rows]
        .sort((a, b) => (a.wins - a.allPlayWins) - (b.wins - b.allPlayWins))
        .slice(1, 3)
        .map((r) => ({ name: r.name, value: `${r.allPlayWins - r.wins} short` })),
    })
  }

  const lucky = [...rows].sort((a, b) => (b.wins - b.allPlayWins) - (a.wins - a.allPlayWins))[0]
  if (lucky && lucky.wins - lucky.allPlayWins > 0) {
    const gap = lucky.wins - lucky.allPlayWins
    awards.push({
      key: 'horseshoe',
      title: 'The Horseshoe',
      kicker: 'Carried by the schedule',
      winner: lucky.name,
      value: `${gap} win${gap > 1 ? 's' : ''} clear`,
      detail: `Went ${lucky.wins}-${lucky.losses} on scores that were worth ${lucky.allPlayWins}-${input.regularWeeks - lucky.allPlayWins} against the field. Every week, the right opponent.`,
      runners: [...rows]
        .sort((a, b) => (b.wins - b.allPlayWins) - (a.wins - a.allPlayWins))
        .slice(1, 3)
        .map((r) => ({ name: r.name, value: `+${r.wins - r.allPlayWins}` })),
    })
  }

  // ── The anvil ──
  const anvil = leaderboard(rows, (r) => r.pointsAgainst, (r) => one(r.pointsAgainst))
  if (anvil) {
    awards.push({
      key: 'anvil',
      title: 'The Anvil',
      kicker: 'Most points against',
      winner: anvil.winner.name,
      value: one(anvil.winner.pointsAgainst),
      detail: `Everybody who lined up against ${anvil.winner.name} played their best football of the year: ${one(anvil.winner.pointsAgainst / input.regularWeeks)} a week, and still went ${anvil.winner.wins}-${anvil.winner.losses}.`,
      runners: anvil.runners,
    })
  }

  // ── Volatility ──
  const wild = leaderboard(rows, (r) => r.volatility, (r) => `±${one(r.volatility)}`)
  if (wild) {
    awards.push({
      key: 'whiplash',
      title: 'Whiplash',
      kicker: 'Most week-to-week swing',
      winner: wild.winner.name,
      value: `±${one(wild.winner.volatility)}`,
      detail: `Nobody in the league was harder to predict. Ranged from ${one(Math.min(...wild.winner.games.map((g) => g.points)))} to ${one(Math.max(...wild.winner.games.map((g) => g.points)))} depending on the week.`,
      runners: wild.runners,
    })
  }

  const metronome = [...rows].sort((a, b) => a.volatility - b.volatility)[0]
  if (metronome) {
    awards.push({
      key: 'metronome',
      title: 'The Metronome',
      kicker: 'Same number every week',
      winner: metronome.name,
      value: `±${one(metronome.volatility)}`,
      detail: `Put up roughly ${one(metronome.pointsFor / input.regularWeeks)} every single week, whatever happened. The most boring and most reliable team in the league.`,
      runners: [...rows]
        .sort((a, b) => a.volatility - b.volatility)
        .slice(1, 3)
        .map((r) => ({ name: r.name, value: `±${one(r.volatility)}` })),
    })
  }

  // ── Single games. Each game shows up twice in `weeks`, once from each side,
  // so these are deduplicated by only taking the higher-scoring view. ──
  const decided = games.filter((g) => g.points > g.opponentPoints)

  const closest = [...decided].sort((a, b) => (a.points - a.opponentPoints) - (b.points - b.opponentPoints))[0]
  if (closest) {
    awards.push({
      key: 'photo-finish',
      title: 'The Photo Finish',
      kicker: 'Closest game of the year',
      winner: nameOf(closest.managerId),
      value: `by ${(closest.points - closest.opponentPoints).toFixed(2)}`,
      detail: `Week ${closest.week}: ${nameOf(closest.managerId)} ${one(closest.points)}, ${nameOf(closest.opponentId)} ${one(closest.opponentPoints)}. A tenth of a point either way and the season looks different.`,
      runners: [],
    })
  }

  const blowout = [...decided].sort((a, b) => (b.points - b.opponentPoints) - (a.points - a.opponentPoints))[0]
  if (blowout) {
    awards.push({
      key: 'woodshed',
      title: 'The Woodshed',
      kicker: 'Biggest beating of the year',
      winner: nameOf(blowout.managerId),
      value: `by ${one(blowout.points - blowout.opponentPoints)}`,
      detail: `Week ${blowout.week}: ${nameOf(blowout.managerId)} ${one(blowout.points)}, ${nameOf(blowout.opponentId)} ${one(blowout.opponentPoints)}. Not a game so much as an errand.`,
      runners: [],
    })
  }

  const wasted = [...games].filter((g) => g.points < g.opponentPoints).sort((a, b) => b.points - a.points)[0]
  if (wasted) {
    // Whether that score would have won any other game that week is a fact
    // about the week, not something to assert: some seasons it is the best
    // score on the board and some seasons it is third.
    const sameWeek = games.filter((g) => g.week === wasted.week && g.managerId !== wasted.managerId)
    const beatenBy = sameWeek.filter((g) => g.points > wasted.points).length
    const detail =
      beatenBy === 1
        ? `Week ${wasted.week}. The second-best score in the whole league that week, and it drew the only team that beat it: ${nameOf(wasted.opponentId)}, ${one(wasted.opponentPoints)}.`
        : `Week ${wasted.week}. ${one(wasted.points)} points, beaten by ${nameOf(wasted.opponentId)} scoring ${one(wasted.opponentPoints)}. ${beatenBy} other team${beatenBy === 1 ? '' : 's'} in the league scored higher that week.`
    awards.push({
      key: 'wasted',
      title: 'Wasted Effort',
      kicker: 'Best score that still lost',
      winner: nameOf(wasted.managerId),
      value: one(wasted.points),
      detail,
      runners: [],
    })
  }

  const robbery = [...decided].sort((a, b) => a.points - b.points)[0]
  if (robbery) {
    awards.push({
      key: 'robbery',
      title: 'Daylight Robbery',
      kicker: 'Worst score that still won',
      winner: nameOf(robbery.managerId),
      value: one(robbery.points),
      detail: `Week ${robbery.week}: ${one(robbery.points)} points, and a win anyway, because ${nameOf(robbery.opponentId)} managed ${one(robbery.opponentPoints)}. A win is a win.`,
      runners: [],
    })
  }

  const ceiling = [...games].sort((a, b) => b.points - a.points)[0]
  if (ceiling) {
    awards.push({
      key: 'ceiling',
      title: 'The Ceiling',
      kicker: 'Highest single week',
      winner: nameOf(ceiling.managerId),
      value: one(ceiling.points),
      detail: `Week ${ceiling.week}. The best any team managed all season.`,
      runners: [],
    })
  }

  const cellar = [...games].sort((a, b) => a.points - b.points)[0]
  if (cellar) {
    awards.push({
      key: 'cellar',
      title: 'The Cellar',
      kicker: 'Lowest single week',
      winner: nameOf(cellar.managerId),
      value: one(cellar.points),
      detail: `Week ${cellar.week}. Nine starters, ${one(cellar.points)} points between them.`,
      runners: [],
    })
  }

  return awards
}

/**
 * Read one season out of the database and grade it. Returns null when the
 * season has no scores, which is the honest answer for a year that has not
 * been played or ingested.
 */
export async function loadSeasonAwards(
  leagueId: string,
  year: number,
): Promise<{ year: number; regularWeeks: number; awards: Award[] } | null> {
  const admin = createAdminClient()

  const { data: season } = await admin
    .from('seasons')
    .select('id, playoff_weeks')
    .eq('league_id', leagueId)
    .eq('year', year)
    .maybeSingle()
  if (!season) return null

  const { data: managerRows } = await admin
    .from('managers')
    .select('id, display_name')
    .eq('league_id', leagueId)
  const managers = (managerRows ?? []).map((m) => ({
    id: m.id as string,
    name: leagueName(m.id as string, (m.display_name as string) ?? 'Unknown'),
  }))

  const { data: matchups } = await admin
    .from('matchups')
    .select('week, manager_a_id, manager_b_id, score_a, score_b')
    .eq('season_id', season.id)
  if (!matchups?.length) return null

  // The regular season is everything before the first playoff week. Falling
  // back to the highest week played covers a season whose playoff weeks were
  // never recorded.
  const playoffWeeks = (season.playoff_weeks as number[] | null) ?? []
  const maxWeek = Math.max(...matchups.map((m) => m.week as number))
  const regularWeeks = playoffWeeks.length ? Math.min(...playoffWeeks) - 1 : maxWeek

  const weeks: WeekLine[] = []
  for (const m of matchups) {
    if (m.score_a == null || m.score_b == null) continue
    weeks.push({
      week: m.week as number,
      managerId: m.manager_a_id as string,
      points: Number(m.score_a),
      opponentId: m.manager_b_id as string,
      opponentPoints: Number(m.score_b),
    })
    weeks.push({
      week: m.week as number,
      managerId: m.manager_b_id as string,
      points: Number(m.score_b),
      opponentId: m.manager_a_id as string,
      opponentPoints: Number(m.score_a),
    })
  }
  if (!weeks.length) return null

  // PostgREST caps a response at 1000 rows and a season of lineups runs to
  // roughly 3,200, so this has to be paged.
  const lineups: LineupSlot[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await admin
      .from('weekly_lineups')
      .select('week, manager_id, slot, is_starter, position, points')
      .eq('season_id', season.id)
      .range(from, from + page - 1)
    if (error || !data?.length) break
    for (const l of data) {
      lineups.push({
        week: l.week as number,
        managerId: l.manager_id as string,
        slot: (l.slot as string) ?? 'BN',
        isStarter: !!l.is_starter,
        position: (l.position as string | null) ?? null,
        points: Number(l.points ?? 0),
      })
    }
    if (data.length < page) break
  }

  const awards = computeAwards({ year, regularWeeks, managers, weeks, lineups })
  return { year, regularWeeks, awards }
}
