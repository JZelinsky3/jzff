// Weekly recap facts: everything the email and the page say about one
// finished week, computed from the database and nothing else.
//
// Every number a reader sees comes out of this file. The written intro on top
// (./intro.ts) may only repeat numbers produced here, so when a figure is
// wrong it is wrong in exactly one place.
//
// What goes in depends on the league owner's plan when the recap is built:
//   free    scores, the week's headlines, standings, streaks
//   rookie  + all-time records, power rankings, pick'ems, milestones
//   full    + bench mistakes and trades (the Veteran-locked pages)
// A free league's facts never contain the paid sections at all, so there is
// nothing on its page or in its email to unlock.

import { createAdminClient } from '@/lib/supabase/admin'
import { leagueName } from '@/lib/pamsNames'
import type { LockReason } from '@/lib/leagueTier'
import { getPowerRankings } from '@/lib/powerRankings'
import { getPickemsState, type PickemsState } from '@/lib/pickems'
import { getTradesState, type TradeAsset, type TradePublic } from '@/lib/trades'
import { getLeagueBundle } from '@/lib/leagueBundleCache'
import { commishRulesFor, effectivePlayoffRounds } from '@/lib/seasonRules'
import { weekOverAt } from '@/lib/nflClock'

// ── Tiers ─────────────────────────────────────────────────────────────────

export type RecapTier = 'free' | 'rookie' | 'full'

export function recapTierFor(lock: LockReason): RecapTier {
  if (lock === 'udfa') return 'free'
  if (lock === 'rookie') return 'rookie'
  return 'full'
}

// Which sections a tier may show. The page applies this to stored facts as
// well, so a league that drops to free stops showing paid sections on the
// recaps it already has.
export function recapSections(tier: RecapTier): { paid: boolean; veteran: boolean } {
  return { paid: tier !== 'free', veteran: tier === 'full' }
}

// ── Shape ─────────────────────────────────────────────────────────────────

export type RecapSide = { managerId: string; name: string; team: string | null; score: number }

export type RecapGame = {
  a: RecapSide
  b: RecapSide
  // null when the result isn't decided yet: the first leg of a two-week
  // playoff round.
  winner: 'a' | 'b' | 'tie' | null
  margin: number
  kind: 'regular' | 'playoff' | 'consolation' | 'championship'
  // Two-week playoff rounds. Totals are both legs combined, and only exist
  // on the second leg.
  leg: { n: 1 | 2; totalA: number | null; totalB: number | null } | null
}

export type RecapLine = {
  managerId: string
  name: string
  team: string | null
  score: number
  opponent: string
  opponentScore: number
  won: boolean
}

export type RecapStanding = {
  rank: number
  managerId: string
  name: string
  team: string | null
  wins: number
  losses: number
  ties: number
  pf: number
  // Places moved since last week, + is up. Null in week 1.
  change: number | null
}

export type RecapStreak = { name: string; kind: 'W' | 'L'; length: number }

export type RecapUpset = {
  winner: string
  loser: string
  winnerRecord: string
  loserRecord: string
  winnerScore: number
  loserScore: number
}

export type RecapPowerRow = {
  rank: number
  name: string
  team: string | null
  record: string
  delta: number
}

export type RecapPickRow = { name: string; right: number; wrong: number }

export type RecapPickems = {
  pickers: number
  best: RecapPickRow[]
  leader: RecapPickRow | null
}

export type RecapMilestone = { name: string; text: string }

export type RecapBench = {
  worst: { name: string; left: number; started: number; optimal: number } | null
  sharpest: { name: string; left: number; started: number } | null
}

export type RecapTrade = {
  headline: string
  sides: { manager: string; gets: string[] }[]
  summary: string | null
}

export type RecapFacts = {
  v: 1
  generatedAt: string
  league: { id: string; slug: string; name: string; abbr: string | null }
  year: number
  week: number
  tier: RecapTier
  phase: 'regular' | 'playoffs'
  history: { firstYear: number; seasons: number }

  games: RecapGame[]
  top: RecapLine | null
  low: RecapLine | null
  closest: RecapGame | null
  blowout: RecapGame | null
  upset: RecapUpset | null
  // Regular season only; null once the playoffs start.
  standings: RecapStanding[] | null
  streaks: RecapStreak[]

  // Rookie and up.
  records?: string[]
  power?: RecapPowerRow[] | null
  pickems?: RecapPickems | null
  milestones?: RecapMilestone[]

  // Veteran and up.
  bench?: RecapBench | null
  trades?: RecapTrade[]
}

