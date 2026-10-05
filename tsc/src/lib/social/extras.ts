// The text-only posts that fill out the day around the base post.
//
// One post a day disappears in feeds this busy, so the plan adds two or three
// of these a day. Joey's rule: no link and no image on any of them. The base
// post of the day keeps the card and the link; these are there to be seen,
// replied to and followed from, and on X a post without a link or image costs
// a fraction of one with.
//
// Most are built at send time from live Sleeper data (trending adds, final
// scores, projections, the schedule), because a list of most-added players
// written on Saturday is stale by Monday. The plan stores what each one needs
// in params and the publisher calls buildOnTheDay. Questions and the
// position history post don't depend on the week's games, so they're written
// at plan time and show up in the Saturday digest for vetoing.
//
// Same rules as content.ts: public data only, no real league names, no
// emojis, no em dashes, plain words.

import { fetchWeekStats, fetchSeasonByWeek } from '@/lib/playerStats'
import { getPlayersNflDict } from '@/lib/sleeperPlayers'
import { textProblem, xLength, X_MAX, THREADS_MAX } from './config'
import { buildRegret, compact, fmt1, statLine, FANTASY_POS, type Built, type RegretParams, type Stats } from './content'

type Player = Awaited<ReturnType<typeof getPlayersNflDict>>[string]

// Kinds that must go out close to their slot or not at all. The publisher
// expires these after a few hours instead of a day: a "most added" list or a
// Sunday night scoreboard posted the next morning is worse than nothing.
export const TIMELY_KINDS = new Set(['trending', 'leaders', 'beat', 'season', 'byes', 'sunday', 'question'])

function textOnly(x: string, threads: string = x): Built {
  const bad = textProblem('x', x) ?? textProblem('threads', threads)
  if (bad) throw new Error(`built copy is ${bad}`)
  return { x_text: x, threads_text: threads, link: null, card: null, image_path: null }
}

/**
 * A head, a list and a closing line, with list items dropped from the end
 * until each platform's copy fits. Threads usually keeps the whole list.
 */
function listPost(head: string, lines: string[], tail: string, minLines = 3): Built | null {
  const make = (n: number) => [head, lines.slice(0, n).join('\n'), tail].filter(Boolean).join('\n\n')
  let nx = lines.length
  while (nx > minLines && xLength(make(nx)) > X_MAX) nx--
  let nt = lines.length
  while (nt > minLines && make(nt).length > THREADS_MAX) nt--
  if (xLength(make(nx)) > X_MAX) return null
  return textOnly(make(nx), make(nt))
}

function who(p: Player): string {
  return `${p.full_name} (${[p.position, p.team].filter(Boolean).join(', ')})`
}

