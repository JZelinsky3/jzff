// Weekly recap facts: everything the email and the page say about one
// finished week, computed from the database and nothing else.
//
// Every number a reader sees comes out of this file. The written intro on top
// (./intro.ts) may only repeat numbers produced here, so when a figure is
// wrong it is wrong in exactly one place.
//
// Sleeper already sends a weekly recap with the top score, best at each
// position, efficiency and so on, so this doesn't try to be a second copy of
// it. The numbers here are the raw material for a written paper (./story.ts):
// the all-time series and last meeting behind every game, career highs and
// lows, titles, how this start compares to the manager's own past starts and
// to every team that ever had it, and where each of the week's superlatives
// ranks in league history.
//
// What goes in depends on the league owner's plan when the recap is built:
//   free    scores, series and last meetings, career marks, standings,
//           next week's slate
//   rookie  + the record book (history ranks, start history, a year ago),
//           power rankings and odds, pick'ems, milestones, the players
//           behind each result, next week's lines
//   full    + trades, trade verdicts
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

export const RECAP_FACTS_VERSION = 7

// An all-time series between two people, from one side's point of view.
export type RecapSeries = { w: number; l: number; t: number; since: number }

// The previous time two people met, before the game being described.
export type RecapMeeting = {
  year: number
  week: number
  kind: 'regular' | 'playoff' | 'championship'
  winner: string
  loser: string
  ws: number
  ls: number
}

// Who has won the last n meetings in a row (n >= 2).
export type RecapRun = { name: string; n: number }

export type RecapPlayer = { player: string; pos: string | null; points: number }

export type RecapSide = {
  managerId: string
  name: string
  team: string | null
  avatar: string | null
  score: number
  // Seasons this person won the title, before this one.
  titles: number[]
  // Rookie and up, from the week's lineups: the best starter, the best
  // player left on the bench, and how many points the bench cost them.
  star?: RecapPlayer | null
  bench?: RecapPlayer | null
  left?: number | null
}

// What this game did to the all-time series, from the winner's side.
export type RecapSeriesEvent =
  | { kind: 'first' }
  | { kind: 'snap'; run: number }
  | { kind: 'extend'; run: number }
  | { kind: 'even' }
  | { kind: 'lead' }

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
  seriesEvent: RecapSeriesEvent | null
  // The meeting before this one.
  last: RecapMeeting | null
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

// Where one of the week's superlatives sits in league history. rank/of are
// against every score (or game) the league has on record; seasonRank is
// against this season so far.
// A running total (points through N weeks, two-week runs, the league's
// weekly average, a win streak) against every season on record. Only kept
// when it says something: a top-10 all-time rank, or the best (or worst)
// since an entry at least three seasons old.
export type RecapTotalRow = {
  key: 'pf' | 'pfLow' | 'pa' | 'twoWeek' | 'leagueHigh' | 'leagueLow' | 'streak'
  label: string
  who: string
  value: number
  rank: number
  of: number
  // The most recent entry that beat this one, when it is 3+ seasons back.
  since: { who: string; value: number; year: number } | null
  // The record itself, when this isn't it; the old record (from an
  // earlier season) when it is.
  record: { who: string; value: number; year: number } | null
  // When this is the record and the next best is also this season.
  chaser: { who: string; value: number } | null
}

export type RecapBookRow = {
  key: 'top' | 'low' | 'heartbreak' | 'robbery' | 'closest' | 'blowout'
  label: string
  who: string
  // The other side, for the game rows (who lost the closest game, etc.).
  vs: string | null
  managerId: string
  value: number
  rank: number
  of: number
  seasonRank: number
  // The best other entry on record: the record itself when this isn't it,
  // the old record when it is.
  record: { who: string; value: number; year: number } | null
}

// A personal mark: where this score sits in the manager's own history.
export type RecapMark =
  | { kind: 'career-high'; old: number; oldYear: number }
  | { kind: 'career-low' }
  | { kind: 'best-since'; year: number }
  | { kind: 'low-since'; year: number }
  | { kind: 'season-high' }
  | { kind: 'season-low' }

// A multi-week number against the same manager's own history: their best
// (or worst) start through this many weeks, their best two-week stretch.
// `since` is the last season they did better; null means never.
export type RecapRunMark = {
  kind: 'start-best' | 'start-worst' | 'two-week-best'
  value: number
  since: number | null
  seasons: number
}

// How this team's start compares with its own past starts. Only for an
// unbeaten or winless record, week 2 on.
export type RecapStartMark =
  | { kind: 'first-ever'; seasons: number }
  | { kind: 'first-since'; year: number }
  | { kind: 'straight'; years: number }

// "Of the 11 teams to start 3-0 in league history, none won the title."
export type RecapStart = {
  record: string
  who: string[]
  teams: number
  champs: number
  lastChamp: { name: string; year: number } | null
  from: number
  to: number
}

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
  mark: RecapMark | null
  startMark: RecapStartMark | null
  titles: number[]
  // All-time series against this week's opponent, after this game.
  series: RecapSeries | null
  next: { opponent: string; series: RecapSeries | null; favored: boolean | null; spread: number | null } | null
  // Rookie and up.
  power?: { rank: number; delta: number } | null
  odds?: { now: number; change: number | null } | null
  runs?: RecapRunMark[]
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
  // Who called the week's high and low scorers. Null when nobody made a
  // high/low pick this week.
  high: { team: string; right: string[]; pickers: number } | null
  low: { team: string; right: string[]; pickers: number } | null
}