export type BuildResult =
  | { status: 'ok'; facts: RecapFacts }
  | { status: 'no-league' | 'no-season' | 'no-games' }
  | { status: 'incomplete'; reason: string }

// ── Formatting, shared by the page, the email and the intro ──────────────

// Scores keep the precision the platform gave them. Sleeper scores to the
// hundredth, and rounding a 0.04-point game to "0.0" would be lying.
export function pts(n: number): string {
  const hundredths = Math.round(n * 100)
  return (hundredths / 100).toFixed(hundredths % 10 === 0 ? 1 : 2)
}

export function recordStr(w: number, l: number, t = 0): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

// ── Builder ───────────────────────────────────────────────────────────────

type MatchupRow = {
  week: number
  manager_a_id: string
  manager_b_id: string
  score_a: number | null
  score_b: number | null
  is_playoff: boolean | null
  is_championship: boolean | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function buildRecapFacts(args: {
  leagueId: string
  year: number
  week: number
  tier: RecapTier
}): Promise<BuildResult> {
  const { leagueId, year, week, tier } = args
  const db = createAdminClient()

  const { data: league } = await db
    .from('leagues')
    .select('id, name, slug, abbreviation, settings')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league) return { status: 'no-league' }

  const { data: seasonRows } = await db
    .from('seasons')
    .select('id, year, playoff_weeks, settings')
    .eq('league_id', leagueId)
  const seasons = (seasonRows ?? []) as {
    id: string
    year: number
    playoff_weeks: number[] | null
    settings: Record<string, unknown> | null
  }[]
  const season = seasons.find((s) => s.year === year)
  if (!season) return { status: 'no-season' }

  const [{ data: managerRows }, { data: profileRows }, { data: teamRows }, { data: matchupRows }] = await Promise.all([
    db.from('managers').select('id, display_name, profile_id').eq('league_id', leagueId),
    db.from('manager_profiles').select('id, canonical_name').eq('league_id', leagueId),
    db.from('manager_seasons').select('manager_id, team_name').eq('season_id', season.id),
    db
      .from('matchups')
      .select('week, manager_a_id, manager_b_id, score_a, score_b, is_playoff, is_championship')
      .eq('season_id', season.id),
  ])

  // The same name the rest of the site prints: the manager's profile (the
  // person, across every season and platform) when there is one, otherwise
  // the platform display name. Without the profile, a Sleeper league reads
  // as a list of usernames next to pick'ems rows that use real names.
  const profileName = new Map((profileRows ?? []).map((p) => [p.id as string, p.canonical_name as string]))
  const names = new Map<string, string>()
  for (const m of managerRows ?? []) {
    const profile = m.profile_id ? profileName.get(m.profile_id as string) : undefined
    names.set(m.id as string, profile || leagueName(m.id as string, (m.display_name as string) ?? 'Unknown'))
  }
  const teams = new Map<string, string | null>()
  for (const t of teamRows ?? []) teams.set(t.manager_id as string, (t.team_name as string | null) ?? null)
  const nameOf = (id: string) => names.get(id) ?? 'Unknown'
  const side = (id: string, score: number): RecapSide => ({
    managerId: id,
    name: nameOf(id),
    team: teams.get(id) ?? null,
    score: round2(score),
  })

  const all = ((matchupRows ?? []) as MatchupRow[]).map((m) => ({
    ...m,
    score_a: m.score_a == null ? null : Number(m.score_a),
    score_b: m.score_b == null ? null : Number(m.score_b),
  }))
  const weekRows = all.filter((m) => m.week === week)
  if (!weekRows.length) return { status: 'no-games' }

  // ── Playoff shape ──
  const rounds = effectivePlayoffRounds(season.settings, commishRulesFor(league.settings, year)) ?? []
  const stored = Array.isArray(season.playoff_weeks) ? season.playoff_weeks : []
  const playoffStart = rounds.length
    ? Math.min(...rounds.flat())
    : stored.length
      ? Math.min(...stored)
      : null
  const isRegular = (w: number) => playoffStart == null || w < playoffStart
  const playoffWeek = !isRegular(week) || weekRows.some((m) => m.is_playoff)

  // ── Is this week really over? ──
  // Same test the power rankings use for a settled week: every game has two
  // real scores. A zero almost always means the platform hasn't finalised.
  const seen = new Set<string>()
  for (const m of weekRows) {
    if (m.score_a == null || m.score_b == null) {
      return { status: 'incomplete', reason: `a week ${week} game has no final score yet` }
    }
    if (!(m.score_a > 0) || !(m.score_b > 0)) {
      return { status: 'incomplete', reason: `a week ${week} game shows a zero, so the platform has probably not finalised it` }
    }
    for (const id of [m.manager_a_id, m.manager_b_id]) {
      if (seen.has(id)) return { status: 'incomplete', reason: `${nameOf(id)} appears in two week ${week} games` }
      seen.add(id)
    }
  }
  // Every team that has played this regular season should be in a game this
  // week. The field is counted from the matchups themselves, not from
  // manager_seasons, which can carry stale rows (twfl has 25 of them for a
  // 16-team league).
  const field = new Set<string>()
  for (const m of all) {
    if (!isRegular(m.week)) continue
    field.add(m.manager_a_id)
    field.add(m.manager_b_id)
  }
  if (!playoffWeek) {
    const expected = Math.floor(field.size / 2)
    if (field.size > 1 && weekRows.length !== expected) {
      return {
        status: 'incomplete',
        reason: `week ${week} has ${weekRows.length} games for ${field.size} teams (expected ${expected})`,
      }
    }
  }

  // ── The games ──
  const round = playoffWeek ? rounds.find((r) => r.includes(week)) ?? null : null
  const legIndex = round && round.length === 2 ? round.indexOf(week) : -1
  const pairKey = (a: string, b: string) => [a, b].sort().join('|')

  const games: RecapGame[] = weekRows.map((m) => {
    const a = side(m.manager_a_id, m.score_a!)
    const b = side(m.manager_b_id, m.score_b!)
    const kind: RecapGame['kind'] = m.is_championship
      ? 'championship'
      : m.is_playoff
        ? 'playoff'
        : playoffWeek
          ? 'consolation'
          : 'regular'

    let leg: RecapGame['leg'] = null
    let winner: RecapGame['winner']
    let margin: number
    if (legIndex === 0) {
      leg = { n: 1, totalA: null, totalB: null }
      winner = null
      margin = round2(Math.abs(a.score - b.score))
    } else if (legIndex === 1) {
      const first = all.find(
        (x) => x.week === round![0] && pairKey(x.manager_a_id, x.manager_b_id) === pairKey(a.managerId, b.managerId),
      )
      if (first && first.score_a != null && first.score_b != null) {
        const firstA = first.manager_a_id === a.managerId ? first.score_a : first.score_b
        const firstB = first.manager_a_id === a.managerId ? first.score_b : first.score_a
        const totalA = round2(a.score + firstA)
        const totalB = round2(b.score + firstB)
        leg = { n: 2, totalA, totalB }
        winner = totalA > totalB ? 'a' : totalB > totalA ? 'b' : 'tie'
        margin = round2(Math.abs(totalA - totalB))
      } else {
        winner = a.score > b.score ? 'a' : b.score > a.score ? 'b' : 'tie'
        margin = round2(Math.abs(a.score - b.score))
      }
    } else {
      winner = a.score > b.score ? 'a' : b.score > a.score ? 'b' : 'tie'
      margin = round2(Math.abs(a.score - b.score))
    }
    return { a, b, winner, margin, kind, leg }
  })

  // Championship first, then the rest by margin so the page opens on the
  // tightest games rather than in database order.
  const kindOrder = { championship: 0, playoff: 1, regular: 2, consolation: 3 }
  games.sort((x, y) => kindOrder[x.kind] - kindOrder[y.kind] || x.margin - y.margin)

  // ── The week's headlines ──
  const lines: RecapLine[] = []
  for (const g of games) {
    lines.push({
      managerId: g.a.managerId, name: g.a.name, team: g.a.team, score: g.a.score,
      opponent: g.b.name, opponentScore: g.b.score, won: g.winner === 'a',
    })
    lines.push({
      managerId: g.b.managerId, name: g.b.name, team: g.b.team, score: g.b.score,
      opponent: g.a.name, opponentScore: g.a.score, won: g.winner === 'b',
    })
  }
  const top = lines.reduce<RecapLine | null>((best, l) => (!best || l.score > best.score ? l : best), null)
  const low = lines.reduce<RecapLine | null>((worst, l) => (!worst || l.score < worst.score ? l : worst), null)

  const decided = games.filter((g) => g.winner === 'a' || g.winner === 'b')
  const closest = decided.length ? [...decided].sort((x, y) => x.margin - y.margin)[0] : null
  const widest = decided.length > 1 ? [...decided].sort((x, y) => y.margin - x.margin)[0] : null
  const blowout = widest && widest !== closest ? widest : null

  // ── Standings, streaks and upsets: regular season only ──
  const settled = all.filter(
    (m) => isRegular(m.week) && m.score_a != null && m.score_b != null && m.score_a > 0 && m.score_b > 0,
  )
  // The teams in the standings are the ones that have played, for the same
  // stale-row reason as the completeness check above.
  const universe = new Set<string>([...field, ...weekRows.flatMap((m) => [m.manager_a_id, m.manager_b_id])])

  type Agg = { w: number; l: number; t: number; pf: number }
  const recordThrough = (w: number): Map<string, Agg> => {
    const agg = new Map<string, Agg>()
    for (const id of universe) agg.set(id, { w: 0, l: 0, t: 0, pf: 0 })
    for (const m of settled) {
      if (m.week > w) continue
      const a = agg.get(m.manager_a_id) ?? { w: 0, l: 0, t: 0, pf: 0 }
      const b = agg.get(m.manager_b_id) ?? { w: 0, l: 0, t: 0, pf: 0 }
      a.pf += m.score_a!
      b.pf += m.score_b!
      if (m.score_a! > m.score_b!) { a.w++; b.l++ } else if (m.score_b! > m.score_a!) { b.w++; a.l++ } else { a.t++; b.t++ }
      agg.set(m.manager_a_id, a)
      agg.set(m.manager_b_id, b)
    }
    return agg
  }
  const ranked = (agg: Map<string, Agg>) =>
    [...agg.entries()]
      .map(([id, r]) => ({ id, ...r, pct: r.w + r.l + r.t ? (r.w + r.t / 2) / (r.w + r.l + r.t) : 0 }))
      .sort((x, y) => y.pct - x.pct || y.pf - x.pf || nameOf(x.id).localeCompare(nameOf(y.id)))

  let standings: RecapStanding[] | null = null
  const streaks: RecapStreak[] = []
  let upset: RecapUpset | null = null

  if (!playoffWeek) {
    const now = ranked(recordThrough(week))
    const before = week > 1 ? ranked(recordThrough(week - 1)) : null
    const prevRank = new Map(before?.map((r, i) => [r.id, i + 1]) ?? [])
    standings = now.map((r, i) => ({
      rank: i + 1,
      managerId: r.id,
      name: nameOf(r.id),
      team: teams.get(r.id) ?? null,
      wins: r.w,
      losses: r.l,
      ties: r.t,
      pf: round2(r.pf),
      change: before ? (prevRank.get(r.id) ?? i + 1) - (i + 1) : null,
    }))

    for (const id of universe) {
      const results = settled
        .filter((m) => m.week <= week && (m.manager_a_id === id || m.manager_b_id === id))
        .sort((x, y) => x.week - y.week)
        .map((m) => {
          const mine = m.manager_a_id === id ? m.score_a! : m.score_b!
          const theirs = m.manager_a_id === id ? m.score_b! : m.score_a!
          return mine > theirs ? 'W' : mine < theirs ? 'L' : 'T'
        })
      const last = results[results.length - 1]
      if (last !== 'W' && last !== 'L') continue
      let n = 0
      for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++
      if (n >= 3) streaks.push({ name: nameOf(id), kind: last, length: n })
    }
    streaks.sort((x, y) => y.length - x.length || x.name.localeCompare(y.name))
    streaks.splice(4)

    // An upset needs a record to upset, so not before week 3.
    if (week >= 3) {
      const going = recordThrough(week - 1)
      let bestGap = 0
      for (const g of decided) {
        const win = g.winner === 'a' ? g.a : g.b
        const lose = g.winner === 'a' ? g.b : g.a
        const wr = going.get(win.managerId)
        const lr = going.get(lose.managerId)
        if (!wr || !lr) continue
        const gap = (lr.w - lr.l) - (wr.w - wr.l)
        if (gap >= 2 && gap > bestGap) {
          bestGap = gap
          upset = {
            winner: win.name,
            loser: lose.name,
            winnerRecord: recordStr(wr.w, wr.l, wr.t),
            loserRecord: recordStr(lr.w, lr.l, lr.t),
            winnerScore: win.score,
            loserScore: lose.score,
          }
        }
      }
    }
  }

  const seasonsWithGames = seasons.filter((s) => s.year <= year)
  const firstYear = seasonsWithGames.length ? Math.min(...seasonsWithGames.map((s) => s.year)) : year

  const facts: RecapFacts = {
    v: 1,
    generatedAt: new Date().toISOString(),
    league: {
      id: league.id as string,
      slug: league.slug as string,
      name: league.name as string,
      abbr: (league.abbreviation as string | null) ?? null,
    },
    year,
    week,
    tier,
    phase: playoffWeek ? 'playoffs' : 'regular',
    history: { firstYear, seasons: seasonsWithGames.length },
    games,
    top,
    low,
    closest,
    blowout,
    upset,
    standings,
    streaks,
  }

  const sections = recapSections(tier)
  if (!sections.paid) return { status: 'ok', facts }

  // Each extra is optional: one that fails drops its section rather than the
  // whole recap. Say which one in the logs, though, or a missing section is
  // indistinguishable from a quiet week.
  const slug = league.slug as string
  const soft = <T,>(label: string, p: Promise<T>): Promise<T | null> =>
    p.catch((e) => {
      console.warn(`[recap] ${slug} week ${week}: ${label} failed: ${(e as Error)?.message ?? e}`)
      return null
    })
  const [allTime, power, pickems, bundle, trades] = await Promise.all([
    soft('all-time scores', loadAllTimeScores(db, seasonsWithGames.map((s) => ({ id: s.id, year: s.year })))),
    soft('power rankings', getPowerRankings(slug)),
    soft("pick'ems", getPickemsState(slug)),
    soft('league bundle', getLeagueBundle(leagueId, slug)),
    sections.veteran ? soft('trades', getTradesState(slug)) : Promise.resolve(null),
  ])

  facts.records = buildRecords({ allTime, top, low, blowout, year, week, firstYear, nameOf })

  facts.power = null
  if (!playoffWeek && power?.status === 'ok' && power.year === year) {
    const snap = power.weeks.find((w) => w.week === week)
    if (snap?.overall.length) {
      facts.power = snap.overall.map((t) => ({
        rank: t.rank,
        name: names.get(t.team_id) ?? t.manager,
        team: t.team_name ?? null,
        record: recordStr(t.wins, t.losses, t.ties),
        delta: t.delta,
      }))
    }
  }

  facts.pickems = buildPickems(pickems, year, week)
  facts.milestones = buildMilestones(bundle?.['milestones.json'], week)

  if (sections.veteran) {
    facts.bench = buildBench(bundle?.['best_coach.json'], year, week, nameOf)
    const startDate = typeof season.settings?.season_start_date === 'string' ? season.settings.season_start_date : null
    facts.trades = buildTrades(trades, year, week, startDate, (id, fallback) => names.get(id) ?? fallback)
  }

  return { status: 'ok', facts }
}