const POS_WORD: Record<string, string> = { QB: 'quarterback', RB: 'running back', WR: 'receiver', TE: 'tight end' }
const POS_PLURAL: Record<string, string> = { QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs' }

/** Total PPR points per player over weeks 1..through. */
async function seasonPoints(season: number, through: number): Promise<Map<string, number>> {
  const weeks = await fetchSeasonByWeek(season, through)
  const out = new Map<string, number>()
  for (const wk of weeks) {
    for (const [id, s] of Object.entries(wk as Record<string, Stats>)) {
      const pts = s.pts_ppr ?? 0
      if (pts) out.set(id, (out.get(id) ?? 0) + pts)
    }
  }
  return out
}

// ── Most added on Sleeper ────────────────────────────────────────────────
export type TrendingParams = { sunday?: boolean }

export async function buildTrending(p: TrendingParams): Promise<Built | null> {
  const [players, res] = await Promise.all([
    getPlayersNflDict(),
    fetch('https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=40', { cache: 'no-store' }),
  ])
  if (!res.ok) throw new Error(`Sleeper trending adds ${res.status}`)
  const adds = (await res.json()) as { player_id: string; count: number }[]
  const top = adds
    .map((a) => ({ ...a, player: players[a.player_id] }))
    .filter((a) => a.player?.full_name && FANTASY_POS.has(a.player.position ?? ''))
    .slice(0, 5)
  if (top.length < 3) return null
  return listPost(
    'Most added on Sleeper in the last 24 hours:',
    top.map((a, i) => `${i + 1}. ${who(a.player)}, ${compact(a.count)} leagues`),
    p.sunday ? 'Anyone making a late pickup before kickoff?' : 'Who are you putting in a claim for?',
  )
}

// ── Last week's top scorer at each position ──────────────────────────────
export type WeekParams = { season: number; week: number }

export async function buildLeaders(p: WeekParams): Promise<Built | null> {
  const [players, stats] = await Promise.all([getPlayersNflDict(), fetchWeekStats(p.season, p.week)])
  const best: Record<string, { player: Player; pts: number }> = {}
  for (const [id, s] of Object.entries(stats as Record<string, Stats>)) {
    const player = players[id]
    const pos = player?.position ?? ''
    if (!player?.full_name || !FANTASY_POS.has(pos)) continue
    const pts = s.pts_ppr ?? 0
    if (!best[pos] || pts > best[pos].pts) best[pos] = { player, pts }
  }
  const order = ['QB', 'RB', 'WR', 'TE']
  if (order.some((pos) => !best[pos] || best[pos].pts < 10)) return null
  return listPost(
    `Week ${p.week}'s top scorer at every position, PPR:`,
    order.map((pos) => `${pos} ${best[pos].player.full_name}, ${fmt1(best[pos].pts)}`),
    'Anyone start all four?',
    4,
  )
}

// ── Biggest beats against Sleeper's projection ───────────────────────────
async function weekProjections(season: number, week: number): Promise<Map<string, number>> {
  const pos = ['QB', 'RB', 'WR', 'TE'].map((x) => `position%5B%5D=${x}`).join('&')
  const res = await fetch(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${pos}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sleeper projections ${season} week ${week}: ${res.status}`)
  const rows = (await res.json()) as { player_id?: string; stats?: Stats }[]
  const out = new Map<string, number>()
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r.player_id && r.stats?.pts_ppr != null) out.set(String(r.player_id), r.stats.pts_ppr)
  }
  return out
}

export async function buildBeat(p: WeekParams): Promise<Built | null> {
  const [players, stats, proj] = await Promise.all([
    getPlayersNflDict(), fetchWeekStats(p.season, p.week), weekProjections(p.season, p.week),
  ])
  const beats = [...proj.entries()]
    // Projected 5 to 15: players people had on rosters but weren't counting
    // on. A star scoring 40 off a 23 projection isn't a surprise, and the
    // Tuesday top scorers post already has him.
    .filter(([, pr]) => pr >= 5 && pr <= 15)
    .map(([id, pr]) => ({ player: players[id], pr, pts: (stats as Record<string, Stats>)[id]?.pts_ppr ?? 0 }))
    .filter((b) => b.player?.full_name && FANTASY_POS.has(b.player.position ?? ''))
    .map((b) => ({ ...b, gap: b.pts - b.pr }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 4)
  if (beats.length < 3 || beats[2].gap < 10) return null
  return listPost(
    `Week ${p.week}'s biggest surprises against Sleeper's projections, PPR:`,
    beats.map((b) => `${who(b.player)}: projected ${fmt1(b.pr)}, scored ${fmt1(b.pts)}`),
    'Who had one of them on the bench?',
  )
}

// ── Season-to-date leaders at one position ───────────────────────────────
export type SeasonParams = { season: number; week: number; pos: string }

export async function buildSeason(p: SeasonParams): Promise<Built | null> {
  const [players, totals] = await Promise.all([getPlayersNflDict(), seasonPoints(p.season, p.week)])
  const top = [...totals.entries()]
    .map(([id, pts]) => ({ player: players[id], pts }))
    .filter((t) => t.player?.full_name && t.player.position === p.pos)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 5)
  if (top.length < 5) return null
  return listPost(
    `The top ${POS_PLURAL[p.pos]} in PPR points through Week ${p.week}:`,
    top.map((t, i) => `${i + 1}. ${t.player.full_name}${t.player.team ? ` (${t.player.team})` : ''}, ${fmt1(t.pts)}`),
    'Who is missing from this list?',
    5,
  )
}

// ── Byes this week ───────────────────────────────────────────────────────
export async function buildByes(p: WeekParams): Promise<Built | null> {
  const res = await fetch(`https://api.sleeper.com/schedule/nfl/regular/${p.season}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sleeper schedule ${p.season}: ${res.status}`)
  const games = (await res.json()) as { week: number; home: string; away: string }[]
  const all = new Set(games.flatMap((g) => [g.home, g.away]))
  const playing = new Set(games.filter((g) => g.week === p.week).flatMap((g) => [g.home, g.away]))
  const bye = [...all].filter((t) => !playing.has(t)).sort()
  if (!bye.length || !playing.size) return null

  const [players, totals] = await Promise.all([getPlayersNflDict(), seasonPoints(p.season, Math.max(1, p.week - 1))])
  const byeSet = new Set(bye)
  const names = [...totals.entries()]
    .map(([id, pts]) => ({ player: players[id], pts }))
    .filter((t) => t.player?.full_name && FANTASY_POS.has(t.player.position ?? '') && byeSet.has(t.player.team ?? ''))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 4)
    .map((t) => who(t.player))
  const teams = bye.length === 1 ? bye[0] : `${bye.slice(0, -1).join(', ')} and ${bye[bye.length - 1]}`
  const biggest = names.length >= 2
    ? `\n\nThe biggest names sitting out: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`
    : ''
  const make = (body: string) => `On bye in Week ${p.week}: ${teams}.${body}\n\nCheck your lineups before tonight's game.`
  // Drop the names before the teams if X runs out of room.
  return textOnly(xLength(make(biggest)) <= X_MAX ? make(biggest) : make(''), make(biggest))
}

// ── Best game ever in this week, at one position ─────────────────────────
// Written at plan time. Wednesday's history post already has the best game
// of the week at any position, so this picks a position whose best game is
// someone else's.
export async function buildNugget(week: number, lastSeason: number, rotation: number): Promise<Built> {
  const players = await getPlayersNflDict()
  const years = Array.from({ length: lastSeason - 2009 + 1 }, (_, i) => 2009 + i)
  type Best = { id: string; year: number; pts: number; s: Stats }
  const byPos: Record<string, Best[]> = { QB: [], RB: [], WR: [], TE: [] }
  await Promise.all(years.map(async (year) => {
    const stats = await fetchWeekStats(year, week).catch(() => ({}))
    const yearBest: Record<string, Best> = {}
    for (const [id, s] of Object.entries(stats as Record<string, Stats>)) {
      const pos = players[id]?.position ?? ''
      if (!byPos[pos] || !players[id]?.full_name) continue
      const pts = s.pts_ppr ?? 0
      if (!yearBest[pos] || pts > yearBest[pos].pts) yearBest[pos] = { id, year, pts, s }
    }
    for (const [pos, b] of Object.entries(yearBest)) byPos[pos].push(b)
  }))
  for (const list of Object.values(byPos)) list.sort((a, b) => b.pts - a.pts)
  const overall = Object.values(byPos).map((l) => l[0]).filter(Boolean).sort((a, b) => b.pts - a.pts)[0]

  const order = ['QB', 'RB', 'WR', 'TE']
  for (let i = 0; i < order.length; i++) {
    const pos = order[(rotation + i) % order.length]
    const [top, next] = byPos[pos]
    if (!top || !next || top.id === overall?.id) continue
    const name = players[top.id].full_name
    const lead = `The best Week ${week} ${POS_WORD[pos]} game since 2009: ${name} in ${top.year}. ${statLine(pos, top.s)}, ${fmt1(top.pts)} PPR points.`
    const runner = `Next best: ${players[next.id].full_name} in ${next.year} with ${fmt1(next.pts)}.`
    const x = xLength(`${lead}\n\n${runner}`) <= X_MAX ? `${lead}\n\n${runner}` : lead
    return textOnly(x, `${lead}\n\n${runner}`)
  }
  throw new Error(`no position history for week ${week}`)
}

// ── Sunday's top scorers ─────────────────────────────────────────────────
// After the late games, before Sunday night. Sleeper's week stats fill in
// live, so this counts Thursday and the Sunday afternoon games so far.
export async function buildSunday(p: WeekParams): Promise<Built | null> {
  const [players, stats] = await Promise.all([getPlayersNflDict(), fetchWeekStats(p.season, p.week)])
  const top = Object.entries(stats as Record<string, Stats>)
    .map(([id, s]) => ({ player: players[id], pts: s.pts_ppr ?? 0 }))
    .filter((t) => t.player?.full_name && FANTASY_POS.has(t.player.position ?? ''))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 5)
  if (top.length < 5 || top[0].pts < 20) return null
  return listPost(
    `The top PPR scorers of Week ${p.week} so far:`,
    top.map((t, i) => `${i + 1}. ${who(t.player)}, ${fmt1(t.pts)}`),
    'Who carried your team today?',
  )
}