export type RecapMilestone = { name: string; text: string }

export type RecapTradeAsset = { label: string; pos: string | null; team: string | null }

export type RecapTrade = {
  headline: string
  sides: { manager: string; gets: string[]; assets?: RecapTradeAsset[] }[]
  summary: string | null
}

export type RecapVerdict = { headline: string; summary: string }

export type RecapNextSide = { name: string; avatar: string | null; record: string | null; place: number | null; ppg: number | null }

export type RecapNextGame = {
  a: RecapNextSide
  b: RecapNextSide
  series: RecapSeries | null
  last: RecapMeeting | null
  run: RecapRun | null
  // Who has the better of the last four meetings, when someone has won at
  // least three of them.
  recent: { name: string; w: number; of: number } | null
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
  v: 7
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
  teams: RecapTeamCard[]
  next: RecapNext | null
  // Short history angles, strongest first, for the subject line and the
  // intro to lead with. "Joey snaps Mason's 5-game run", "Charlie's best
  // score since 2023". Tier-safe: built only from facts this tier carries.
  hooks: string[]

  // Rookie and up.
  book?: RecapBookRow[]
  starts?: RecapStart[]
  // Where the league stood after this week a year ago, and how it ended.
  yearAgo?: { record: string; leaders: { name: string; finish: string | null }[] } | null
  // This week's number in the league's history: the best score ever posted
  // in this week of a season.
  weekRecord?: { who: string; value: number; year: number; isNew: boolean } | null
  totals?: RecapTotalRow[]
  // The best starter of the week, anywhere in the league.
  star?: (RecapPlayer & { manager: string }) | null
  power?: RecapPowerRow[] | null
  playoffTeams?: number | null
  pickems?: RecapPickems | null
  milestones?: RecapMilestone[]

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
type HistGame = {
  year: number
  week: number
  aId: string
  bId: string
  aP: string
  bP: string
  sa: number
  sb: number
  kind: 'regular' | 'playoff' | 'championship'
}

// A line of history plus the short form of it that can lead a subject line.
// Weight orders hooks: a title beats a league record beats a snapped run.
type Note = { text: string; hook: string | null; weight: number }

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
// Headline style: small counts as words ("five-game run").
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

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
  // Titles by person, before this season. A season with no champion on
  // record (an unfinished import) simply has no title to hand out.
  const titlesByPerson = new Map<string, number[]>()
  for (const s of [...seasons].sort((x, y) => x.year - y.year)) {
    if (s.year >= year || !s.champion_manager_id) continue
    const p = personOf(s.champion_manager_id)
    titlesByPerson.set(p, [...(titlesByPerson.get(p) ?? []), s.year])
  }
  const titlesOf = (id: string) => titlesByPerson.get(personOf(id)) ?? []
  const side = (id: string, score: number): RecapSide => ({
    managerId: id,
    name: nameOf(id),
    team: teams.get(id) ?? null,
    avatar: avatarOf(id),
    score: round2(score),
    titles: titlesOf(id),
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
  const byDate = (x: HistGame, y: HistGame) => x.year - y.year || x.week - y.week
  // The newest meeting in a set of games between two people.
  const meetingOf = (games: HistGame[]): RecapMeeting | null => {
    const g = [...games].sort(byDate).pop()
    if (!g || g.sa === g.sb) return null
    const [w, l, ws, ls] = g.sa > g.sb ? [g.aId, g.bId, g.sa, g.sb] : [g.bId, g.aId, g.sb, g.sa]
    return { year: g.year, week: g.week, kind: g.kind, winner: nameOf(w), loser: nameOf(l), ws: round2(ws), ls: round2(ls) }
  }
  // The better side of the last four meetings, when it is 3-1 or 4-0.
  const recentOf = (games: HistGame[]): RecapNextGame['recent'] => {
    const last = [...games].sort(byDate).slice(-4)
    if (last.length < 4) return null
    const wins = new Map<string, { id: string; n: number }>()
    for (const g of last) {
      if (g.sa === g.sb) continue
      const [p, id] = g.sa > g.sb ? [g.aP, g.aId] : [g.bP, g.bId]
      wins.set(p, { id, n: (wins.get(p)?.n ?? 0) + 1 })
    }
    const best = [...wins.values()].sort((x, y) => y.n - x.n)[0]
    return best && best.n >= 3 ? { name: nameOf(best.id), w: best.n, of: last.length } : null
  }
  // Who has won the most recent meetings in a row.
  const runOf = (games: HistGame[]): RecapRun | null => {
    const ordered = [...games].sort(byDate)
    let holder: string | null = null
    let n = 0
    for (let i = ordered.length - 1; i >= 0; i--) {
      const g = ordered[i]
      if (g.sa === g.sb) break
      const p = g.sa > g.sb ? g.aP : g.bP
      if (holder == null) holder = p
      if (p !== holder) break
      n++
    }
    if (!holder || n < 2) return null
    const g = ordered[ordered.length - 1]
    return { name: nameOf(g.aP === holder ? g.aId : g.bId), n }
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
    const before = seriesBetween(a.managerId, b.managerId, true)
    const note = winner === 'a' || winner === 'b'
      ? seriesNoteFor(
          winner === 'a' ? a : b,
          winner === 'a' ? b : a,
          seriesBetween(winner === 'a' ? a.managerId : b.managerId, winner === 'a' ? b.managerId : a.managerId, true),
          personOf,
        )
      : null

    if (note) hookPool.push(note)
    return {
      a, b, winner, margin, kind, leg,
      series: after?.s ?? null,
      seriesNote: note?.text ?? null,
      seriesEvent: note?.event ?? null,
      last: before ? meetingOf(before.games) : null,
    }
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

  const weekScores = lines.map((l) => l.score)

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
    return n
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
      const career = noteFor(me.managerId, me.name, me.score)
      const rec = recordsNow.get(me.managerId)
      const startMark = !playoffWeek && rec && rec.t === 0 && rec.w + rec.l === week
        ? startMarkFor(personOf(me.managerId), rec.w, rec.l, week, year, history)
        : null
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
        note: career?.text ?? null,
        mark: career?.mark ?? null,
        startMark,
        titles: me.titles,
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
        games: nextRows.map((m) => {
          const s = seriesBetween(m.manager_a_id, m.manager_b_id)
          const card = (id: string): RecapNextSide => {
            const r = recordsNow.get(id)
            const played = r ? r.w + r.l + r.t : 0
            return {
              name: nameOf(id),
              avatar: avatarOf(id),
              record: recordOf(id),
              place: placeOf.get(id)?.rank ?? null,
              ppg: r && played ? round1(r.pf / played) : null,
            }
          }
          return {
            a: card(m.manager_a_id),
            b: card(m.manager_b_id),
            series: s?.s ?? null,
            last: s ? meetingOf(s.games) : null,
            run: s ? runOf(s.games) : null,
            recent: s ? recentOf(s.games) : null,
          }
        }),
      }
    : null

  const facts: RecapFacts = {
    v: 7,
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

  // Record book: where this week's numbers sit in league history, how past
  // teams with this week's best and worst records finished, and where the
  // league stood a year ago tonight.
  const nameOfPerson = (p: string) => personName(p, nameOf, history)
  facts.book = buildBook({ history, games, year, week, nameOf: nameOfPerson, hooks: hookPool })
  facts.totals = playoffWeek ? [] : buildTotals({ history, year, week, nameOf: nameOfPerson, hooks: hookPool })
  if (!playoffWeek) {
    const runs = buildRunMarks(history, year, week)
    for (const card of facts.teams) card.runs = runs.get(personOf(card.managerId)) ?? []
  }
  facts.starts = standings ? buildStartHistory({ standings, week, year, seasons, history, nameOf: nameOfPerson }) : []
  facts.weekRecord = playoffWeek ? null : buildWeekRecord(history, year, week, top, nameOfPerson, hookPool)
  facts.yearAgo = playoffWeek ? null : await buildYearAgo(db, seasons, history, year, week, nameOfPerson, personOf)

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
  // The players behind each result: the best starter on each side, the best
  // player left on a bench, and what the bench cost.
  const lineups = buildLineups(lineupRows, seen)
  if (lineups) {
    for (const g of facts.games) {
      for (const s of [g.a, g.b]) {
        const l = lineups.byTeam.get(s.managerId)
        s.star = l?.star ?? null
        s.bench = l?.bench ?? null
        s.left = l?.left ?? null
      }
    }
    facts.star = lineups.star ? { ...lineups.star.player, manager: nameOf(lineups.star.managerId) } : null
  }

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
      .select('id, season_id, week, manager_a_id, manager_b_id, score_a, score_b, is_playoff, is_championship')
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
        kind: m.is_championship ? 'championship' : m.is_playoff ? 'playoff' : 'regular',
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
): (Note & { event: RecapSeriesEvent }) | null {
  if (!before) return { text: `First meeting. ${winner.name} takes it.`, hook: null, weight: 0, event: { kind: 'first' } }
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
      hook: `${winner.name} snaps ${numberWord(run)}-game skid against ${loser.name}`,
      weight: 70 + run,
      event: { kind: 'snap', run },
    }
  }
  if (holder === 'winner' && run + 1 >= 4) {
    return {
      text: `${winner.name} has now won ${run + 1} straight against ${loser.name}.`,
      hook: `${winner.name} makes it ${numberWord(run + 1)} straight over ${loser.name}`,
      weight: 45 + run,
      event: { kind: 'extend', run: run + 1 },
    }
  }
  if (before.s.w < before.s.l && after.w === after.l) {
    return { text: `${winner.name} evens the series at ${recordStr(after.w, after.l, after.t)}.`, hook: null, weight: 0, event: { kind: 'even' } }
  }
  if (before.s.w === before.s.l && before.s.w + before.s.l > 0) {
    return { text: `${winner.name} takes the series lead, ${recordStr(after.w, after.l, after.t)}.`, hook: null, weight: 0, event: { kind: 'lead' } }
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
): (Note & { mark: RecapMark }) | null {
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
      return {
        text: `Career high. The old best was ${pts(best.score)} in ${best.year}.`,
        hook: `${name}'s career high`,
        weight: 75,
        mark: { kind: 'career-high', old: round2(best.score), oldYear: best.year },
      }
    }
    if (score < worst.score) return { text: 'Career low.', hook: `${name}'s career low`, weight: 60, mark: { kind: 'career-low' } }
    const byDate = [...prior].sort((a, b) => b.year - a.year || b.week - a.week)
    const lastHigher = byDate.find((p) => p.score > score)
    if (lastHigher && lastHigher.year <= year - 3) {
      const gap = year - lastHigher.year
      return {
        text: `Best score since ${lastHigher.year}.`,
        hook: gap >= 3 ? `${name}'s best score since ${lastHigher.year}` : null,
        weight: 40 + gap * 3,
        mark: { kind: 'best-since', year: lastHigher.year },
      }
    }
    const lastLower = byDate.find((p) => p.score < score)
    if (lastLower && lastLower.year <= year - 3) {
      const gap = year - lastLower.year
      return {
        text: `Lowest score since ${lastLower.year}.`,
        hook: gap >= 3 ? `${name}'s lowest score since ${lastLower.year}` : null,
        weight: 25 + gap * 3,
        mark: { kind: 'low-since', year: lastLower.year },
      }
    }
  }
  const season = prior.filter((p) => p.year === year)
  if (season.length >= 2) {
    if (score > Math.max(...season.map((p) => p.score))) return { text: 'Season high.', hook: null, weight: 0, mark: { kind: 'season-high' } }
    if (score < Math.min(...season.map((p) => p.score))) return { text: 'Season low.', hook: null, weight: 0, mark: { kind: 'season-low' } }
  }
  return null
}