// ── All-time records ──────────────────────────────────────────────────────

type TeamWeek = { year: number; week: number; managerId: string; score: number }
type AllTime = { teamWeeks: TeamWeek[]; margins: { year: number; week: number; winnerId: string; loserId: string; margin: number }[] }

async function loadAllTimeScores(
  db: ReturnType<typeof createAdminClient>,
  seasons: { id: string; year: number }[],
): Promise<AllTime | null> {
  // "League history" means nothing in a league's first season.
  if (seasons.length < 2) return null
  const yearOf = new Map(seasons.map((s) => [s.id, s.year]))
  const teamWeeks: TeamWeek[] = []
  const margins: AllTime['margins'] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from('matchups')
      .select('season_id, week, manager_a_id, manager_b_id, score_a, score_b')
      .in('season_id', [...yearOf.keys()])
      .order('id', { ascending: true })
      .range(from, from + page - 1)
    if (error || !data?.length) break
    for (const m of data) {
      const sa = m.score_a == null ? null : Number(m.score_a)
      const sb = m.score_b == null ? null : Number(m.score_b)
      if (sa == null || sb == null || !(sa > 0) || !(sb > 0)) continue
      const year = yearOf.get(m.season_id as string)!
      const week = m.week as number
      teamWeeks.push({ year, week, managerId: m.manager_a_id as string, score: sa })
      teamWeeks.push({ year, week, managerId: m.manager_b_id as string, score: sb })
      if (sa !== sb) {
        margins.push({
          year,
          week,
          winnerId: (sa > sb ? m.manager_a_id : m.manager_b_id) as string,
          loserId: (sa > sb ? m.manager_b_id : m.manager_a_id) as string,
          margin: Math.abs(sa - sb),
        })
      }
    }
    if (data.length < page) break
  }
  // Too few games for "in league history" to be worth saying.
  return teamWeeks.length >= 60 ? { teamWeeks, margins } : null
}