// ── Questions ────────────────────────────────────────────────────────────
// Replies are what both feeds reward, so most days end on one. Written at
// plan time and rotated by week, so a question comes round again every month
// or two at most. The league ones lean on what the site is about: a league's
// history, its records, its arguments.
export type QuestionContext = 'sunday' | 'mnf' | 'tnf' | 'waivers' | 'league'

const QUESTIONS: Record<QuestionContext, string[]> = {
  sunday: [
    'Which start are you least sure about today?',
    'Who are you starting today against your better judgment?',
    'Biggest lineup call you made this morning. Let\'s hear it before kickoff.',
    'Who did you bench today that you\'re scared of?',
    'Which game today matters most for your matchup?',
  ],
  mnf: [
    'Who needs a big Monday night to save your week?',
    'Is your matchup already decided, or is it riding on Monday night?',
    'How many points do you need from Monday night?',
    'Leading or trailing going into Monday night?',
  ],
  tnf: [
    'Starting anyone in tonight\'s game?',
    'Who are you counting on in the Thursday game?',
    'Do you like having a player in the Thursday game, or would you rather wait for Sunday?',
  ],
  waivers: [
    'Who is your top waiver claim this week?',
    'Who are you dropping this week to make room?',
    'What\'s the most FAAB you\'ve ever spent on one player, and was it worth it?',
    'Worst drop you\'ve ever made?',
    'Do you spend your FAAB early or save it for the playoffs?',
  ],
  league: [
    'Who is the one player on your roster you would never trade?',
    'What\'s the worst trade anyone in your league has ever made?',
    'What\'s the highest score you\'ve ever lost with?',
    'What does last place have to do in your league?',
    'How many years has your league been running?',
    'Who in your league has the most titles?',
    'Best team name in your league right now?',
    'What\'s the worst draft pick your league has ever seen?',
    'Has anyone in your league ever won back to back titles?',
    'One rule you would change in your league?',
    'Who is the most active trader in your league?',
    'What\'s the longest losing streak you\'ve ever had in fantasy?',
    'Who has finished last the most times in your league?',
    'Biggest blowout your league has ever seen?',
    'What\'s the closest matchup you\'ve ever lost?',
    'Who in your league always reaches in the first round?',
  ],
}