// How an unbeaten or winless start compares with the same person's starts
// in earlier seasons, counting only the first `week` games of each.
function startMarkFor(
  person: string,
  wins: number,
  losses: number,
  week: number,
  year: number,
  history: HistGame[],
): RecapStartMark | null {
  if (week < 2 || (wins !== week && losses !== week)) return null
  const unbeaten = wins === week
  const years = [...new Set(history.filter((g) => g.year < year && (g.aP === person || g.bP === person)).map((g) => g.year))].sort(
    (a, b) => a - b,
  )
  if (!years.length) return null
  const same: number[] = []
  for (const y of years) {
    const mine = history
      .filter((g) => g.year === y && g.kind === 'regular' && (g.aP === person || g.bP === person))
      .sort((a, b) => a.week - b.week)
      .slice(0, week)
    if (mine.length < week) continue
    const won = mine.filter((g) => (g.aP === person ? g.sa > g.sb : g.sb > g.sa)).length
    const lost = mine.filter((g) => (g.aP === person ? g.sa < g.sb : g.sb < g.sa)).length
    if (unbeaten ? won === week : lost === week) same.push(y)
  }
  if (!same.length) return { kind: 'first-ever', seasons: years.length + 1 }
  let straight = 1
  for (let y = year - 1; same.includes(y); y--) straight++
  if (straight >= 2) return { kind: 'straight', years: straight }
  const last = same[same.length - 1]
  return { kind: 'first-since', year: last }
}

