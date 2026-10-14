// The Progress Report: the playoff race and a report card for every
// manager, every three weeks of the regular season.
//
// Editions fall every three weeks counting back from the last regular-season
// week, so the last one is always the final report card (pams, 14 weeks:
// 5, 8, 11, 14). Nothing is stored: an edition is rebuilt from the scores
// through its week, and the odds come from the same seeded simulator the
// power rankings use (lib/powerSim), so the same scores always give the
// same numbers and an old edition still reads as it did.
//
// Grades are on the league's curve, from where a manager ranks this season:
//   Scoring       points per game
//   Lineups       share of the best possible starting lineup's points
//   Roster moves  starter points from players who weren't on the week 1
//                 roster (pickups and trades)
// Luck isn't a grade, it's a note: actual wins against all-play wins.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentWeek } from '@/lib/liveSeason'
import { simulateSeason, standingsNow, type SimGame, type SimTeam } from '@/lib/powerSim'
import { commishRulesFor, effectiveRules, resolvePlayoffFormat } from '@/lib/seasonRules'
import { lineupWeekEfficiency, type LineupWeekRow } from '@/lib/export/pams'
import { leagueName } from '@/lib/pamsNames'
import { getLockReason } from '@/lib/leagueTier'
import { recapTierFor, type RecapTier } from '@/lib/recap/facts'

export const REPORT_EVERY = 3
const FIRST_REPORT_MIN_WEEK = 4
const RUNS = 8000 // same as the power rankings, so the odds match that page

export function reportWeeks(lastRegularWeek: number): number[] {
  const out: number[] = []
  for (let w = lastRegularWeek; w >= FIRST_REPORT_MIN_WEEK; w -= REPORT_EVERY) out.unshift(w)
  return out
}

export type Grade = { letter: string; points: number }

export type ReportTeam = {
  managerId: string
  name: string
  team: string | null
  avatar: string | null
  w: number
  l: number
  t: number
  pf: number
  ppg: number
  seed: number
  odds: number
  // Odds at the comparison week (the last edition, or week 1 on the first).
  before: number | null
  // Odds through each completed week, oldest first, for the sparkline.
  path: { week: number; odds: number }[]
  clinched: boolean
  eliminated: boolean
  projW: number
  projL: number
  next: { opponent: string; ifWin: number; ifLoss: number } | null
  expectedWins: number
  luck: number
  lineup: { actual: number; optimal: number; pct: number; left: number } | null
  moves: { pts: number; best: { name: string; pts: number } | null } | null
  ranks: { scoring: number; lineups: number | null; moves: number | null }
  grades: { scoring: Grade; lineups: Grade | null; moves: Grade | null; overall: Grade }
  gpa: number
  comment: string[]
}

export type ReportView = {
  league: { id: string; name: string; slug: string }
  year: number
  week: number
  edition: number
  editions: number[]
  final: boolean
  compareWeek: number | null
  compareIsEdition: boolean
  nextEdition: number | null
  playoffTeams: number
  lastRegularWeek: number
  tier: RecapTier
  teams: ReportTeam[]
}

export type ReportResult =
  | { status: 'none' }
  | { status: 'pending'; year: number; firstWeek: number | null }
  | { status: 'ok'; view: ReportView }

// ── Grades ────────────────────────────────────────────────────────────────

const LETTERS: [number, string, number][] = [
  // [percentile floor, letter, grade points]
  [0.92, 'A', 4.0],
  [0.8, 'A-', 3.7],
  [0.7, 'B+', 3.3],
  [0.6, 'B', 3.0],
  [0.5, 'B-', 2.7],
  [0.4, 'C+', 2.3],
  [0.3, 'C', 2.0],
  [0.2, 'C-', 1.7],
  [0.08, 'D', 1.0],
  [-1, 'F', 0],
]

function gradeFromPercentile(p: number): Grade {
  const [, letter, points] = LETTERS.find(([floor]) => p >= floor)!
  return { letter, points }
}

const GPA_LETTERS: [number, string][] = [
  [3.85, 'A'],
  [3.5, 'A-'],
  [3.15, 'B+'],
  [2.85, 'B'],
  [2.5, 'B-'],
  [2.15, 'C+'],
  [1.85, 'C'],
  [1.5, 'C-'],
  [0.85, 'D'],
  [-1, 'F'],
]