function buildRecords(args: {
  allTime: AllTime | null
  top: RecapLine | null
  low: RecapLine | null
  blowout: RecapGame | null
  year: number
  week: number
  firstYear: number
  nameOf: (id: string) => string
}): string[] {
  const { allTime, top, low, blowout, year, week, firstYear, nameOf } = args
  if (!allTime) return []
  const out: string[] = []
  const since = `since ${firstYear}`
  const isThis = (t: { year: number; week: number }) => t.year === year && t.week === week

  if (top) {
    const others = allTime.teamWeeks.filter((t) => !(isThis(t) && t.managerId === top.managerId))
    const rank = others.filter((t) => t.score > top.score).length + 1
    const tied = others.some((t) => t.score === top.score)
    if (rank === 1 && !tied) {
      out.push(`${top.name}'s ${pts(top.score)} is the highest score in league history (${since}).`)
    } else if (rank <= 3) {
      const best = [...others].sort((a, b) => b.score - a.score)[0]
      out.push(
        `${top.name}'s ${pts(top.score)} is the ${ordinal(rank)}-highest score in league history (${since}). The record is ${nameOf(best.managerId)}'s ${pts(best.score)} in ${best.year}.`,
      )
    }
  }

  if (low) {
    const others = allTime.teamWeeks.filter((t) => !(isThis(t) && t.managerId === low.managerId))
    const rank = others.filter((t) => t.score < low.score).length + 1
    const tied = others.some((t) => t.score === low.score)
    if (rank === 1 && !tied) {
      out.push(`${low.name}'s ${pts(low.score)} is the lowest score in league history (${since}).`)
    } else if (rank <= 3) {
      out.push(`${low.name}'s ${pts(low.score)} is the ${ordinal(rank)}-lowest score in league history (${since}).`)
    }
  }

  if (blowout && (blowout.winner === 'a' || blowout.winner === 'b') && !blowout.leg) {
    const winnerId = blowout.winner === 'a' ? blowout.a.managerId : blowout.b.managerId
    const others = allTime.margins.filter((m) => !(isThis(m) && m.winnerId === winnerId))
    const rank = others.filter((m) => m.margin > blowout.margin).length + 1
    if (rank <= 3) {
      const who = blowout.winner === 'a' ? blowout.a.name : blowout.b.name
      out.push(
        rank === 1
          ? `${who}'s ${pts(blowout.margin)}-point win is the biggest margin in league history (${since}).`
          : `${who}'s ${pts(blowout.margin)}-point win is the ${ordinal(rank)}-biggest margin in league history (${since}).`,
      )
    }
  }
  return out
}