// ── Running totals ────────────────────────────────────────────────────────

// Multi-week numbers the weekly record book can't show: who has scored the
// most (and least) through this many weeks, who has had the most scored
// against them, the best back-to-back weeks, the league's weekly average,
// and long win streaks, each ranked against every season on record.
// Regular-season games only, so a playoff week never pads a total.
function buildTotals(args: {
  history: HistGame[]
  year: number
  week: number
  nameOf: (person: string) => string
  hooks: Note[]
}): RecapTotalRow[] {
  const { history, year, week, nameOf, hooks } = args
  const regular = history.filter((g) => g.kind === 'regular')
  if (new Set(regular.filter((g) => g.year < year).map((g) => g.year)).size < 2) return []

  type Entry = { year: number; person: string; value: number }
  // Per person-season, their regular-season games in order.
  const games = new Map<string, { year: number; person: string; week: number; pf: number; pa: number; won: boolean | null }[]>()
  for (const g of regular) {
    for (const [p, pf, pa] of [
      [g.aP, g.sa, g.sb],
      [g.bP, g.sb, g.sa],
    ] as const) {
      const k = `${g.year}|${p}`
      const list = games.get(k) ?? []
      list.push({ year: g.year, person: p, week: g.week, pf, pa, won: pf === pa ? null : pf > pa })
      games.set(k, list)
    }
  }
  for (const list of games.values()) list.sort((a, b) => a.week - b.week)

  const rows: RecapTotalRow[] = []
  const rank = (
    key: RecapTotalRow['key'],
    label: string,
    pool: Entry[],
    mine: Entry | null,
    dir: 'high' | 'low',
  ): RecapTotalRow | null => {
    if (!mine || pool.length < 10) return null
    const better = (e: Entry) => (dir === 'high' ? e.value > mine.value : e.value < mine.value)
    const others = pool.filter((e) => e !== mine)
    const r = others.filter(better).length + 1
    const newestBetter = others.filter(better).sort((a, b) => b.year - a.year)[0] ?? null
    const top = (list: Entry[]) => list.reduce<Entry | null>((b, e) => (!b || (dir === 'high' ? e.value > b.value : e.value < b.value) ? e : b), null)
    const runnerUp = top(others)
    const best = r === 1 ? top(others.filter((e) => e.year < year)) : runnerUp
    const since = r > 1 && newestBetter && newestBetter.year <= year - 3
      ? { who: nameOf(newestBetter.person), value: round2(newestBetter.value), year: newestBetter.year }
      : null
    if (r > 10 && !since) return null
    const row: RecapTotalRow = {
      key,
      label,
      who: mine.person === '' ? 'The league' : nameOf(mine.person),
      value: round2(mine.value),
      rank: r,
      of: pool.length,
      since,
      record: best ? { who: best.person === '' ? 'The league' : nameOf(best.person), value: round2(best.value), year: best.year } : null,
      chaser: r === 1 && runnerUp && runnerUp.year === year && runnerUp.person !== ''
        ? { who: nameOf(runnerUp.person), value: round2(runnerUp.value) }
        : null,
    }
    rows.push(row)
    return row
  }

  // Through this many weeks: every person-season that got that far.
  if (week >= 2) {
    const through: (Entry & { pa: number })[] = []
    for (const list of games.values()) {
      const first = list.slice(0, week)
      if (first.length < week) continue
      if (first[0].year === year && first[first.length - 1].week !== week) continue
      through.push({
        year: first[0].year,
        person: first[0].person,
        value: first.reduce((s, x) => s + x.pf, 0),
        pa: first.reduce((s, x) => s + x.pa, 0),
      })
    }
    const now = through.filter((e) => e.year === year)
    const pick = (list: typeof now, f: (e: (typeof now)[number]) => number, dir: 'high' | 'low') =>
      list.reduce<(typeof now)[number] | null>((b, e) => (!b || (dir === 'high' ? f(e) > f(b) : f(e) < f(b)) ? e : b), null)
    const w = numberWord(week)
    const top = rank('pf', `Points through ${w} weeks`, through, pick(now, (e) => e.value, 'high'), 'high')
    rank('pfLow', `Fewest points through ${w} weeks`, through, pick(now, (e) => e.value, 'low'), 'low')
    const paPool = through.map((e) => ({ year: e.year, person: e.person, value: e.pa }))
    const paMine = pick(now, (e) => e.pa, 'high')
    rank('pa', `Points against through ${w} weeks`, paPool, paMine ? paPool.find((e) => e.year === paMine.year && e.person === paMine.person)! : null, 'high')
    if (top && top.rank <= 3) hooks.push({ text: '', hook: `${top.who} has the ${top.rank === 1 ? 'most' : `${ordinal(top.rank)}-most`} points ever through ${w} weeks`, weight: 56 - top.rank })
  }

  // Back-to-back weeks: every pair of consecutive weeks in a season.
  if (week >= 2) {
    const pairs: (Entry & { endWeek: number })[] = []
    for (const list of games.values()) {
      for (let i = 1; i < list.length; i++) {
        if (list[i].week !== list[i - 1].week + 1) continue
        pairs.push({ year: list[i].year, person: list[i].person, value: list[i].pf + list[i - 1].pf, endWeek: list[i].week })
      }
    }
    const mine = pairs.filter((e) => e.year === year && e.endWeek === week).reduce<(typeof pairs)[number] | null>((b, e) => (!b || e.value > b.value ? e : b), null)
    rank('twoWeek', 'Best back-to-back weeks', pairs, mine, 'high')
  }

  // The league's weekly average, so leagues that changed size compare fairly.
  const byWeek = new Map<string, { year: number; sum: number; n: number }>()
  for (const g of regular) {
    const k = `${g.year}|${g.week}`
    const e = byWeek.get(k) ?? { year: g.year, sum: 0, n: 0 }
    e.sum += g.sa + g.sb
    e.n += 2
    byWeek.set(k, e)
  }
  const weekly: (Entry & { key: string })[] = [...byWeek.entries()]
    .filter(([, e]) => e.n >= 4)
    .map(([k, e]) => ({ key: k, year: e.year, person: '', value: e.sum / e.n }))
  const thisWeek = weekly.find((e) => e.key === `${year}|${week}`) ?? null
  if (!rank('leagueHigh', 'League average this week', weekly, thisWeek, 'high')) {
    rank('leagueLow', 'League average this week', weekly, thisWeek, 'low')
  }

  // Win streaks inside a season, against every season's longest.
  let streakMine: Entry | null = null
  const longest: Entry[] = []
  for (const list of games.values()) {
    let best = 0
    let run = 0
    for (const g of list) {
      run = g.won === true ? run + 1 : 0
      best = Math.max(best, run)
    }
    const entry = { year: list[0].year, person: list[0].person, value: best }
    longest.push(entry)
    if (list[0].year === year && list[list.length - 1].week === week && run >= 4 && (!streakMine || run > streakMine.value)) {
      streakMine = { ...entry, value: run }
      longest[longest.length - 1] = streakMine
    }
  }
  rank('streak', 'Win streak', longest, streakMine, 'high')

  return rows
}

