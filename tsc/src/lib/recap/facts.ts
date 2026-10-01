// Weekly recap facts: everything the email and the page say about one
// finished week, computed from the database and nothing else.
//
// Every number a reader sees comes out of this file. The written intro on top
// (./intro.ts) may only repeat numbers produced here, so when a figure is
// wrong it is wrong in exactly one place.
//
// The bar is Sleeper's own weekly recap (top and low score, best at each
// position, best bench player, efficiency, best score in a loss, worst in a
// win, blowout, closest, projections, standings). This covers all of that
// where the data exists, and then the part no platform can do because none
// of them keeps a league's history: the all-time series behind every game,
// career highs and lows, how past teams with the same start finished, and a
// card for every manager with next week already lined up.
//
// What goes in depends on the league owner's plan when the recap is built:
//   free    scores, the week's awards, every team's card, standings, series,
//           next week's slate
//   rookie  + record book, power rankings and odds, pick'ems, milestones,
//           the lineup desk, next week's lines
//   full    + trades, trade verdicts, Manager DNA archetypes
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
import { lineupWeekEfficiency } from '@/lib/export/pams'

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

export const RECAP_FACTS_VERSION = 2

// An all-time series between two people, from one side's point of view.
export type RecapSeries = { w: number; l: number; t: number; since: number }

export type RecapSide = {
  managerId: string
  name: string
  team: string | null
  avatar: string | null
  score: number
}

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
  // The all-time series after this game, from side a's point of view.
  series: RecapSeries | null
  // One line of history about this meeting, when there is one worth saying.
  seriesNote: string | null
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

export type RecapAward = { key: string; title: string; value: string; who: string; detail: string }

export type RecapTeamCard = {
  managerId: string
  profileId: string | null
  name: string
  team: string | null
  avatar: string | null
  score: number
  opponent: string | null
  opponentScore: number | null
  result: 'W' | 'L' | 'T' | null
  // 1 = best score of the week.
  weekRank: number
  // This week's score against every other score this week.
  allPlay: { w: number; l: number; t: number }
  record: string | null
  place: number | null
  placeChange: number | null
  streak: { kind: 'W' | 'L'; length: number } | null
  // One line of personal history: career high, best since a year, and so on.
  note: string | null
  // All-time series against this week's opponent, after this game.
  series: RecapSeries | null
  next: { opponent: string; series: RecapSeries | null; favored: boolean | null; spread: number | null } | null
  // Rookie and up.
  power?: { rank: number; delta: number } | null
  odds?: { now: number; change: number | null } | null
  // Veteran and up.
  archetype?: string | null
}

export type RecapStanding = {
  rank: number
  managerId: string
  name: string
  team: string | null
  avatar: string | null
  wins: number
  losses: number
  ties: number
  pf: number
  // Places moved since last week, + is up. Null in week 1.
  change: number | null
  // Rookie and up: playoff odds from the power rankings sim, 0 to 100.
  odds?: number | null
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
  avatar: string | null
  record: string
  delta: number
  odds: number | null
  oddsChange: number | null
}

export type RecapPickRow = { name: string; right: number; wrong: number }

export type RecapPickems = {
  pickers: number
  best: RecapPickRow[]
  leaders: RecapPickRow[]
  // The game the room got most wrong, when one stands out.
  crowd: string | null
}

export type RecapMilestone = { name: string; text: string }

export type RecapLineups = {
  // Best starter at each position this week.
  mvps: { pos: string; player: string; nfl: string | null; points: number; manager: string }[]
  benchBest: { player: string; pos: string | null; points: number; manager: string } | null
  efficiency: {
    best: { name: string; pct: number; left: number }
    worst: { name: string; pct: number; left: number }
  } | null
  // Only where the platform supplies projections (ESPN and Yahoo do, Sleeper
  // doesn't through its league API).
  projections: {
    over: { name: string; actual: number; projected: number }
    under: { name: string; actual: number; projected: number }
  } | null
}

export type RecapTrade = {
  headline: string
  sides: { manager: string; gets: string[] }[]
  summary: string | null
}

export type RecapVerdict = { headline: string; summary: string }

export type RecapNextGame = {
  a: { name: string; avatar: string | null; record: string | null }
  b: { name: string; avatar: string | null; record: string | null }
  series: RecapSeries | null
  // Rookie and up, off the matchup preview.
  spread?: number | null
  favorite?: 'a' | 'b' | null
  gotw?: boolean
  code?: string | null
}

export type RecapNext = {
  week: number
  games: RecapNextGame[]
  // Rookie and up.
  milestones?: string[]
  picksLockAt?: string | null
}