// ── Pick'ems ──────────────────────────────────────────────────────────────

// Same scoring as the pick'ems page: a right or wrong call on every game with
// a known winner, except the picker's own game.
function buildPickems(state: PickemsState | null, year: number, week: number): RecapPickems | null {
  if (!state || state.status !== 'ok' || state.year !== year) return null
  const thisWeek = state.weeks.find((w) => w.week === week)
  if (!thisWeek || !Object.keys(thisWeek.winners ?? {}).length) return null

  const score = (profileId: string, teamId: string | null, weeks: typeof state.weeks) => {
    let right = 0
    let wrong = 0
    for (const w of weeks) {
      const sub = state.submissions[profileId]?.[w.id]
      if (!sub) continue
      for (const [matchupId, pick] of Object.entries(sub.picks ?? {})) {
        const winner = w.winners?.[matchupId]
        if (!winner) continue
        const m = w.matchups.find((x) => x.id === matchupId)
        if (teamId && m && (m.home === teamId || m.away === teamId)) continue
        if (pick === winner) right++
        else wrong++
      }
    }
    return { right, wrong }
  }

  const byRight = (a: RecapPickRow, b: RecapPickRow) => b.right - a.right || a.wrong - b.wrong || a.name.localeCompare(b.name)

  const weekRows = state.profiles
    .map((p) => ({ name: p.name, ...score(p.profileId, p.teamId, [thisWeek]) }))
    .filter((r) => r.right + r.wrong > 0)
    .sort(byRight)
  if (!weekRows.length) return null

  const seasonWeeks = state.weeks.filter((w) => w.week <= week)
  const seasonRows = state.profiles
    .map((p) => ({ name: p.name, ...score(p.profileId, p.teamId, seasonWeeks) }))
    .filter((r) => r.right + r.wrong > 0)
    .sort(byRight)

  const topRight = weekRows[0].right
  return {
    pickers: weekRows.length,
    best: weekRows.filter((r) => r.right === topRight).slice(0, 3),
    leader: seasonRows[0] ?? null,
  }
}