// Each manager's running numbers against their own past: best and worst
// start through this many weeks, best two-week stretch. Only kept when it is
// a personal best (or worst) outright, or the best since a season at least
// three back (two clear seasons between); "best since 2024" in 2026 is not
// news.
function buildRunMarks(history: HistGame[], year: number, week: number): Map<string, RecapRunMark[]> {
  const out = new Map<string, RecapRunMark[]>()
  const regular = history.filter((g) => g.kind === 'regular')
  const byPerson = new Map<string, Map<number, { week: number; pf: number }[]>>()
  for (const g of regular) {
    for (const [p, pf] of [
      [g.aP, g.sa],
      [g.bP, g.sb],
    ] as const) {
      const seasons = byPerson.get(p) ?? new Map<number, { week: number; pf: number }[]>()
      const list = seasons.get(g.year) ?? []
      list.push({ week: g.week, pf })
      seasons.set(g.year, list)
      byPerson.set(p, seasons)
    }
  }
  for (const [person, seasons] of byPerson) {
    const mine = seasons.get(year)?.sort((a, b) => a.week - b.week)
    if (!mine?.length || mine[mine.length - 1].week !== week) continue
    const past = [...seasons.entries()].filter(([y]) => y < year).sort((a, b) => a[0] - b[0])
    if (past.length < 2) continue
    const marks: RecapRunMark[] = []

    // Start through `week` games.
    if (week >= 2 && mine.length >= week) {
      const total = mine.slice(0, week).reduce((t, g) => t + g.pf, 0)
      const pastTotals = past
        .map(([y, list]) => {
          const first = [...list].sort((a, b) => a.week - b.week).slice(0, week)
          return first.length === week ? { y, t: first.reduce((t, g) => t + g.pf, 0) } : null
        })
        .filter((x): x is { y: number; t: number } => !!x)
      if (pastTotals.length >= 2) {
        const higher = pastTotals.filter((x) => x.t > total).map((x) => x.y)
        const lower = pastTotals.filter((x) => x.t < total).map((x) => x.y)
        const n = pastTotals.length + 1
        if (!higher.length) marks.push({ kind: 'start-best', value: round2(total), since: null, seasons: n })
        else if (Math.max(...higher) <= year - 3) marks.push({ kind: 'start-best', value: round2(total), since: Math.max(...higher), seasons: n })
        else if (!lower.length) marks.push({ kind: 'start-worst', value: round2(total), since: null, seasons: n })
        else if (Math.max(...lower) <= year - 3) marks.push({ kind: 'start-worst', value: round2(total), since: Math.max(...lower), seasons: n })
      }
    }

    // This week plus last week, against every earlier pair of weeks.
    const last = mine[mine.length - 1]
    const prev = mine.find((g) => g.week === week - 1)
    if (prev) {
      const pair = last.pf + prev.pf
      const pairs: { y: number; t: number }[] = []
      for (const [y, list] of seasons) {
        const sorted = [...list].sort((a, b) => a.week - b.week)
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].week !== sorted[i - 1].week + 1) continue
          if (y === year && sorted[i].week === week) continue
          pairs.push({ y, t: sorted[i].pf + sorted[i - 1].pf })
        }
      }
      if (pairs.length >= 20) {
        const higher = pairs.filter((x) => x.t > pair).map((x) => x.y)
        if (!higher.length) marks.push({ kind: 'two-week-best', value: round2(pair), since: null, seasons: past.length + 1 })
        else if (Math.max(...higher) <= year - 3) marks.push({ kind: 'two-week-best', value: round2(pair), since: Math.max(...higher), seasons: past.length + 1 })
      }
    }
    if (marks.length) out.set(person, marks)
  }
  return out
}