export function buildQuestion(context: QuestionContext, n: number): Built {
  const bank = QUESTIONS[context]
  return textOnly(bank[((n % bank.length) + bank.length) % bank.length])
}

// ── Send-time builds ─────────────────────────────────────────────────────
/** Builds a post that could only be written on the day, from its params. */
export async function buildOnTheDay(kind: string, params: Record<string, unknown>): Promise<{ built: Built } | { skip: string }> {
  const quiet = (built: Built | null, why: string) => (built ? { built } : { skip: why })
  switch (kind) {
    case 'regret':
      return quiet(await buildRegret(params as unknown as RegretParams), 'quiet week: fewer than three dropped players scored 12+')
    case 'trending':
      return quiet(await buildTrending(params as TrendingParams), 'Sleeper trending list was short')
    case 'leaders':
      return quiet(await buildLeaders(params as unknown as WeekParams), 'the week\'s scores are not in yet')
    case 'beat':
      return quiet(await buildBeat(params as unknown as WeekParams), 'no big beats against projection, or scores not in')
    case 'season':
      return quiet(await buildSeason(params as unknown as SeasonParams), 'not enough season stats')
    case 'byes':
      return quiet(await buildByes(params as unknown as WeekParams), 'no byes this week')
    case 'sunday':
      return quiet(await buildSunday(params as unknown as WeekParams), 'Sunday scores are not in yet')
    default:
      return { skip: 'no copy and nothing to build it from' }
  }
}