// ── Milestones ────────────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildMilestones(raw: unknown, week: number): RecapMilestone[] {
  const crossed = (raw as { crossed?: { name?: string; when?: string; achievement_html?: string }[] } | null)?.crossed
  if (!Array.isArray(crossed)) return []
  return crossed
    .filter((c) => String(c.when ?? '') === `W${week}` && c.name && c.achievement_html)
    .slice(0, 4)
    .map((c) => ({ name: c.name!, text: stripHtml(c.achievement_html!) }))
}

// ── Bench ─────────────────────────────────────────────────────────────────

function buildBench(raw: unknown, year: number, week: number, nameOf: (id: string) => string): RecapBench | null {
  const bc = raw as {
    year?: number
    managers?: { manager_id: string; weeks: { week: number; actual: number | null; optimal: number | null; left: number | null }[] }[]
  } | null
  if (!bc || bc.year !== year || !Array.isArray(bc.managers)) return null
  const rows = bc.managers
    .map((m) => ({ id: m.manager_id, wk: m.weeks.find((w) => w.week === week) }))
    .filter((r): r is { id: string; wk: { week: number; actual: number; optimal: number; left: number } } =>
      !!r.wk && r.wk.left != null && r.wk.actual != null && r.wk.optimal != null && r.wk.optimal > 0)
  // Half the league missing lineups means the numbers describe some other
  // week than the one people played. Say nothing rather than half a thing.
  if (rows.length < Math.max(2, bc.managers.length / 2)) return null

  const worst = [...rows].sort((a, b) => b.wk.left - a.wk.left)[0]
  const sharpest = [...rows].sort((a, b) => a.wk.left - b.wk.left || b.wk.actual - a.wk.actual)[0]
  return {
    worst: worst.wk.left > 0
      ? { name: nameOf(worst.id), left: round2(worst.wk.left), started: round2(worst.wk.actual), optimal: round2(worst.wk.optimal) }
      : null,
    sharpest: sharpest !== worst
      ? { name: nameOf(sharpest.id), left: round2(Math.max(0, sharpest.wk.left)), started: round2(sharpest.wk.actual) }
      : null,
  }
}