// ── Record book ───────────────────────────────────────────────────────────

// Where the week's superlatives sit in league history. Ranked against every
// score (or game) on record, this week's included, so "3rd" means two
// scores in the league's whole history were better. Wins and losses here
// are by the week's own scores, the same way the history counts them, so a
// two-week playoff leg is ranked like any other week.
function buildBook(args: {
  history: HistGame[]
  games: RecapGame[]
  year: number
  week: number
  nameOf: (person: string) => string
  hooks: Note[]
}): RecapBookRow[] {
  const { history, games, year, week, nameOf, hooks } = args
  // A first season or a thin archive has nothing to rank against.
  if (new Set(history.map((g) => g.year)).size < 2 || history.length < 30) return []
  const isThis = (g: { year: number; week: number }) => g.year === year && g.week === week

  type Entry = { year: number; week: number; person: string; id: string; value: number; vs: string | null }
  const teamWeeks = history.flatMap((g) => [
    { year: g.year, week: g.week, person: g.aP, id: g.aId, value: g.sa, won: g.sa === g.sb ? null : g.sa > g.sb, vs: g.bP },
    { year: g.year, week: g.week, person: g.bP, id: g.bId, value: g.sb, won: g.sa === g.sb ? null : g.sb > g.sa, vs: g.aP },
  ])
  const margins = history
    .filter((g) => g.sa !== g.sb)
    .map((g) => ({
      year: g.year,
      week: g.week,
      person: g.sa > g.sb ? g.aP : g.bP,
      id: g.sa > g.sb ? g.aId : g.bId,
      value: round2(Math.abs(g.sa - g.sb)),
      vs: g.sa > g.sb ? g.bP : g.aP,
    }))

  const rows: RecapBookRow[] = []
  const add = (
    key: RecapBookRow['key'],
    label: string,
    pool: Entry[],
    pick: 'max' | 'min',
    dir: 'high' | 'low',
    withVs: boolean,
  ) => {
    const mine = pool.filter(isThis)
    if (!mine.length) return null
    const entry = mine.reduce((b, e) => (pick === 'max' ? (e.value > b.value ? e : b) : e.value < b.value ? e : b))
    const others = pool.filter((e) => e !== entry)
    const better = (e: Entry) => (dir === 'high' ? e.value > entry.value : e.value < entry.value)
    const rank = others.filter(better).length + 1
    const seasonRank = others.filter((e) => e.year === year && better(e)).length + 1
    const best = others.length
      ? others.reduce((b, e) => (dir === 'high' ? (e.value > b.value ? e : b) : e.value < b.value ? e : b))
      : null
    const row: RecapBookRow = {
      key,
      label,
      who: nameOf(entry.person),
      vs: withVs && entry.vs ? nameOf(entry.vs) : null,
      managerId: entry.id,
      value: round2(entry.value),
      rank,
      of: pool.length,
      seasonRank,
      record: best ? { who: nameOf(best.person), value: round2(best.value), year: best.year } : null,
    }
    rows.push(row)
    return row
  }

  const top = add('top', 'Top score', teamWeeks, 'max', 'high', false)
  const low = add('low', 'Low score', teamWeeks, 'min', 'low', false)
  const heartbreak = add('heartbreak', 'Most points in a loss', teamWeeks.filter((t) => t.won === false), 'max', 'high', true)
  add('robbery', 'Fewest points in a win', teamWeeks.filter((t) => t.won === true), 'min', 'low', true)
  const closest = add('closest', 'Closest game', margins, 'min', 'low', true)
  const decided = games.filter((g) => g.a.score !== g.b.score)
  const blowout = decided.length > 1 ? add('blowout', 'Biggest win', margins, 'max', 'high', true) : null

  if (top && top.rank === 1) hooks.push({ text: '', hook: `${top.who} sets the league scoring record`, weight: 90 })
  else if (top && top.rank <= 5) hooks.push({ text: '', hook: `${top.who} posts the ${ordinal(top.rank)}-best score in league history`, weight: 85 - top.rank })
  if (low && low.rank === 1) hooks.push({ text: '', hook: `${low.who} sets the league's low-score record`, weight: 82 })
  if (heartbreak && heartbreak.rank <= 3) {
    hooks.push({
      text: '',
      hook: `${heartbreak.who} scores ${pts(heartbreak.value)} and loses`,
      weight: 64 - heartbreak.rank,
    })
  }
  if (closest && closest.rank <= 3) {
    hooks.push({
      text: '',
      hook: `${closest.who} beats ${closest.vs} by ${pts(closest.value)}, the ${closest.rank === 1 ? 'closest' : `${ordinal(closest.rank)}-closest`} game ever`,
      weight: 58 - closest.rank,
    })
  }
  if (blowout && blowout.rank <= 3) {
    hooks.push({
      text: '',
      hook: `${blowout.who} wins by ${pts(blowout.value)}, the ${blowout.rank === 1 ? 'biggest' : `${ordinal(blowout.rank)}-biggest`} margin ever`,
      weight: 60 - blowout.rank,
    })
  }
  return rows
}