function gradeFromGpa(gpa: number): Grade {
  return { letter: GPA_LETTERS.find(([floor]) => gpa >= floor)![1], points: Math.round(gpa * 100) / 100 }
}

// Rank (1 = best) with ties sharing the better rank, and the percentile the
// grade comes from (1 = best, 0 = worst; tied teams share it).
function rankAll(values: Map<string, number>, higherIsBetter = true): Map<string, { rank: number; pct: number }> {
  const list = [...values.entries()].sort((a, b) => (higherIsBetter ? b[1] - a[1] : a[1] - b[1]))
  const n = list.length
  const out = new Map<string, { rank: number; pct: number }>()
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && Math.abs(list[j + 1]![1] - list[i]![1]) < 1e-9) j++
    const avg = (i + j) / 2
    for (let k = i; k <= j; k++) out.set(list[k]![0], { rank: i + 1, pct: n > 1 ? 1 - avg / (n - 1) : 0.5 })
    i = j + 1
  }
  return out
}

// ── Loader ────────────────────────────────────────────────────────────────

type Db = ReturnType<typeof createAdminClient>

// PostgREST caps a select at 1000 rows; a season of lineups is ~2,500.
async function allLineups(db: Db, seasonId: string, throughWeek: number) {
  type Row = LineupWeekRow & { week: number; manager_id: string }
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('weekly_lineups')
      .select('id, week, manager_id, player_external_id, player_name, position, slot, is_starter, points')
      .eq('season_id', seasonId)
      .lte('week', throughWeek)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error || !data) break
    for (const r of data) out.push({ ...(r as Row), points: r.points == null ? null : Number(r.points) })
    if (data.length < 1000) break
  }
  return out
}