export type RecapFacts = {
  v: 2
  generatedAt: string
  league: { id: string; slug: string; name: string; abbr: string | null }
  year: number
  week: number
  tier: RecapTier
  phase: 'regular' | 'playoffs'
  history: { firstYear: number; seasons: number }

  games: RecapGame[]
  awards: RecapAward[]
  top: RecapLine | null
  low: RecapLine | null
  closest: RecapGame | null
  blowout: RecapGame | null
  upset: RecapUpset | null
  // Regular season only; null once the playoffs start.
  standings: RecapStanding[] | null
  streaks: RecapStreak[]
  teams: RecapTeamCard[]
  next: RecapNext | null
  // Short history angles, strongest first, for the subject line and the
  // intro to lead with. "Joey snaps Mason's 5-game run", "Charlie's best
  // score since 2023". Tier-safe: built only from facts this tier carries.
  hooks: string[]

  // Rookie and up.
  records?: string[]
  power?: RecapPowerRow[] | null
  playoffTeams?: number | null
  pickems?: RecapPickems | null
  milestones?: RecapMilestone[]
  lineups?: RecapLineups | null

  // Veteran and up.
  trades?: RecapTrade[]
  verdicts?: RecapVerdict[]
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

// "Connie leads Luke 5-4 since 2020", from `me`'s side of the series.
export function seriesLine(me: string, them: string, s: RecapSeries): string {
  const since = `since ${s.since}`
  if (s.w > s.l) return `${me} leads ${them} ${recordStr(s.w, s.l, s.t)} ${since}`
  if (s.w < s.l) return `${them} leads ${me} ${recordStr(s.l, s.w, s.t)} ${since}`
  return `${me} and ${them} are even at ${recordStr(s.w, s.l, s.t)} ${since}`
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

type SeasonRow = {
  id: string
  year: number
  playoff_weeks: number[] | null
  settings: Record<string, unknown> | null
  champion_manager_id: string | null
}

// One scored game anywhere in the league's history, with the people (not the
// platform accounts) on each side. pams was on NFL.com for six years and
// Sleeper for one, so the same person has two manager ids; the profile is
// what joins them.
type HistGame = { year: number; week: number; aId: string; bId: string; aP: string; bP: string; sa: number; sb: number }

// A line of history plus the short form of it that can lead a subject line.
// Weight orders hooks: a title beats a league record beats a snapped run.
type Note = { text: string; hook: string | null; weight: number }

const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10

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
    .select('id, year, playoff_weeks, settings, champion_manager_id')
    .eq('league_id', leagueId)
  const seasons = (seasonRows ?? []) as SeasonRow[]
  const season = seasons.find((s) => s.year === year)
  if (!season) return { status: 'no-season' }

  const [{ data: managerRows }, { data: profileRows }, { data: teamRows }, { data: matchupRows }] = await Promise.all([
    db.from('managers').select('id, display_name, profile_id, avatar_url, external_id').eq('league_id', leagueId),
    db.from('manager_profiles').select('id, canonical_name').eq('league_id', leagueId),
    db.from('manager_seasons').select('manager_id, team_name, avatar_url').eq('season_id', season.id),
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
  const personOfId = new Map<string, string>()
  const profileOfId = new Map<string, string | null>()
  const managerAvatar = new Map<string, string | null>()
  const idByExternal = new Map<string, string>()
  for (const m of managerRows ?? []) {
    const id = m.id as string
    const profile = m.profile_id ? profileName.get(m.profile_id as string) : undefined
    names.set(id, profile || leagueName(id, (m.display_name as string) ?? 'Unknown'))
    personOfId.set(id, (m.profile_id as string | null) ?? id)
    profileOfId.set(id, (m.profile_id as string | null) ?? null)
    managerAvatar.set(id, (m.avatar_url as string | null) ?? null)
    if (m.external_id) idByExternal.set(String(m.external_id), id)
  }
  const teams = new Map<string, string | null>()
  const seasonAvatar = new Map<string, string | null>()
  for (const t of teamRows ?? []) {
    teams.set(t.manager_id as string, (t.team_name as string | null) ?? null)
    seasonAvatar.set(t.manager_id as string, (t.avatar_url as string | null) ?? null)
  }
  const nameOf = (id: string) => names.get(id) ?? 'Unknown'
  const personOf = (id: string) => personOfId.get(id) ?? id
  const avatarOf = (id: string) => seasonAvatar.get(id) || managerAvatar.get(id) || null
  const side = (id: string, score: number): RecapSide => ({
    managerId: id,
    name: nameOf(id),
    team: teams.get(id) ?? null,
    avatar: avatarOf(id),
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

  // ── League history ──
  // Every scored game in every season up to and including this week. Needed
  // by every tier: the series behind each game is the one thing on the page
  // no platform can show.
  const seasonsWithGames = seasons.filter((s) => s.year <= year)
  const history = await loadHistory(db, seasonsWithGames, personOf, year, week)
  const firstYear = seasonsWithGames.length ? Math.min(...seasonsWithGames.map((s) => s.year)) : year
  const seriesBetween = (aId: string, bId: string, beforeThisWeek = false): { s: RecapSeries; games: HistGame[] } | null => {
    const pa = personOf(aId)
    const pb = personOf(bId)
    const games = history.filter(
      (g) =>
        ((g.aP === pa && g.bP === pb) || (g.aP === pb && g.bP === pa)) &&
        !(beforeThisWeek && g.year === year && g.week === week),
    )
    if (!games.length) return null
    let w = 0
    let l = 0
    let t = 0
    for (const g of games) {
      const mine = g.aP === pa ? g.sa : g.sb
      const theirs = g.aP === pa ? g.sb : g.sa
      if (mine > theirs) w++
      else if (mine < theirs) l++
      else t++
    }
    return { s: { w, l, t, since: Math.min(...games.map((g) => g.year)) }, games }
  }

  // ── The games ──
  const round = playoffWeek ? rounds.find((r) => r.includes(week)) ?? null : null
  const legIndex = round && round.length === 2 ? round.indexOf(week) : -1
  const pairKey = (a: string, b: string) => [a, b].sort().join('|')

  const hookPool: Note[] = []
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

    const after = seriesBetween(a.managerId, b.managerId)
    const note = winner === 'a' || winner === 'b'
      ? seriesNoteFor(
          winner === 'a' ? a : b,
          winner === 'a' ? b : a,
          seriesBetween(winner === 'a' ? a.managerId : b.managerId, winner === 'a' ? b.managerId : a.managerId, true),
          personOf,
        )
      : null

    if (note) hookPool.push(note)
    return { a, b, winner, margin, kind, leg, series: after?.s ?? null, seriesNote: note?.text ?? null }
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

  const regularThrough = playoffStart == null ? week : Math.min(week, playoffStart - 1)
  const recordsNow = recordThrough(regularThrough)
  const recordOf = (id: string) => {
    const r = recordsNow.get(id)
    return r && r.w + r.l + r.t > 0 ? recordStr(r.w, r.l, r.t) : null
  }

  let standings: RecapStanding[] | null = null
  const streaks: RecapStreak[] = []
  const streakOf = new Map<string, { kind: 'W' | 'L'; length: number }>()
  let upset: RecapUpset | null = null

  if (!playoffWeek) {
    const now = ranked(recordsNow)
    const before = week > 1 ? ranked(recordThrough(week - 1)) : null
    const prevRank = new Map(before?.map((r, i) => [r.id, i + 1]) ?? [])
    standings = now.map((r, i) => ({
      rank: i + 1,
      managerId: r.id,
      name: nameOf(r.id),
      team: teams.get(r.id) ?? null,
      avatar: avatarOf(r.id),
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
      if (n >= 2) streakOf.set(id, { kind: last, length: n })
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
  const placeOf = new Map(standings?.map((s) => [s.managerId, s]) ?? [])

  // ── The week's awards ──
  const weekScores = lines.map((l) => l.score)
  const awards = buildAwards({ lines, closest, blowout, upset, weekScores, games })

  // ── Next week ──
  const nextWeek = week + 1
  const nextRows = all.filter((m) => m.week === nextWeek && m.score_a == null && m.score_b == null)
  const nextByManager = new Map<string, string>()
  for (const m of nextRows) {
    nextByManager.set(m.manager_a_id, m.manager_b_id)
    nextByManager.set(m.manager_b_id, m.manager_a_id)
  }

  // ── Every team ──
  const noteFor = (id: string, name: string, score: number) => {
    const n = careerNote(id, name, score, history, personOf, year, week)
    if (n) hookPool.push(n)
    return n?.text ?? null
  }
  const teamCards: RecapTeamCard[] = []
  for (const g of games) {
    for (const [me, them, meWon] of [
      [g.a, g.b, g.winner === 'a'],
      [g.b, g.a, g.winner === 'b'],
    ] as const) {
      const others = weekScores.length - 1
      const higher = weekScores.filter((s) => s > me.score).length
      const lower = weekScores.filter((s) => s < me.score).length
      const standing = placeOf.get(me.managerId)
      const vs = seriesBetween(me.managerId, them.managerId)
      const nextId = nextByManager.get(me.managerId)
      const nextSeries = nextId ? seriesBetween(me.managerId, nextId) : null
      teamCards.push({
        managerId: me.managerId,
        profileId: profileOfId.get(me.managerId) ?? null,
        name: me.name,
        team: me.team,
        avatar: me.avatar,
        score: me.score,
        opponent: them.name,
        opponentScore: them.score,
        result: g.winner == null ? null : g.winner === 'tie' ? 'T' : meWon ? 'W' : 'L',
        weekRank: higher + 1,
        allPlay: { w: lower, l: higher, t: others - lower - higher },
        record: recordOf(me.managerId),
        place: standing?.rank ?? null,
        placeChange: standing?.change ?? null,
        streak: streakOf.get(me.managerId) ?? null,
        note: noteFor(me.managerId, me.name, me.score),
        series: vs?.s ?? null,
        next: nextId
          ? { opponent: nameOf(nextId), series: nextSeries?.s ?? null, favored: null, spread: null }
          : null,
      })
    }
  }
  teamCards.sort((x, y) => y.score - x.score)

  const next: RecapNext | null = nextRows.length
    ? {
        week: nextWeek,
        games: nextRows.map((m) => ({
          a: { name: nameOf(m.manager_a_id), avatar: avatarOf(m.manager_a_id), record: recordOf(m.manager_a_id) },
          b: { name: nameOf(m.manager_b_id), avatar: avatarOf(m.manager_b_id), record: recordOf(m.manager_b_id) },
          series: seriesBetween(m.manager_a_id, m.manager_b_id)?.s ?? null,
        })),
      }
    : null

  const facts: RecapFacts = {
    v: 2,
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
    awards,
    top,
    low,
    closest,
    blowout,
    upset,
    standings,
    streaks,
    teams: teamCards,
    next,
    hooks: [],
  }
  const finishHooks = () => {
    const pool: Note[] = [...hookPool]
    const title = games.find((g) => g.kind === 'championship' && (g.winner === 'a' || g.winner === 'b'))
    if (title) {
      pool.push({ text: '', hook: `${(title.winner === 'a' ? title.a : title.b).name} wins the ${year} title`, weight: 100 })
    }
    if (upset) pool.push({ text: '', hook: `${upset.winner} pulls the upset`, weight: 50 })
    // The last unbeaten team is a story from week 3 on.
    const perfect = (standings ?? []).filter((s) => s.wins === week && s.losses === 0 && s.ties === 0)
    if (week >= 3 && perfect.length === 1) {
      pool.push({ text: '', hook: `${perfect[0].name} is the last unbeaten team`, weight: 38 })
    }
    if (top) pool.push({ text: '', hook: `${top.name} puts up ${pts(top.score)}`, weight: 20 })
    const seenHook = new Set<string>()
    facts.hooks = pool
      .filter((n): n is Note & { hook: string } => !!n.hook)
      .sort((a, b) => b.weight - a.weight)
      .map((n) => n.hook)
      .filter((h) => (seenHook.has(h) ? false : (seenHook.add(h), true)))
      .slice(0, 4)
  }

  const sections = recapSections(tier)
  if (!sections.paid) {
    finishHooks()
    return { status: 'ok', facts }
  }

  // Each extra is optional: one that fails drops its section rather than the
  // whole recap. Say which one in the logs, though, or a missing section is
  // indistinguishable from a quiet week.
  const slug = league.slug as string
  const soft = <T,>(label: string, p: Promise<T>): Promise<T | null> =>
    p.catch((e) => {
      console.warn(`[recap] ${slug} week ${week}: ${label} failed: ${(e as Error)?.message ?? e}`)
      return null
    })
  const [power, pickems, bundle, trades, lineupRows] = await Promise.all([
    soft('power rankings', getPowerRankings(slug)),
    soft("pick'ems", getPickemsState(slug)),
    soft('league bundle', getLeagueBundle(leagueId, slug)),
    sections.veteran ? soft('trades', getTradesState(slug)) : Promise.resolve(null),
    soft('lineups', loadLineups(db, season.id, week)),
  ])

  // Record book: where this week's numbers sit in league history, and how
  // past teams with this week's best and worst records finished.
  facts.records = [
    ...buildRecords({ history, top, low, blowout, year, week, firstYear, nameOf: (p) => personName(p, nameOf, history), hooks: hookPool }),
    ...(standings ? buildStartHistory({ standings, week, year, seasons, history }) : []),
  ]

  // Power rankings and playoff odds.
  facts.power = null
  if (!playoffWeek && power?.status === 'ok' && power.year === year) {
    const snap = power.weeks.find((w) => w.week === week)
    const prev = power.weeks.find((w) => w.week === week - 1)
    const prevOdds = new Map(prev?.overall.map((t) => [t.team_id, t.playoff_pct ?? null]) ?? [])
    if (snap?.overall.length) {
      const hasOdds = power.hasProjections && snap.overall.some((t) => t.playoff_pct != null)
      facts.power = snap.overall.map((t) => {
        const odds = hasOdds && t.playoff_pct != null ? round1(t.playoff_pct) : null
        const before = prevOdds.get(t.team_id)
        return {
          rank: t.rank,
          name: names.get(t.team_id) ?? t.manager,
          team: t.team_name ?? null,
          avatar: avatarOf(t.team_id),
          record: recordStr(t.wins, t.losses, t.ties),
          delta: t.delta,
          odds,
          oddsChange: odds != null && before != null ? round1(odds - before) : null,
        }
      })
      facts.playoffTeams = power.playoffTeams ?? null
      const byTeam = new Map(snap.overall.map((t) => [t.team_id, t]))
      for (const card of facts.teams) {
        const t = byTeam.get(card.managerId)
        if (!t) continue
        const odds = hasOdds && t.playoff_pct != null ? round1(t.playoff_pct) : null
        const before = prevOdds.get(t.team_id)
        card.power = { rank: t.rank, delta: t.delta }
        card.odds = odds != null ? { now: odds, change: before != null ? round1(odds - before) : null } : null
      }
      for (const s of facts.standings ?? []) {
        const t = byTeam.get(s.managerId)
        s.odds = hasOdds && t?.playoff_pct != null ? round1(t.playoff_pct) : null
      }
      // The sim only runs for the live week and every snapshot carries its
      // result, so "last week's odds" is usually this week's odds again. A
      // column of +0s is not a fact about the league; drop the change.
      if (facts.power.every((p) => !p.oddsChange)) {
        for (const p of facts.power) p.oddsChange = null
        for (const card of facts.teams) if (card.odds) card.odds.change = null
      }
    }
  }

  facts.pickems = buildPickems(pickems, year, week, nameOf)
  facts.milestones = buildMilestones(bundle?.['milestones.json'], week)
  facts.lineups = buildLineups(lineupRows, seen, nameOf)

  // Next week's lines, off the matchup preview, which the bundle builds for
  // the week about to be played. Only trusted when that is the week after
  // this one; a recap rebuilt later would otherwise print a different week's
  // spreads.
  if (facts.next) {
    const mp = bundle?.['matchup_preview.json'] as {
      week?: number
      gotwIdx?: number | null
      matchups?: { train?: string; gotw?: boolean; a?: { uid?: string | null }; b?: { uid?: string | null }; projected?: { spread?: number; favorite?: 'a' | 'b' | 'pp' } }[]
    } | null
    if (mp?.week === nextWeek && Array.isArray(mp.matchups)) {
      const byPair = new Map<string, { m: NonNullable<typeof mp.matchups>[number]; i: number }>()
      mp.matchups.forEach((m, i) => {
        const a = m.a?.uid ? idByExternal.get(String(m.a.uid)) : undefined
        const b = m.b?.uid ? idByExternal.get(String(m.b.uid)) : undefined
        if (a && b) byPair.set(pairKey(a, b), { m, i })
      })
      facts.next.games = nextRows.map((row, idx) => {
        const base = facts.next!.games[idx]
        const hit = byPair.get(pairKey(row.manager_a_id, row.manager_b_id))
        if (!hit) return base
        const mpA = hit.m.a?.uid ? idByExternal.get(String(hit.m.a.uid)) : undefined
        const flipped = mpA !== row.manager_a_id
        const fav = hit.m.projected?.favorite
        const favorite = fav === 'a' || fav === 'b' ? ((fav === 'a') !== flipped ? 'a' : 'b') : null
        return {
          ...base,
          spread: hit.m.projected?.spread != null ? round1(Math.abs(hit.m.projected.spread)) : null,
          favorite,
          gotw: !!hit.m.gotw || mp.gotwIdx === hit.i,
          code: hit.m.train ?? null,
        }
      })
      // Put the game of the week first.
      facts.next.games.sort((x, y) => Number(!!y.gotw) - Number(!!x.gotw))
      for (const card of facts.teams) {
        const nextId = nextByManager.get(card.managerId)
        if (!nextId || !card.next) continue
        const hit = byPair.get(pairKey(card.managerId, nextId))
        if (!hit) continue
        const mine = hit.m.a?.uid && idByExternal.get(String(hit.m.a.uid)) === card.managerId ? 'a' : 'b'
        const fav = hit.m.projected?.favorite
        card.next.favored = fav === 'a' || fav === 'b' ? fav === mine : null
        card.next.spread = hit.m.projected?.spread != null ? round1(Math.abs(hit.m.projected.spread)) : null
      }
    }
    facts.next.milestones = buildImminent(bundle?.['milestones.json'])
    if (pickems?.status === 'ok' && pickems.year === year) {
      facts.next.picksLockAt = pickems.weeks.find((w) => w.week === nextWeek)?.locks_at ?? null
    }
  }

  if (sections.veteran) {
    const startDate = typeof season.settings?.season_start_date === 'string' ? season.settings.season_start_date : null
    const nameFor = (id: string, fallback: string) => names.get(id) ?? fallback
    facts.trades = buildTrades(trades, year, week, startDate, nameFor)
    facts.verdicts = buildVerdicts(trades, nameFor)

    const dna = (bundle?.['manager_dna.json'] as { managers?: { manager_id?: string; archetype?: { name?: string } | string }[] } | null)?.managers
    if (Array.isArray(dna)) {
      const byPerson = new Map<string, string>()
      for (const d of dna) {
        const label = typeof d.archetype === 'string' ? d.archetype : d.archetype?.name
        if (d.manager_id && label) byPerson.set(personOf(d.manager_id), label)
      }
      for (const card of facts.teams) card.archetype = byPerson.get(personOf(card.managerId)) ?? null
    }
  }

  finishHooks()
  return { status: 'ok', facts }
}

// ── History loading ───────────────────────────────────────────────────────

async function loadHistory(
  db: ReturnType<typeof createAdminClient>,
  seasons: SeasonRow[],
  personOf: (id: string) => string,
  year: number,
  week: number,
): Promise<HistGame[]> {
  const yearOf = new Map(seasons.map((s) => [s.id, s.year]))
  if (!yearOf.size) return []
  const out: HistGame[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from('matchups')
      .select('id, season_id, week, manager_a_id, manager_b_id, score_a, score_b')
      .in('season_id', [...yearOf.keys()])
      .order('id', { ascending: true })
      .range(from, from + page - 1)
    if (error || !data?.length) break
    for (const m of data) {
      const sa = m.score_a == null ? null : Number(m.score_a)
      const sb = m.score_b == null ? null : Number(m.score_b)
      if (sa == null || sb == null || !(sa > 0) || !(sb > 0)) continue
      const y = yearOf.get(m.season_id as string)!
      const w = m.week as number
      // Nothing after the week being recapped, so a recap rebuilt later still
      // says what was true that Tuesday.
      if (y > year || (y === year && w > week)) continue
      out.push({
        year: y,
        week: w,
        aId: m.manager_a_id as string,
        bId: m.manager_b_id as string,
        aP: personOf(m.manager_a_id as string),
        bP: personOf(m.manager_b_id as string),
        sa,
        sb,
      })
    }
    if (data.length < page) break
  }
  return out
}

// A person's name from any of their manager ids, preferring the newest.
function personName(person: string, nameOf: (id: string) => string, history: HistGame[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const g = history[i]
    if (g.aP === person) return nameOf(g.aId)
    if (g.bP === person) return nameOf(g.bId)
  }
  return nameOf(person)
}

// ── Series and career lines ───────────────────────────────────────────────

function seriesNoteFor(
  winner: RecapSide,
  loser: RecapSide,
  before: { s: RecapSeries; games: HistGame[] } | null,
  personOf: (id: string) => string,
): Note | null {
  if (!before) return { text: `First meeting. ${winner.name} takes it.`, hook: null, weight: 0 }
  const wp = personOf(winner.managerId)
  const ordered = [...before.games].sort((x, y) => x.year - y.year || x.week - y.week)
  // The streak going into this game, by whoever held it.
  let holder: string | null = null
  let run = 0
  for (let i = ordered.length - 1; i >= 0; i--) {
    const g = ordered[i]
    const a = g.aP === wp ? g.sa : g.sb
    const b = g.aP === wp ? g.sb : g.sa
    const who = a > b ? 'winner' : a < b ? 'loser' : 'tie'
    if (who === 'tie') break
    if (holder == null) holder = who
    if (who !== holder) break
    run++
  }
  const after = { w: before.s.w + 1, l: before.s.l, t: before.s.t }
  if (holder === 'loser' && run >= 3) {
    return {
      text: `${winner.name} snaps ${loser.name}'s ${run}-game run in this matchup.`,
      hook: `${winner.name} snaps ${loser.name}'s ${run}-game run`,
      weight: 70 + run,
    }
  }
  if (holder === 'winner' && run + 1 >= 4) {
    return {
      text: `${winner.name} has now won ${run + 1} straight against ${loser.name}.`,
      hook: `${winner.name} makes it ${run + 1} straight over ${loser.name}`,
      weight: 45 + run,
    }
  }
  if (before.s.w < before.s.l && after.w === after.l) {
    return { text: `${winner.name} evens the series at ${recordStr(after.w, after.l, after.t)}.`, hook: null, weight: 0 }
  }
  if (before.s.w === before.s.l && before.s.w + before.s.l > 0) {
    return { text: `${winner.name} takes the series lead, ${recordStr(after.w, after.l, after.t)}.`, hook: null, weight: 0 }
  }
  return null
}

// One line about where this score sits in the manager's own history.
function careerNote(
  managerId: string,
  name: string,
  score: number,
  history: HistGame[],
  personOf: (id: string) => string,
  year: number,
  week: number,
): Note | null {
  const me = personOf(managerId)
  const prior: { year: number; week: number; score: number }[] = []
  for (const g of history) {
    if (g.year === year && g.week === week) continue
    if (g.aP === me) prior.push({ year: g.year, week: g.week, score: g.sa })
    else if (g.bP === me) prior.push({ year: g.year, week: g.week, score: g.sb })
  }
  if (prior.length >= 10) {
    const best = prior.reduce((a, b) => (b.score > a.score ? b : a))
    const worst = prior.reduce((a, b) => (b.score < a.score ? b : a))
    if (score > best.score) {
      return { text: `Career high. The old best was ${pts(best.score)} in ${best.year}.`, hook: `${name}'s career high`, weight: 75 }
    }
    if (score < worst.score) return { text: 'Career low.', hook: `${name}'s career low`, weight: 60 }
    const byDate = [...prior].sort((a, b) => b.year - a.year || b.week - a.week)
    const lastHigher = byDate.find((p) => p.score > score)
    if (lastHigher && lastHigher.year <= year - 2) {
      const gap = year - lastHigher.year
      return { text: `Best score since ${lastHigher.year}.`, hook: gap >= 3 ? `${name}'s best score since ${lastHigher.year}` : null, weight: 40 + gap * 3 }
    }
    const lastLower = byDate.find((p) => p.score < score)
    if (lastLower && lastLower.year <= year - 2) {
      const gap = year - lastLower.year
      return { text: `Lowest score since ${lastLower.year}.`, hook: gap >= 3 ? `${name}'s lowest score since ${lastLower.year}` : null, weight: 25 + gap * 3 }
    }
  }
  const season = prior.filter((p) => p.year === year)
  if (season.length >= 2) {
    if (score > Math.max(...season.map((p) => p.score))) return { text: 'Season high.', hook: null, weight: 0 }
    if (score < Math.min(...season.map((p) => p.score))) return { text: 'Season low.', hook: null, weight: 0 }
  }
  return null
}

// ── Awards ────────────────────────────────────────────────────────────────

function buildAwards(args: {
  lines: RecapLine[]
  closest: RecapGame | null
  blowout: RecapGame | null
  upset: RecapUpset | null
  weekScores: number[]
  games: RecapGame[]
}): RecapAward[] {
  const { lines, closest, blowout, upset, weekScores } = args
  const out: RecapAward[] = []
  const decidedLines = lines.filter((l) => {
    const g = args.games.find((x) => x.a.managerId === l.managerId || x.b.managerId === l.managerId)
    return g && (g.winner === 'a' || g.winner === 'b')
  })
  const beats = (s: number) => weekScores.filter((x) => x < s).length

  const top = lines.reduce<RecapLine | null>((b, l) => (!b || l.score > b.score ? l : b), null)
  if (top) {
    out.push({
      key: 'top', title: 'Top score', value: pts(top.score), who: top.name,
      detail: `${top.won ? 'Beat' : 'Lost to'} ${top.opponent}, ${pts(top.opponentScore)}.`,
    })
  }
  const low = lines.reduce<RecapLine | null>((b, l) => (!b || l.score < b.score ? l : b), null)
  if (low) {
    out.push({
      key: 'low', title: 'Low score', value: pts(low.score), who: low.name,
      detail: `${low.won ? 'Beat' : 'Lost to'} ${low.opponent}, ${pts(low.opponentScore)}.`,
    })
  }
  const heartbreak = decidedLines.filter((l) => !l.won).reduce<RecapLine | null>((b, l) => (!b || l.score > b.score ? l : b), null)
  if (heartbreak) {
    const n = beats(heartbreak.score)
    out.push({
      key: 'heartbreak', title: 'Best score in a loss', value: pts(heartbreak.score), who: heartbreak.name,
      detail: `Would have beaten ${n} of ${weekScores.length - 1} teams. Drew ${heartbreak.opponent}.`,
    })
  }
  const robbery = decidedLines.filter((l) => l.won).reduce<RecapLine | null>((b, l) => (!b || l.score < b.score ? l : b), null)
  if (robbery) {
    out.push({
      key: 'robbery', title: 'Worst score in a win', value: pts(robbery.score), who: robbery.name,
      detail: `Beat ${robbery.opponent}, who managed ${pts(robbery.opponentScore)}.`,
    })
  }
  const won = (g: RecapGame) => (g.winner === 'a' ? g.a : g.b)
  const lost = (g: RecapGame) => (g.winner === 'a' ? g.b : g.a)
  if (closest) {
    out.push({
      key: 'closest', title: 'Closest game', value: `by ${pts(closest.margin)}`, who: `${won(closest).name} over ${lost(closest).name}`,
      detail: `${pts(won(closest).score)} to ${pts(lost(closest).score)}.`,
    })
  }
  if (blowout) {
    out.push({
      key: 'blowout', title: 'Biggest win', value: `by ${pts(blowout.margin)}`, who: `${won(blowout).name} over ${lost(blowout).name}`,
      detail: `${pts(won(blowout).score)} to ${pts(lost(blowout).score)}.`,
    })
  }
  if (upset) {
    out.push({
      key: 'upset', title: 'Upset', value: `${upset.winnerRecord} over ${upset.loserRecord}`, who: `${upset.winner} over ${upset.loser}`,
      detail: `${pts(upset.winnerScore)} to ${pts(upset.loserScore)}.`,
    })
  }
  return out
}

// ── Record book ───────────────────────────────────────────────────────────

function buildRecords(args: {
  history: HistGame[]
  top: RecapLine | null
  low: RecapLine | null
  blowout: RecapGame | null
  year: number
  week: number
  firstYear: number
  nameOf: (person: string) => string
  hooks: Note[]
}): string[] {
  const { history, top, low, blowout, year, week, firstYear, nameOf, hooks } = args
  // "League history" means nothing in a first season or on a thin archive.
  if (new Set(history.map((g) => g.year)).size < 2 || history.length < 30) return []
  const since = `since ${firstYear}`
  const isThis = (g: { year: number; week: number }) => g.year === year && g.week === week

  const teamWeeks = history.flatMap((g) => [
    { year: g.year, week: g.week, person: g.aP, id: g.aId, score: g.sa },
    { year: g.year, week: g.week, person: g.bP, id: g.bId, score: g.sb },
  ])
  const out: string[] = []

  if (top) {
    const others = teamWeeks.filter((t) => !(isThis(t) && t.id === top.managerId))
    const rank = others.filter((t) => t.score > top.score).length + 1
    const tied = others.some((t) => t.score === top.score)
    if (rank === 1 && !tied) {
      out.push(`${top.name}'s ${pts(top.score)} is the highest score in league history (${since}).`)
      hooks.push({ text: '', hook: `${top.name} sets the league scoring record`, weight: 90 })
    } else if (rank <= 5) {
      hooks.push({ text: '', hook: `${top.name} posts the ${ordinal(rank)}-best score in league history`, weight: 85 - rank })
      const best = [...others].sort((a, b) => b.score - a.score)[0]
      out.push(
        `${top.name}'s ${pts(top.score)} is the ${ordinal(rank)}-highest score in league history (${since}). The record is ${nameOf(best.person)}'s ${pts(best.score)} in ${best.year}.`,
      )
    }
  }

  if (low) {
    const others = teamWeeks.filter((t) => !(isThis(t) && t.id === low.managerId))
    const rank = others.filter((t) => t.score < low.score).length + 1
    const tied = others.some((t) => t.score === low.score)
    if (rank === 1 && !tied) {
      out.push(`${low.name}'s ${pts(low.score)} is the lowest score in league history (${since}).`)
      hooks.push({ text: '', hook: `${low.name} sets the league's low-score record`, weight: 82 })
    } else if (rank <= 5) {
      out.push(`${low.name}'s ${pts(low.score)} is the ${ordinal(rank)}-lowest score in league history (${since}).`)
    }
  }

  if (blowout && (blowout.winner === 'a' || blowout.winner === 'b') && !blowout.leg) {
    const winnerId = blowout.winner === 'a' ? blowout.a.managerId : blowout.b.managerId
    const margins = history
      .filter((g) => g.sa !== g.sb && !(isThis(g) && (g.aId === winnerId || g.bId === winnerId)))
      .map((g) => Math.abs(g.sa - g.sb))
    const rank = margins.filter((m) => m > blowout.margin).length + 1
    if (rank <= 5) {
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

// "Isaac and Sean are 3-0. Of the 9 teams to start 3-0 since 2019, 3 won the
// title." Only for the best and worst records, only once a record means
// something (week 2 on), and only when history has enough of them to count.
function buildStartHistory(args: {
  standings: RecapStanding[]
  week: number
  year: number
  seasons: SeasonRow[]
  history: HistGame[]
}): string[] {
  const { standings, week, year, seasons, history } = args
  if (week < 2 || !standings.length) return []
  const past = seasons.filter((s) => s.year < year && s.champion_manager_id)
  if (past.length < 3) return []

  const out: string[] = []
  const undefeated = standings.filter((s) => s.wins === week && s.losses === 0 && s.ties === 0)
  const winless = standings.filter((s) => s.losses === week && s.wins === 0 && s.ties === 0)

  for (const [group, wins] of [
    [undefeated, week],
    [winless, 0],
  ] as const) {
    if (!group.length) continue
    let teams = 0
    let champs = 0
    for (const s of past) {
      const counts = new Map<string, { w: number; l: number; t: number }>()
      for (const g of history) {
        if (g.year !== s.year || g.week > week) continue
        for (const [id, mine, theirs] of [
          [g.aId, g.sa, g.sb],
          [g.bId, g.sb, g.sa],
        ] as const) {
          const r = counts.get(id) ?? { w: 0, l: 0, t: 0 }
          if (mine > theirs) r.w++
          else if (mine < theirs) r.l++
          else r.t++
          counts.set(id, r)
        }
      }
      for (const [id, r] of counts) {
        if (r.w + r.l + r.t !== week || r.t) continue
        if (r.w !== wins) continue
        teams++
        if (id === s.champion_manager_id) champs++
      }
    }
    if (teams < 3) continue
    const rec = recordStr(wins, week - wins)
    const who = group.map((s) => s.name)
    const whoText = who.length === 1 ? `${who[0]} is` : `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]} are`
    const since = Math.min(...past.map((s) => s.year))
    out.push(
      `${whoText} ${rec}. Of the ${teams} teams that started ${rec} in earlier seasons (since ${since}), ${champs === 0 ? 'none' : champs} won the title.`,
    )
  }
  return out
}

// ── Pick'ems ──────────────────────────────────────────────────────────────

// Same scoring as the pick'ems page: a right or wrong call on every game with
// a known winner, except the picker's own game.
function buildPickems(
  state: PickemsState | null,
  year: number,
  week: number,
  nameOf: (id: string) => string,
): RecapPickems | null {
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

  // The game the league got most wrong.
  let crowd: string | null = null
  let worstShare = 1
  for (const m of thisWeek.matchups) {
    const winner = thisWeek.winners?.[m.id]
    if (!winner) continue
    let total = 0
    let right = 0
    for (const subs of Object.values(state.submissions)) {
      const pick = subs[thisWeek.id]?.picks?.[m.id]
      if (!pick) continue
      total++
      if (pick === winner) right++
    }
    if (total < 3) continue
    const share = right / total
    if (share < worstShare && share <= 0.34) {
      worstShare = share
      const loser = m.home === winner ? m.away : m.home
      crowd = right === 0
        ? `Nobody picked ${nameOf(winner)} over ${nameOf(loser)}.`
        : `Only ${right} of ${total} picked ${nameOf(winner)} over ${nameOf(loser)}.`
    }
  }

  const topRight = weekRows[0].right
  return {
    pickers: weekRows.length,
    best: weekRows.filter((r) => r.right === topRight).slice(0, 3),
    leaders: seasonRows.slice(0, 3),
    crowd,
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

// What falls next: the closest milestones across wins, streaks and points.
function buildImminent(raw: unknown): string[] {
  const byCat = (raw as { imminent_by_category?: Record<string, { name?: string; copy_html?: string }[]> } | null)
    ?.imminent_by_category
  if (!byCat) return []
  const out: string[] = []
  for (const key of ['wins', 'streak', 'points']) {
    for (const item of byCat[key] ?? []) {
      if (item.name && item.copy_html) out.push(`${item.name}: ${stripHtml(item.copy_html)}`)
    }
  }
  return out.slice(0, 3)
}

// ── Lineups ───────────────────────────────────────────────────────────────

type LineupRow = {
  manager_id: string
  player_external_id: string
  player_name: string | null
  position: string | null
  nfl_team: string | null
  slot: string | null
  is_starter: boolean | null
  points: number | null
  proj_points: number | null
}

async function loadLineups(db: ReturnType<typeof createAdminClient>, seasonId: string, week: number): Promise<LineupRow[]> {
  const out: LineupRow[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from('weekly_lineups')
      .select('manager_id, player_external_id, player_name, position, nfl_team, slot, is_starter, points, proj_points')
      .eq('season_id', seasonId)
      .eq('week', week)
      .range(from, from + page - 1)
    if (error || !data?.length) break
    out.push(...(data as LineupRow[]))
    if (data.length < page) break
  }
  return out
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const NOT_BENCH = new Set(['IR', 'RES', 'TAXI', 'NA'])

function buildLineups(
  rows: LineupRow[] | null,
  played: Set<string>,
  nameOf: (id: string) => string,
): RecapLineups | null {
  if (!rows?.length) return null
  const scored = rows.map((r) => ({ ...r, points: Number(r.points ?? 0), proj: r.proj_points == null ? null : Number(r.proj_points) }))
  const starters = scored.filter((r) => r.is_starter)
  if (!starters.length) return null

  const bestAt = new Map<string, (typeof scored)[number]>()
  for (const r of starters) {
    if (!r.position || !r.player_name) continue
    const cur = bestAt.get(r.position)
    if (!cur || r.points > cur.points) bestAt.set(r.position, r)
  }
  const positions = [...bestAt.keys()].sort((a, b) => {
    const ia = POSITION_ORDER.indexOf(a)
    const ib = POSITION_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })
  const mvps = positions.map((pos) => {
    const r = bestAt.get(pos)!
    return { pos, player: r.player_name!, nfl: r.nfl_team, points: round2(r.points), manager: nameOf(r.manager_id) }
  })

  const bench = scored.filter((r) => !r.is_starter && r.player_name && !NOT_BENCH.has((r.slot ?? '').toUpperCase()))
  const topBench = bench.reduce<(typeof scored)[number] | null>((b, r) => (!b || r.points > b.points ? r : b), null)
  const benchBest = topBench && topBench.points > 0
    ? { player: topBench.player_name!, pos: topBench.position, points: round2(topBench.points), manager: nameOf(topBench.manager_id) }
    : null

  // Efficiency through the Best Coach board's own function, on this week's
  // rows, so the recap and that page can never disagree about who set the
  // best lineup. Only teams that played this week count (playoff byes and
  // eliminated teams still carry rosters).
  let efficiency: RecapLineups['efficiency'] = null
  const eff: { name: string; pct: number; left: number }[] = []
  const rowsByTeam = new Map<string, LineupRow[]>()
  for (const r of rows) {
    if (!played.has(r.manager_id)) continue
    const list = rowsByTeam.get(r.manager_id) ?? []
    list.push(r)
    rowsByTeam.set(r.manager_id, list)
  }
  for (const [id, list] of rowsByTeam) {
    const e = lineupWeekEfficiency(
      list.map((r) => ({
        player_external_id: r.player_external_id,
        player_name: r.player_name,
        position: r.position,
        slot: r.slot ?? '',
        is_starter: !!r.is_starter,
        points: r.points == null ? null : Number(r.points),
      })),
    )
    if (!e || !(e.optimal > 0)) continue
    eff.push({ name: nameOf(id), pct: round1((e.actual / e.optimal) * 100), left: round2(Math.max(0, e.optimal - e.actual)) })
  }
  // Half the league missing lineups means the numbers describe some other
  // week than the one people played. Say nothing rather than half a thing.
  if (eff.length >= Math.max(2, played.size / 2)) {
    const sorted = [...eff].sort((a, b) => b.pct - a.pct || a.left - b.left)
    efficiency = { best: sorted[0], worst: sorted[sorted.length - 1] }
  }

  // Projections: a team counts only when nearly all of its starters carry
  // one, and the section only shows when most teams do.
  let projections: RecapLineups['projections'] = null
  const byTeam = new Map<string, (typeof scored)[number][]>()
  for (const r of starters) {
    const list = byTeam.get(r.manager_id) ?? []
    list.push(r)
    byTeam.set(r.manager_id, list)
  }
  const proj: { name: string; actual: number; projected: number }[] = []
  for (const [id, list] of byTeam) {
    const withProj = list.filter((r) => r.proj != null)
    if (withProj.length < list.length * 0.9) continue
    proj.push({
      name: nameOf(id),
      actual: round2(list.reduce((a, r) => a + r.points, 0)),
      projected: round2(withProj.reduce((a, r) => a + (r.proj ?? 0), 0)),
    })
  }
  if (proj.length >= Math.max(2, byTeam.size / 2)) {
    const diff = (p: { actual: number; projected: number }) => p.actual - p.projected
    const sorted = [...proj].sort((a, b) => diff(b) - diff(a))
    projections = { over: sorted[0], under: sorted[sorted.length - 1] }
  }

  return { mvps, benchBest, efficiency, projections }
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

// Four-week revisits that landed in the last seven days.
function buildVerdicts(
  state: Awaited<ReturnType<typeof getTradesState>>,
  nameFor: (managerId: string, fallback: string) => string,
): RecapVerdict[] {
  if (!state || state.status !== 'ok') return []
  return state.current_verdicts
    .filter((t) => t.revisit_summary)
    .slice(0, 2)
    .map((t) => ({
      headline: t.sides.map((s) => nameFor(s.manager.id, s.manager.display_name)).join(' and '),
      summary: t.revisit_summary!,
    }))
}