// Isaac and Sean are 3-0; of the 11 teams to start 3-0 before them, how
// many won the title. Only for the best and worst records, only once a
// record means something (week 2 on), and only when history has enough of
// them to count.
function buildStartHistory(args: {
  standings: RecapStanding[]
  week: number
  year: number
  seasons: SeasonRow[]
  history: HistGame[]
  nameOf: (person: string) => string
}): RecapStart[] {
  const { standings, week, year, seasons, history, nameOf } = args
  if (week < 2 || !standings.length) return []
  const past = seasons.filter((s) => s.year < year && s.champion_manager_id).sort((a, b) => a.year - b.year)
  if (past.length < 3) return []
  const personOfId = new Map<string, string>()
  for (const g of history) {
    personOfId.set(g.aId, g.aP)
    personOfId.set(g.bId, g.bP)
  }

  const out: RecapStart[] = []
  const undefeated = standings.filter((s) => s.wins === week && s.losses === 0 && s.ties === 0)
  const winless = standings.filter((s) => s.losses === week && s.wins === 0 && s.ties === 0)

  for (const [group, wins] of [
    [undefeated, week],
    [winless, 0],
  ] as const) {
    if (!group.length) continue
    let teams = 0
    let champs = 0
    let lastChamp: RecapStart['lastChamp'] = null
    for (const s of past) {
      const counts = new Map<string, { w: number; l: number; t: number }>()
      for (const g of history) {
        if (g.year !== s.year || g.week > week || g.kind !== 'regular') continue
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
        if (id === s.champion_manager_id) {
          champs++
          lastChamp = { name: nameOf(personOfId.get(id) ?? id), year: s.year }
        }
      }
    }
    if (teams < 3) continue
    out.push({
      record: recordStr(wins, week - wins),
      who: group.map((s) => s.name),
      teams,
      champs,
      lastChamp,
      from: past[0].year,
      to: past[past.length - 1].year,
    })
  }
  return out
}

// The best score ever posted in this week of a regular season, and whether
// this week just beat it. Needs three earlier seasons to mean anything.
function buildWeekRecord(
  history: HistGame[],
  year: number,
  week: number,
  top: RecapLine | null,
  nameOf: (person: string) => string,
  hooks: Note[],
): RecapFacts['weekRecord'] {
  const prior = history.filter((g) => g.week === week && g.year < year && g.kind === 'regular')
  if (new Set(prior.map((g) => g.year)).size < 3) return null
  let best = { person: '', value: -1, year: 0 }
  for (const g of prior) {
    if (g.sa > best.value) best = { person: g.aP, value: g.sa, year: g.year }
    if (g.sb > best.value) best = { person: g.bP, value: g.sb, year: g.year }
  }
  if (top && top.score > best.value) {
    hooks.push({ text: '', hook: `${top.name} sets the week ${week} record`, weight: 52 })
    return { who: top.name, value: top.score, year, isNew: true }
  }
  return { who: nameOf(best.person), value: round2(best.value), year: best.year, isNew: false }
}