export async function loadReport(
  league: { id: string; name: string; slug: string; owner_id: string | null },
  askedWeek?: number | null,
): Promise<ReportResult> {
  const db = createAdminClient()
  const [{ data: leagueRow }, { data: season }] = await Promise.all([
    db.from('leagues').select('settings, division_names').eq('id', league.id).maybeSingle(),
    db.from('seasons').select('id, year, settings, playoff_weeks').eq('league_id', league.id).eq('is_live', true).maybeSingle(),
  ])
  if (!leagueRow || !season) return { status: 'none' }

  const [{ data: managers }, { data: profiles }, { data: roster }, { data: matchups }] = await Promise.all([
    db.from('managers').select('id, display_name, avatar_url, profile_id').eq('league_id', league.id),
    db.from('manager_profiles').select('id, canonical_name').eq('league_id', league.id),
    db.from('manager_seasons').select('manager_id, team_name, avatar_url, division_index').eq('season_id', season.id),
    db.from('matchups').select('week, manager_a_id, manager_b_id, score_a, score_b').eq('season_id', season.id),
  ])

  // ── Season shape: the same rules the power rankings use ──
  const settings = (season.settings ?? {}) as Record<string, unknown>
  const currentWeek = resolveCurrentWeek(settings)
  const rules = effectiveRules(season.settings, commishRulesFor(leagueRow.settings, season.year as number))
  const playoffWeeks: number[] = Array.isArray(season.playoff_weeks) ? (season.playoff_weeks as number[]) : []
  const playoffStart = rules.playoff_week_start ?? (playoffWeeks.length > 0 ? Math.min(...playoffWeeks) : 15)
  const lastRegularWeek = playoffStart - 1
  const editions = reportWeeks(lastRegularWeek)

  const games = (matchups ?? []).map((m) => ({
    week: m.week as number,
    a: m.manager_a_id as string,
    b: m.manager_b_id as string,
    sa: m.score_a == null ? 0 : Number(m.score_a),
    sb: m.score_b == null ? 0 : Number(m.score_b),
  }))
  const byWeek = new Map<number, typeof games>()
  for (const g of games) byWeek.set(g.week, [...(byWeek.get(g.week) ?? []), g])
  // Settled: every game has two real scores (a zero is an unplayed side).
  const settled = (w: number) => {
    const list = byWeek.get(w) ?? []
    return list.length > 0 && list.every((g) => g.sa > 0 && g.sb > 0)
  }
  let lastDone = 0
  for (let w = 1; w <= lastRegularWeek; w++) {
    if (currentWeek != null && w > currentWeek) break
    if (!settled(w)) break
    lastDone = w
  }
  const available = editions.filter((w) => w <= lastDone)
  if (!available.length) return { status: 'pending', year: season.year as number, firstWeek: editions[0] ?? null }
  const week = askedWeek && available.includes(askedWeek) ? askedWeek : available[available.length - 1]!

  // ── Who's in it ──
  const profileName = new Map((profiles ?? []).map((p) => [p.id as string, p.canonical_name as string]))
  const mgr = new Map((managers ?? []).map((m) => [m.id as string, m]))
  // The field is whoever played this season's games, not manager_seasons:
  // that table carries stale rows (twfl: 26 for 16 teams), and a phantom
  // 0-0 team would sit in the standings, the sim and the grading curve.
  const playing = new Set(games.flatMap((g) => [g.a, g.b]).filter(Boolean))
  const rosterRow = new Map((roster ?? []).map((r) => [r.manager_id as string, r]))
  const teamRows = [...playing].map((id) => {
    const r = rosterRow.get(id)
    return {
      id,
      team: (r?.team_name as string | null) ?? null,
      avatar: (r?.avatar_url as string | null) ?? null,
      div: (r?.division_index as number | null) ?? null,
    }
  })
  const nameOf = (id: string) => {
    const m = mgr.get(id)
    const profile = m?.profile_id ? profileName.get(m.profile_id as string) : undefined
    return profile || leagueName(id, (m?.display_name as string) ?? 'Unknown')
  }
  const divisionNames: string[] = Array.isArray(leagueRow.division_names) ? (leagueRow.division_names as string[]) : []
  const hasDivisions = divisionNames.length > 0 && teamRows.some((t) => t.div != null)
  const playoffTeams = rules.playoff_team_count ?? (teamRows.length >= 10 ? 6 : Math.max(2, Math.round(teamRows.length / 2)))
  const byeTeams = playoffTeams === 6 ? 2 : 0
  const playoffFormat = resolvePlayoffFormat(rules.playoff_format, hasDivisions)

  const playedThrough = (w: number): SimGame[] =>
    games.filter((g) => g.week <= w && g.week < playoffStart && settled(g.week)).map(({ a, b, sa, sb }) => ({ a, b, sa, sb }))
  const simTeamsFor = (played: SimGame[]): SimTeam[] => {
    const acc = new Map(teamRows.map((t) => [t.id, { w: 0, l: 0, t: 0, pf: 0, g: 0 }]))
    for (const g of played) {
      const a = acc.get(g.a)
      const b = acc.get(g.b)
      if (!a || !b) continue
      a.pf += g.sa
      b.pf += g.sb
      a.g++
      b.g++
      if (g.sa > g.sb) {
        a.w++
        b.l++
      } else if (g.sa < g.sb) {
        b.w++
        a.l++
      } else {
        a.t++
        b.t++
      }
    }
    return teamRows.map((t) => {
      const r = acc.get(t.id)!
      return {
        teamId: t.id,
        division: hasDivisions ? t.div : null,
        ppg: r.g > 0 ? r.pf / r.g : 0,
        games: r.g,
        startWins: r.w,
        startLosses: r.l,
        startTies: r.t,
        startPf: r.pf,
      }
    })
  }
  const remainingAfter = (w: number) =>
    games.filter((g) => g.week > w && g.week < playoffStart).map(({ a, b }) => ({ a, b }))
  const simAt = (w: number, withNext: boolean) => {
    const played = playedThrough(w)
    const next = withNext && w + 1 < playoffStart ? (byWeek.get(w + 1) ?? []).map(({ a, b }) => ({ a, b })) : undefined
    return simulateSeason(simTeamsFor(played), remainingAfter(w), {
      playoffTeams,
      byeTeams,
      runs: RUNS,
      played,
      format: playoffFormat,
      ...(next ? { next } : {}),
    })
  }

  // Odds through every week up to this edition (the sparkline), with next
  // week's swing on the edition itself.
  const oddsByWeek = new Map<number, ReturnType<typeof simAt>>()
  for (let w = 1; w <= week; w++) oddsByWeek.set(w, simAt(w, w === week))
  const now = oddsByWeek.get(week)!
  const prevEdition = [...editions].reverse().find((w) => w < week) ?? null
  const compareWeek = prevEdition ?? (week > 1 ? 1 : null)
  const before = compareWeek ? oddsByWeek.get(compareWeek) ?? null : null

  const played = playedThrough(week)
  const standing = standingsNow(simTeamsFor(played), played, { playoffTeams, format: playoffFormat })

  // ── All-play: every week, each score against every other score ──
  const n = teamRows.length
  const allPlay = new Map(teamRows.map((t) => [t.id, { w: 0, l: 0, t: 0 }]))
  for (let w = 1; w <= week; w++) {
    const scores: { id: string; s: number }[] = []
    for (const g of byWeek.get(w) ?? []) scores.push({ id: g.a, s: g.sa }, { id: g.b, s: g.sb })
    for (const x of scores) {
      const rec = allPlay.get(x.id)
      if (!rec) continue
      for (const y of scores) {
        if (y.id === x.id) continue
        if (x.s > y.s) rec.w++
        else if (x.s < y.s) rec.l++
        else rec.t++
      }
    }
  }

  // ── Lineups and roster moves ──
  const lineups = await allLineups(db, season.id as string, week)
  const lineupBy = new Map<string, Map<number, LineupWeekRow[]>>()
  for (const r of lineups) {
    const m = lineupBy.get(r.manager_id) ?? new Map<number, LineupWeekRow[]>()
    m.set(r.week, [...(m.get(r.week) ?? []), r])
    lineupBy.set(r.manager_id, m)
  }
  const hasLineups = lineupBy.size >= Math.max(2, n - 1)
  const lineupOf = new Map<string, ReportTeam['lineup']>()
  const movesOf = new Map<string, ReportTeam['moves']>()
  for (const t of teamRows) {
    const weeks = lineupBy.get(t.id)
    if (!weeks || !hasLineups) continue
    let actual = 0
    let optimal = 0
    let counted = 0
    for (let w = 1; w <= week; w++) {
      const eff = lineupWeekEfficiency(weeks.get(w) ?? [])
      if (!eff) continue
      actual += eff.actual
      optimal += Math.max(eff.optimal, eff.actual)
      counted++
    }
    if (counted) {
      lineupOf.set(t.id, {
        actual: round2(actual),
        optimal: round2(optimal),
        pct: optimal > 0 ? actual / optimal : 1,
        left: round2(optimal - actual),
      })
    }
    // Starters who weren't on the week 1 roster.
    const first = new Set((weeks.get(1) ?? []).map((r) => r.player_external_id))
    if (first.size) {
      let pts = 0
      const byPlayer = new Map<string, { name: string; pts: number }>()
      for (let w = 2; w <= week; w++) {
        for (const r of weeks.get(w) ?? []) {
          if (!r.is_starter || first.has(r.player_external_id) || !(r.points != null && r.points > 0)) continue
          pts += r.points
          const p = byPlayer.get(r.player_external_id) ?? { name: r.player_name ?? 'Unknown', pts: 0 }
          p.pts += r.points
          byPlayer.set(r.player_external_id, p)
        }
      }
      const best = [...byPlayer.values()].sort((a, b) => b.pts - a.pts)[0] ?? null
      movesOf.set(t.id, { pts: round2(pts), best: best ? { name: best.name, pts: round2(best.pts) } : null })
    }
  }

  // ── Ranks and grades ──
  const sim = simTeamsFor(played)
  const simOf = new Map(sim.map((s) => [s.teamId, s]))
  const scoringRank = rankAll(new Map(sim.map((s) => [s.teamId, s.ppg])))
  const lineupRank = lineupOf.size === n ? rankAll(new Map([...lineupOf].map(([id, l]) => [id, l!.pct]))) : null
  const movesRank = movesOf.size === n ? rankAll(new Map([...movesOf].map(([id, m]) => [id, m!.pts]))) : null

  const teams: ReportTeam[] = teamRows.map((t) => {
    const s = simOf.get(t.id)!
    const p = now.get(t.id)
    const ap = allPlay.get(t.id)!
    const apGames = ap.w + ap.l + ap.t
    const gamesPlayed = s.startWins + s.startLosses + s.startTies
    const expectedWins = apGames ? ((ap.w + ap.t / 2) / apGames) * gamesPlayed : 0
    const scoring = gradeFromPercentile(scoringRank.get(t.id)!.pct)
    const lineups = lineupRank ? gradeFromPercentile(lineupRank.get(t.id)!.pct) : null
    const moves = movesRank ? gradeFromPercentile(movesRank.get(t.id)!.pct) : null
    const parts: [Grade, number][] = [[scoring, 0.5]]
    if (lineups) parts.push([lineups, 0.25])
    if (moves) parts.push([moves, 0.25])
    const weight = parts.reduce((sum, [, w]) => sum + w, 0)
    const gpa = parts.reduce((sum, [g, w]) => sum + g.points * w, 0) / weight
    const nextGame = (byWeek.get(week + 1) ?? []).find((g) => g.a === t.id || g.b === t.id)
    return {
      managerId: t.id,
      name: nameOf(t.id),
      team: t.team,
      avatar: t.avatar ?? ((mgr.get(t.id)?.avatar_url as string | null) ?? null),
      w: s.startWins,
      l: s.startLosses,
      t: s.startTies,
      pf: round2(s.startPf),
      ppg: round2(s.ppg),
      seed: standing.get(t.id)?.seed ?? 0,
      odds: p?.playoff_pct ?? 0,
      before: before?.get(t.id)?.playoff_pct ?? null,
      path: [...oddsByWeek.entries()].map(([w, m]) => ({ week: w, odds: m.get(t.id)?.playoff_pct ?? 0 })),
      clinched: !!p?.clinched_playoff,
      eliminated: !!p?.eliminated,
      projW: p?.proj_wins ?? s.startWins,
      projL: p?.proj_losses ?? s.startLosses,
      next:
        nextGame && week + 1 < playoffStart && p?.if_win_pct != null && p.if_loss_pct != null
          ? { opponent: nameOf(nextGame.a === t.id ? nextGame.b : nextGame.a), ifWin: p.if_win_pct, ifLoss: p.if_loss_pct }
          : null,
      expectedWins: Math.round(expectedWins * 10) / 10,
      luck: Math.round((s.startWins + s.startTies / 2 - expectedWins) * 10) / 10,
      lineup: lineupOf.get(t.id) ?? null,
      moves: movesOf.get(t.id) ?? null,
      ranks: {
        scoring: scoringRank.get(t.id)!.rank,
        lineups: lineupRank?.get(t.id)?.rank ?? null,
        moves: movesRank?.get(t.id)?.rank ?? null,
      },
      grades: { scoring, lineups, moves, overall: gradeFromGpa(gpa) },
      gpa: Math.round(gpa * 100) / 100,
      comment: [],
    }
  })
  teams.sort((a, b) => b.odds - a.odds || a.seed - b.seed)
  for (const t of teams) t.comment = commentFor(t, teams, { compareWeek, compareIsEdition: prevEdition != null, week, playoffTeams })

  const lock = await getLockReason(league.id, league.owner_id)
  const final = week === lastRegularWeek
  return {
    status: 'ok',
    view: {
      league: { id: league.id, name: league.name, slug: league.slug },
      year: season.year as number,
      week,
      edition: editions.indexOf(week) + 1,
      editions,
      final,
      compareWeek,
      compareIsEdition: prevEdition != null,
      nextEdition: editions.find((w) => w > week) ?? null,
      playoffTeams,
      lastRegularWeek,
      tier: recapTierFor(lock),
      teams,
    },
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── The teacher's comments ────────────────────────────────────────────────
//
// Two sentences per manager from the facts that stand out most, each a
// different kind. No names: the card already says whose it is, and a
// sentence that starts with a Sleeper username reads badly.

type Line = { kind: string; weight: number; text: string }

function pct(n: number): string {
  return `${Math.round(n)}%`
}

function one(n: number): string {
  return n.toFixed(1)
}

function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function commentFor(
  t: ReportTeam,
  all: ReportTeam[],
  ctx: { compareWeek: number | null; compareIsEdition: boolean; week: number; playoffTeams: number },
): string[] {
  const n = all.length
  const lines: Line[] = []

  if (t.clinched) lines.push({ kind: 'odds', weight: 100, text: 'Has already clinched a playoff spot.' })
  else if (t.eliminated) lines.push({ kind: 'odds', weight: 100, text: 'Is out of the playoff race.' })
  else if (t.before != null && ctx.compareWeek) {
    const d = Math.round(t.odds - t.before)
    const since = ctx.compareIsEdition ? `the week ${ctx.compareWeek} report` : `week ${ctx.compareWeek}`
    if (Math.abs(d) >= 8) {
      lines.push({
        kind: 'odds',
        weight: Math.abs(d),
        text: `Playoff odds are ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} points since ${since}, to ${pct(t.odds)}.`,
      })
    }
  }

  if (t.next && !t.clinched && !t.eliminated) {
    const swing = t.next.ifWin - t.next.ifLoss
    if (swing >= 18) {
      // The race table prints every team's win and loss odds, so this only
      // leads when the swing is big, and the wording rotates by team so a
      // page of cards doesn't repeat one sentence.
      const o = t.next.opponent
      const phrasings = [
        `Next week against ${o} is worth ${Math.round(swing)} points of playoff odds: ${pct(t.next.ifWin)} with a win, ${pct(t.next.ifLoss)} with a loss.`,
        `Beat ${o} next week and the odds go to ${pct(t.next.ifWin)}. Lose and they drop to ${pct(t.next.ifLoss)}.`,
        `A win over ${o} next week means ${pct(t.next.ifWin)} odds, a loss ${pct(t.next.ifLoss)}.`,
      ]
      lines.push({ kind: 'next', weight: swing * 0.6, text: phrasings[hashOf(t.managerId) % phrasings.length]! })
    }
  }

  if (Math.abs(t.luck) >= 0.8) {
    const wins = Math.abs(t.luck)
    lines.push({
      kind: 'luck',
      weight: wins * 18,
      // Expected wins = the share of every other team's score beaten each
      // week, times games played (an all-play record).
      text:
        t.luck < 0
          ? `Unlucky so far: the scores are worth ${one(t.expectedWins)} wins, the record shows ${t.w}.`
          : `Lucky so far: the scores are worth ${one(t.expectedWins)} wins, the record shows ${t.w}.`,
    })
  }

  if (t.ranks.scoring === 1) lines.push({ kind: 'scoring', weight: 30, text: `The league's top scorer at ${one(t.ppg)} a week.` })
  else if (t.ranks.scoring === n) lines.push({ kind: 'scoring', weight: 26, text: `The league's lowest scorer at ${one(t.ppg)} a week.` })

  // Lineups: the best and worst three.
  const lr = t.ranks.lineups
  if (t.lineup && lr != null && lr <= 3) {
    const who = lr === 1 ? 'The best lineup setter in the league' : `The ${ordinal(lr)}-best lineup setter in the league`
    lines.push({ kind: 'lineups', weight: lr === 1 ? 24 : 14, text: `${who}, starting ${pct(t.lineup.pct * 100)} of the possible points.` })
  } else if (t.lineup && lr != null && lr >= n - 2) {
    const most = lr === n ? 'the most in the league' : `${ordinal(n - lr + 1)} most in the league`
    lines.push({ kind: 'lineups', weight: lr === n ? 24 : 14, text: `Has left ${Math.round(t.lineup.left)} points on the bench, ${most}.` })
  }

  // Roster moves: the top three, or nobody added at all.
  const mr = t.ranks.moves
  if (t.moves && mr != null && mr <= 3 && t.moves.pts > 0) {
    const most = mr === 1 ? 'the most of anyone' : `${ordinal(mr)} most in the league`
    const best = t.moves.best ? `, led by ${t.moves.best.name}` : ''
    lines.push({ kind: 'moves', weight: mr === 1 ? 22 : 13, text: `Players added since week 1 have started for ${Math.round(t.moves.pts)} points, ${most}${best}.` })
  } else if (t.moves && t.moves.pts === 0) {
    lines.push({ kind: 'moves', weight: 8, text: "Hasn't started anyone who wasn't on the week 1 roster." })
  }

  // The bubble.
  const playoffTeams = ctx.playoffTeams
  if (!t.clinched && !t.eliminated) {
    if (t.seed === playoffTeams) {
      lines.push({ kind: 'seed', weight: 12, text: `Holds the last playoff spot in the standings today, seeded ${ordinal(t.seed)}.` })
    } else if (t.seed === playoffTeams + 1) {
      lines.push({ kind: 'seed', weight: 12, text: `Would miss the playoffs if the season ended today: ${ordinal(t.seed)} in the standings.` })
    }
  }

  // Something for the quiet middle.
  lines.push({ kind: 'proj', weight: 6, text: `The sim has them finishing ${t.projW}-${t.projL}.` })
  lines.push({ kind: 'grade', weight: 5, text: `Scores ${one(t.ppg)} a week, ${ordinal(t.ranks.scoring)} in the league.` })

  const out: string[] = []
  const used = new Set<string>()
  for (const l of lines.sort((a, b) => b.weight - a.weight)) {
    if (used.has(l.kind) || (l.kind === 'grade' && used.has('scoring'))) continue
    used.add(l.kind)
    out.push(l.text)
    if (out.length === 2) break
  }
  return out
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}