// ── Trades ────────────────────────────────────────────────────────────────

function assetLabel(a: TradeAsset): string {
  if (a.kind === 'player') return a.name ?? 'Player'
  if (a.kind === 'pick') return `${a.season_year} round ${a.round} pick`
  if (a.kind === 'faab') return `$${a.amount} FAAB`
  return ''
}

function buildTrades(
  state: Awaited<ReturnType<typeof getTradesState>>,
  year: number,
  week: number,
  seasonStartDate: string | null,
  // The trades feed carries raw platform names; the rest of the recap uses
  // the league's own (see pamsNames), so map through it.
  nameFor: (managerId: string, fallback: string) => string,
): RecapTrade[] {
  if (!state || state.status !== 'ok') return []
  const from = weekOverAt(year, week - 1, seasonStartDate)
  const to = weekOverAt(year, week, seasonStartDate)
  const inWeek = (t: TradePublic) => {
    if (t.season_year !== year) return false
    if (t.week != null) return t.week === week
    const at = Date.parse(t.executed_at)
    return at > from && at <= to
  }
  return [...state.current_trades, ...state.past_trades]
    .filter(inWeek)
    .sort((a, b) => Date.parse(a.executed_at) - Date.parse(b.executed_at))
    .slice(0, 4)
    .map((t) => {
      const sides = t.sides.map((s) => ({
        manager: nameFor(s.manager.id, s.manager.display_name),
        gets: s.assets.map(assetLabel).filter(Boolean),
      }))
      return { headline: sides.map((s) => s.manager).join(' and '), sides, summary: t.ai_summary }
    })
}