// Who led the league after this many weeks last season, and how their
// season ended. Skipped when more than two teams shared the lead.
async function buildYearAgo(
  db: ReturnType<typeof createAdminClient>,
  seasons: SeasonRow[],
  history: HistGame[],
  year: number,
  week: number,
  nameOf: (person: string) => string,
  personOf: (id: string) => string,
): Promise<RecapFacts['yearAgo']> {
  const prev = seasons.find((s) => s.year === year - 1)
  if (!prev) return null
  const counts = new Map<string, { w: number; l: number; t: number }>()
  for (const g of history) {
    if (g.year !== prev.year || g.week > week || g.kind !== 'regular') continue
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
  const full = [...counts.entries()].filter(([, r]) => r.w + r.l + r.t === week)
  if (full.length < 4) return null
  const bestW = Math.max(...full.map(([, r]) => r.w))
  const leaders = full.filter(([, r]) => r.w === bestW)
  if (leaders.length > 2) return null

  const { data: finals } = await db
    .from('manager_seasons')
    .select('manager_id, final_rank')
    .eq('season_id', prev.id)
    .in('manager_id', leaders.map(([id]) => id))
  const rankOf = new Map((finals ?? []).map((r) => [r.manager_id as string, r.final_rank as number | null]))
  const r0 = leaders[0][1]
  return {
    record: recordStr(r0.w, r0.l, r0.t),
    leaders: leaders.map(([id]) => {
      const champ = prev.champion_manager_id && personOf(prev.champion_manager_id) === personOf(id)
      const rank = rankOf.get(id)
      return {
        name: nameOf(personOf(id)),
        finish: champ ? 'won the title' : rank ? `finished ${ordinal(rank)}` : null,
      }
    }),
  }
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

  // High and low calls, against the week's actual high and low scorers
  // (ties count for everyone tied).
  const hlCall = (key: 'highest' | 'lowest') => {
    const winners = thisWeek.hlWinners?.[key] ?? []
    if (!winners.length) return null
    let pickers = 0
    const right: string[] = []
    for (const p of state.profiles) {
      const pick = state.submissions[p.profileId]?.[thisWeek.id]?.hl?.[key]
      if (!pick) continue
      pickers++
      if (winners.includes(pick)) right.push(p.name)
    }
    return pickers ? { team: winners.map(nameOf).join(' and '), right, pickers } : null
  }

  const topRight = weekRows[0].right
  return {
    pickers: weekRows.length,
    best: weekRows.filter((r) => r.right === topRight).slice(0, 3),
    leaders: seasonRows.slice(0, 3),
    crowd,
    high: hlCall('highest'),
    low: hlCall('lowest'),
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

const NOT_BENCH = new Set(['IR', 'RES', 'TAXI', 'NA'])

type TeamLineup = { star: RecapPlayer | null; bench: RecapPlayer | null; left: number | null }

function buildLineups(
  rows: LineupRow[] | null,
  played: Set<string>,
): { byTeam: Map<string, TeamLineup>; star: { player: RecapPlayer; managerId: string } | null } | null {
  if (!rows?.length) return null
  if (!rows.some((r) => r.is_starter)) return null
  const player = (r: LineupRow): RecapPlayer => ({ player: r.player_name!, pos: r.position, points: round2(Number(r.points ?? 0)) })
  const pts0 = (r: LineupRow) => Number(r.points ?? 0)

  const rowsByTeam = new Map<string, LineupRow[]>()
  for (const r of rows) {
    // Only teams that played this week (playoff byes and eliminated teams
    // still carry rosters).
    if (!played.has(r.manager_id)) continue
    const list = rowsByTeam.get(r.manager_id) ?? []
    list.push(r)
    rowsByTeam.set(r.manager_id, list)
  }

  const byTeam = new Map<string, TeamLineup>()
  let star: { player: RecapPlayer; managerId: string } | null = null
  for (const [id, list] of rowsByTeam) {
    const starters = list.filter((r) => r.is_starter && r.player_name)
    const bench = list.filter((r) => !r.is_starter && r.player_name && !NOT_BENCH.has((r.slot ?? '').toUpperCase()))
    const topStarter = starters.reduce<LineupRow | null>((b, r) => (!b || pts0(r) > pts0(b) ? r : b), null)
    const topBench = bench.reduce<LineupRow | null>((b, r) => (!b || pts0(r) > pts0(b) ? r : b), null)
    // What the bench cost, through the Best Coach board's own function so
    // the recap and that page can never disagree.
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
    byTeam.set(id, {
      star: topStarter && pts0(topStarter) > 0 ? player(topStarter) : null,
      bench: topBench && pts0(topBench) > 0 ? player(topBench) : null,
      left: e && e.optimal > 0 ? round2(Math.max(0, e.optimal - e.actual)) : null,
    })
    if (topStarter && (!star || pts0(topStarter) > star.player.points)) star = { player: player(topStarter), managerId: id }
  }
  // Half the league missing lineups means the numbers describe some other
  // week than the one people played. Say nothing rather than half a thing.
  if (byTeam.size < Math.max(2, played.size / 2)) return null
  return { byTeam, star }
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
        assets: s.assets
          .map((a) => ({
            label: assetLabel(a),
            pos: a.kind === 'player' ? a.position : null,
            team: a.kind === 'player' ? a.team : null,
          }))
          .filter((a) => a.label),
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
