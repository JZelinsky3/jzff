// The text-only posts that fill out the day around the base post.
//
// One post a day disappears in feeds this busy, so the plan adds four of
// these every day. Joey's rules: no link and no image on any of them (the base
// post of the day keeps the card and the link), and nothing that needs
// replies to work. A question nobody answers sits there looking empty, so
// every post here is a stat people take in and scroll past: no questions, no
// "who did you start?" closers. On X a post without a link or image also
// costs a fraction of one with.
//
// Most are built at send time from live Sleeper data (trending players,
// final scores, projections, the schedule), because a most-added list written
// on Saturday is stale by Monday. The plan stores what each one needs in
// params and the publisher calls buildOnTheDay. The position history post
// doesn't depend on the week's games, so it is written at plan time and shows
// up in the Saturday digest for vetoing.
//
// Same rules as content.ts: public data only, no real league names, no
// emojis, no em dashes, plain words.

import { fetchWeekStats, fetchSeasonByWeek } from '@/lib/playerStats'
import { getPlayersNflDict } from '@/lib/sleeperPlayers'
import { textProblem, xLength, X_MAX, X_ROOM, THREADS_MAX } from './config'
import { buildRegret, compact, fmt1, statLine, FANTASY_POS, type Built, type RegretParams, type Stats } from './content'

type Player = Awaited<ReturnType<typeof getPlayersNflDict>>[string]

// Kinds that must go out close to their slot or not at all. The publisher
// expires these after a few hours instead of a day: a "most added" list or a
// Sunday night scoreboard posted the next morning is worse than nothing.
export const TIMELY_KINDS = new Set([
  'trending', 'drops', 'leaders', 'beat', 'season', 'yearago', 'targets', 'pace', 'bargains',
  'streaks', 'busts', 'byes', 'projections', 'sunday', 'question', 'sidebyside', 'highs', 'redzone', 'mnf',
  'snaps', 'rookies', 'tnf', 'hot', 'touchdowns', 'airyards', 'qbrush',
])

// When a stat post comes up empty on the day (no busts this week, no clean
// streak list), one of these goes out in its slot instead, so the day keeps
// its four text posts (Joey: text posts carry the account, losing one hurts).
// None of them is on the weekly plan, and the publisher won't use one that
// went out in the last six days. In order of preference.
export const BACKUP_KINDS = ['touchdowns', 'airyards', 'qbrush'] as const

// Kinds whose params.week is the week being played, not the last one
// finished. A backup for one of them counts through the week before.
export const THIS_WEEK_KINDS = new Set(['byes', 'projections', 'sunday', 'mnf', 'tnf'])

function textOnly(x: string, threads: string = x): Built {
  const bad = textProblem('x', x) ?? textProblem('threads', threads)
  if (bad) throw new Error(`built copy is ${bad}`)
  return { x_text: x, threads_text: threads, link: null, card: null, image_path: null }
}

/**
 * A head and a list, plus an optional closing line, with list items dropped
 * from the end until each platform's copy fits. Threads usually keeps the
 * whole list.
 */
function listPost(head: string, lines: string[], tail = '', minLines = 3): Built | null {
  if (lines.length < minLines) return null
  const make = (n: number) => [head, lines.slice(0, n).join('\n'), tail].filter(Boolean).join('\n\n')
  let nx = lines.length
  while (nx > minLines && xLength(make(nx)) > X_ROOM) nx--
  let nt = lines.length
  while (nt > minLines && make(nt).length > THREADS_MAX) nt--
  // Short of room for the hashtags is fine (they're dropped); over X's limit isn't.
  if (xLength(make(nx)) > X_MAX) return null
  return textOnly(make(nx), make(nt))
}

function who(p: Player): string {
  return `${p.full_name} (${[p.position, p.team].filter(Boolean).join(', ')})`
}

/** Name and team only, for lines that already say the position. */
function named(p: Player): string {
  return p.team ? `${p.full_name} (${p.team})` : p.full_name!
}

const POS_WORD: Record<string, string> = { QB: 'quarterback', RB: 'running back', WR: 'receiver', TE: 'tight end' }
const POS_PLURAL: Record<string, string> = { QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs' }
// How deep "a starter" goes at each position in a 12-team league.
const STARTER_DEPTH: Record<string, number> = { QB: 12, RB: 24, WR: 24, TE: 12 }

type Line = {
  id: string; player: Player; pts: number; games: number; weeks: Set<number>; low: number; tgt: number; rz: number
  td: number; air: number; qbRush: number; best: { pts: number; week: number }
  /** PPR points in each week he played. */
  byWeek: Map<number, number>
}

/**
 * Season to date for every fantasy player over weeks 1..through: PPR points,
 * games played, lowest and best single game, targets, red zone chances
 * (carries plus targets inside the 20), rushing and receiving touchdowns, and
 * air yards. A week counts as a game when Sleeper marks the player active or
 * he scored anything.
 */
async function seasonLines(season: number, through: number): Promise<Line[]> {
  const [players, weeks] = await Promise.all([getPlayersNflDict(), fetchSeasonByWeek(season, through)])
  const acc = new Map<string, Line>()
  weeks.forEach((wk, wi) => {
    for (const [id, s] of Object.entries(wk as Record<string, Stats>)) {
      const player = players[id]
      if (!player?.full_name || !FANTASY_POS.has(player.position ?? '')) continue
      const pts = s.pts_ppr ?? 0
      if (!(s.gp ?? 0) && !pts) continue
      const l = acc.get(id) ?? {
        id, player, pts: 0, games: 0, weeks: new Set(), low: Infinity, tgt: 0, rz: 0,
        td: 0, air: 0, qbRush: 0, best: { pts: -Infinity, week: 0 }, byWeek: new Map(),
      }
      l.pts += pts
      l.games += 1
      l.weeks.add(wi + 1)
      l.byWeek.set(wi + 1, pts)
      l.low = Math.min(l.low, pts)
      l.tgt += s.rec_tgt ?? 0
      l.rz += (s.rush_rz_att ?? 0) + (s.rec_rz_tgt ?? 0)
      l.td += (s.rush_td ?? 0) + (s.rec_td ?? 0)
      l.air += s.rec_air_yd ?? 0
      if (player.position === 'QB') l.qbRush += s.rush_yd ?? 0
      if (pts > l.best.pts) l.best = { pts, week: wi + 1 }
      acc.set(id, l)
    }
  })
  return [...acc.values()]
}

// ── Injuries ─────────────────────────────────────────────────────────────
// A season total says nothing about a player who stopped playing in Week 2,
// and calling him a bust is wrong (De'Von Achane went out as RB40 a month
// after his ACL; Joey caught it). Sleeper's injury status says who's out now,
// the schedule says which of his team's games he missed (byes aren't games).
//
// Out for weeks: injured reserve, the PUP and NFI lists, a suspension.
const OUT_FOR_WEEKS = new Set(['IR', 'PUP', 'NFI', 'Sus', 'DNR'])
const OUT_THIS_WEEK = new Set(['Out', 'Doubtful'])

type TeamWeeks = Map<string, number[]>

/** The weeks each team played, 1..through. */
async function teamWeeks(season: number, through: number): Promise<TeamWeeks> {
  const res = await fetch(`https://api.sleeper.com/schedule/nfl/regular/${season}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sleeper schedule ${season}: ${res.status}`)
  const out: TeamWeeks = new Map()
  for (const g of (await res.json()) as { week: number; home: string; away: string; status?: string }[]) {
    if (g.week > through || g.status === 'canceled') continue
    for (const t of [g.home, g.away]) out.set(t, [...(out.get(t) ?? []), g.week])
  }
  return out
}

/** Still playing: on a team, not on a reserve list, and in one of his team's last two games. */
function stillPlaying(l: Line, tw: TeamWeeks): boolean {
  const p = l.player
  if (!p.team || p.status === 'Inactive' || OUT_FOR_WEEKS.has(p.injury_status ?? '')) return false
  const recent = (tw.get(p.team) ?? []).slice(-2)
  return recent.length === 0 || recent.some((w) => l.weeks.has(w))
}

/** Played every one of his team's games so far (traded players can trip this; it errs out). */
function noneMissed(l: Line, tw: TeamWeeks): boolean {
  return (tw.get(l.player.team ?? '') ?? []).every((w) => l.weeks.has(w))
}

/** Fair to judge on his season: every game played and not out this week. */
function everyGame(l: Line, tw: TeamWeeks): boolean {
  return stillPlaying(l, tw) && noneMissed(l, tw) && !OUT_THIS_WEEK.has(l.player.injury_status ?? '')
}

/** Position rank by season points, e.g. rank.get(line) === 3 for the WR3. */
function positionRanks(lines: Line[]): Map<Line, number> {
  const out = new Map<Line, number>()
  for (const pos of FANTASY_POS) {
    lines.filter((l) => l.player.position === pos).sort((a, b) => b.pts - a.pts).forEach((l, i) => out.set(l, i + 1))
  }
  return out
}

/** Sleeper's PPR average draft position for the season, by player id. */
async function draftPositions(season: number): Promise<Map<string, number>> {
  const pos = ['QB', 'RB', 'WR', 'TE'].map((x) => `position%5B%5D=${x}`).join('&')
  const res = await fetch(`https://api.sleeper.com/projections/nfl/${season}?season_type=regular&${pos}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sleeper season projections ${season}: ${res.status}`)
  const rows = (await res.json()) as { player_id?: string; stats?: Stats }[]
  const out = new Map<string, number>()
  for (const r of Array.isArray(rows) ? rows : []) {
    const adp = r.stats?.adp_ppr
    if (r.player_id && adp != null && adp < 999) out.set(String(r.player_id), adp)
  }
  return out
}

async function sleeperTrending(type: 'add' | 'drop'): Promise<{ player: Player; count: number }[]> {
  const [players, res] = await Promise.all([
    getPlayersNflDict(),
    fetch(`https://api.sleeper.app/v1/players/nfl/trending/${type}?lookback_hours=24&limit=40`, { cache: 'no-store' }),
  ])
  if (!res.ok) throw new Error(`Sleeper trending ${type} ${res.status}`)
  return ((await res.json()) as { player_id: string; count: number }[])
    .map((a) => ({ player: players[a.player_id], count: a.count }))
    .filter((a) => a.player?.full_name && FANTASY_POS.has(a.player.position ?? ''))
    .slice(0, 5)
}

// ── Most added / most dropped on Sleeper ─────────────────────────────────
export async function buildTrending(): Promise<Built | null> {
  const top = await sleeperTrending('add')
  return listPost('Most added on Sleeper in the last 24 hours:', top.map((a, i) => `${i + 1}. ${who(a.player)}, ${compact(a.count)} leagues`))
}

export async function buildDrops(): Promise<Built | null> {
  const top = await sleeperTrending('drop')
  return listPost('Most dropped on Sleeper in the last 24 hours:', top.map((a, i) => `${i + 1}. ${who(a.player)}, ${compact(a.count)} leagues`))
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
    order.map((pos) => `${pos} ${named(best[pos].player)}, ${fmt1(best[pos].pts)}`),
    '',
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
  )
}

// ── Season-to-date leaders at one position ───────────────────────────────
export type SeasonParams = { season: number; week: number; pos: string }

export async function buildSeason(p: SeasonParams): Promise<Built | null> {
  const [lines, tw] = await Promise.all([seasonLines(p.season, p.week), teamWeeks(p.season, p.week)])
  const top = lines
    .filter((l) => l.player.position === p.pos && stillPlaying(l, tw))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 5)
  return listPost(
    `The top ${POS_PLURAL[p.pos]} in PPR points through Week ${p.week}:`,
    top.map((t, i) => `${i + 1}. ${t.player.full_name}${t.player.team ? ` (${t.player.team})` : ''}, ${fmt1(t.pts)}`),
    '',
    5,
  )
}

// ── Target leaders ───────────────────────────────────────────────────────
export async function buildTargets(p: WeekParams): Promise<Built | null> {
  const [lines, tw] = await Promise.all([seasonLines(p.season, p.week), teamWeeks(p.season, p.week)])
  const top = lines
    .filter((l) => l.tgt > 0 && stillPlaying(l, tw))
    .sort((a, b) => b.tgt - a.tgt)
    .slice(0, 5)
  if (!top.length || top[0].tgt < 15) return null
  return listPost(
    `Most targets through Week ${p.week}:`,
    top.map((t, i) => `${i + 1}. ${who(t.player)}, ${t.tgt} (${fmt1(t.tgt / t.games)} a game)`),
  )
}

// ── On pace ──────────────────────────────────────────────────────────────
// The best points-per-game pace this season, over 17 games, against the most
// PPR points anyone has scored in a season since 2009.
async function seasonRecord(lastSeason: number): Promise<{ name: string; year: number; pts: number } | null> {
  const players = await getPlayersNflDict()
  let best: { name: string; year: number; pts: number } | null = null
  await Promise.all(Array.from({ length: lastSeason - 2009 + 1 }, (_, i) => 2009 + i).map(async (year) => {
    const res = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${year}`, { cache: 'no-store' })
    if (!res.ok) return
    const totals = (await res.json()) as Record<string, Stats>
    for (const [id, s] of Object.entries(totals)) {
      const pl = players[id]
      if (!pl?.full_name || !FANTASY_POS.has(pl.position ?? '')) continue
      const pts = s.pts_ppr ?? 0
      if (!best || pts > best.pts) best = { name: pl.full_name, year, pts }
    }
  }))
  return best
}

export async function buildPace(p: WeekParams): Promise<Built | null> {
  const [lines, record, tw] = await Promise.all([seasonLines(p.season, p.week), seasonRecord(p.season - 1), teamWeeks(p.season, p.week)])
  const minGames = Math.max(3, p.week - 2)
  // A pace he's on IR for isn't a pace.
  const leaders = lines.filter((l) => l.games >= minGames && stillPlaying(l, tw)).sort((a, b) => b.pts / b.games - a.pts / a.games)
  const top = leaders[0]
  if (!top || !record) return null
  const pace = (top.pts / top.games) * 17
  const lead = `${top.player.full_name} has ${fmt1(top.pts)} PPR points in ${top.games} games. Over 17 games that's a ${Math.round(pace)}-point season.`
  const vs = pace > record.pts
    ? `The most anyone has scored in a season since 2009 is ${fmt1(record.pts)}, by ${record.name} in ${record.year}.`
    : `The most since 2009 is ${fmt1(record.pts)}, by ${record.name} in ${record.year}.`
  const next = leaders.slice(1, 3).map((l) => `${l.player.full_name} (${Math.round((l.pts / l.games) * 17)})`)
  const behind = next.length === 2 ? `\n\nNext best paces: ${next[0]} and ${next[1]}.` : ''
  const full = `${lead}\n\n${vs}${behind}`
  return textOnly(xLength(full) <= X_ROOM ? full : `${lead}\n\n${vs}`, full)
}

// ── Draft bargains and busts ─────────────────────────────────────────────
export async function buildBargains(p: WeekParams): Promise<Built | null> {
  const [lines, adp, tw] = await Promise.all([seasonLines(p.season, p.week), draftPositions(p.season), teamWeeks(p.season, p.week)])
  const rank = positionRanks(lines)
  const picks = lines
    .map((l) => ({ l, r: rank.get(l)!, adp: adp.get(l.id) ?? 400 }))
    // Starters now, drafted after the sixth round (or not at all).
    .filter((x) => x.r <= STARTER_DEPTH[x.l.player.position!] / 2 && x.adp >= 72 && stillPlaying(x.l, tw))
    .sort((a, b) => b.adp - a.adp)
    .slice(0, 4)
  return listPost(
    `The best values from Sleeper drafts through Week ${p.week}, by average draft position:`,
    picks.map((x) => `${named(x.l.player)}: ${x.adp >= 250 ? 'undrafted' : `pick ${Math.round(x.adp)}`}, now ${x.l.player.position}${x.r}`),
    '',
    3,
  )
}

export async function buildBusts(p: WeekParams): Promise<Built | null> {
  const [lines, adp, tw] = await Promise.all([seasonLines(p.season, p.week), draftPositions(p.season), teamWeeks(p.season, p.week)])
  const rank = positionRanks(lines)
  // Only players who've played every game and aren't hurt now: an injury
  // isn't a bust.
  const picks = lines
    .map((l) => ({ l, r: rank.get(l)!, adp: adp.get(l.id) ?? 999 }))
    .filter((x) => x.adp <= 36 && everyGame(x.l, tw) && x.r > STARTER_DEPTH[x.l.player.position!])
    .sort((a, b) => a.adp - b.adp)
    .slice(0, 4)
  return listPost(
    `First three rounds in Sleeper drafts, not a starter through Week ${p.week}:`,
    picks.map((x) => `${named(x.l.player)}: pick ${Math.round(x.adp)}, ${x.l.player.position}${x.r} so far`),
    '',
    2,
  )
}

// ── Every game over the line ─────────────────────────────────────────────
export async function buildStreaks(p: WeekParams): Promise<Built | null> {
  const [all, tw] = await Promise.all([seasonLines(p.season, p.week), teamWeeks(p.season, p.week)])
  // "Every game" has to mean every game his team played.
  const lines = all.filter((l) => l.games >= 3 && noneMissed(l, tw) && stillPlaying(l, tw))
  // The highest round line that names three to six players, so the whole
  // list fits and the count in the heading is the list.
  for (const floor of [25, 20, 18, 15]) {
    const over = lines.filter((l) => l.low >= floor).sort((a, b) => b.low - a.low)
    if (over.length < 3) continue
    if (over.length > 6) return null
    const head = `${over.length} players have scored ${floor}+ PPR points in every game this season:`
    const built = listPost(head, over.map((l) => `${named(l.player)}, ${l.player.position}, low ${fmt1(l.low)}`), `Through Week ${p.week}.`, over.length)
    return built
  }
  return null
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

  const byeSet = new Set(bye)
  const through = Math.max(1, p.week - 1)
  const [lines, tw] = await Promise.all([seasonLines(p.season, through), teamWeeks(p.season, through)])
  // Someone already on IR isn't sitting out for the bye.
  const names = lines
    .filter((l) => byeSet.has(l.player.team ?? '') && stillPlaying(l, tw))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 4)
    .map((l) => who(l.player))
  const teams = bye.length === 1 ? bye[0] : `${bye.slice(0, -1).join(', ')} and ${bye[bye.length - 1]}`
  const biggest = names.length >= 2
    ? `\n\nThe biggest names sitting out: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`
    : ''
  const make = (body: string) => `On bye in Week ${p.week}: ${teams}.${body}\n\nCheck your lineups before tonight's game.`
  // Drop the names before the teams if X runs out of room.
  return textOnly(xLength(make(biggest)) <= X_ROOM ? make(biggest) : make(''), make(biggest))
}

// ── Sunday morning: top projected at each position ───────────────────────
export async function buildProjections(p: WeekParams): Promise<Built | null> {
  const [players, proj] = await Promise.all([getPlayersNflDict(), weekProjections(p.season, p.week)])
  const best: Record<string, { player: Player; pts: number }> = {}
  for (const [id, pts] of proj) {
    const player = players[id]
    const pos = player?.position ?? ''
    if (!player?.full_name || !FANTASY_POS.has(pos)) continue
    if (!best[pos] || pts > best[pos].pts) best[pos] = { player, pts }
  }
  const order = ['QB', 'RB', 'WR', 'TE']
  if (order.some((pos) => !best[pos])) return null
  return listPost(
    `Sleeper's top projected player at every position for Week ${p.week}, PPR:`,
    order.map((pos) => `${pos} ${named(best[pos].player)}, ${fmt1(best[pos].pts)}`),
    '',
    4,
  )
}

// ── This year against last year ──────────────────────────────────────────
// The top five at one position through Week N, next to the top five through
// the same week a year ago (like windows: both seasons cut at Week N). Took
// Thursday from the position history post, which kept naming players from
// Wednesday's all-time list. The plan passes the position Wednesday's season
// leaders didn't use.
export async function buildYearAgo(p: SeasonParams): Promise<Built | null> {
  const [now, then, tw] = await Promise.all([seasonLines(p.season, p.week), seasonLines(p.season - 1, p.week), teamWeeks(p.season, p.week)])
  const top = (lines: Line[]) => lines.filter((l) => l.player.position === p.pos).sort((a, b) => b.pts - a.pts).slice(0, 5)
  // This year's side leaves out who's stopped playing; last year's is history.
  const a = top(now.filter((l) => stillPlaying(l, tw)))
  const b = top(then)
  if (a.length < 3 || b.length < 3) return null
  const make = (n: number) => [
    `Top ${POS_PLURAL[p.pos]} through Week ${p.week}, this year and last, PPR:`,
    `${p.season}\n${a.slice(0, n).map((l, i) => `${i + 1}. ${l.player.full_name}, ${fmt1(l.pts)}`).join('\n')}`,
    `${p.season - 1}\n${b.slice(0, n).map((l, i) => `${i + 1}. ${l.player.full_name}, ${fmt1(l.pts)}`).join('\n')}`,
  ].join('\n\n')
  const counts = [5, 4, 3].filter((n) => n <= Math.min(a.length, b.length))
  const x = counts.map(make).find((t) => xLength(t) <= X_ROOM) ?? counts.map(make).find((t) => xLength(t) <= X_MAX)
  const threads = counts.map(make).find((t) => t.length <= THREADS_MAX)
  return x && threads ? textOnly(x, threads) : null
}

// ── Best game ever in this week, at one position ─────────────────────────
// RETIRED 2026-10-06 from the plan (crossed over with Wednesday's all-time
// top six); kept for the rows already written.
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
    const x = xLength(`${lead}\n\n${runner}`) <= X_ROOM ? `${lead}\n\n${runner}` : lead
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
    'Sunday night still to come.',
  )
}

// ── Drafted side by side ─────────────────────────────────────────────────
// Two players taken a pick or two apart in Sleeper drafts, with the biggest
// gap in points since. Starting-lineup picks only (top 100).
export async function buildSideBySide(p: WeekParams): Promise<Built | null> {
  const [lines, adp, tw] = await Promise.all([seasonLines(p.season, p.week), draftPositions(p.season), teamWeeks(p.season, p.week)])
  // Both have to have played every game: a gap that's an injury isn't a story.
  const drafted = lines
    .map((l) => ({ l, adp: adp.get(l.id) ?? 999 }))
    .filter((x) => x.adp <= 100 && everyGame(x.l, tw))
    .sort((a, b) => a.adp - b.adp)
  let pair: [typeof drafted[number], typeof drafted[number]] | null = null
  for (let i = 0; i < drafted.length; i++) {
    for (let j = i + 1; j < drafted.length && drafted[j].adp - drafted[i].adp <= 2; j++) {
      const gap = Math.abs(drafted[i].l.pts - drafted[j].l.pts)
      if (!pair || gap > Math.abs(pair[0].l.pts - pair[1].l.pts)) pair = [drafted[i], drafted[j]]
    }
  }
  if (!pair || Math.abs(pair[0].l.pts - pair[1].l.pts) < 30) return null
  const [hi, lo] = pair[0].l.pts >= pair[1].l.pts ? pair : [pair[1], pair[0]]
  const line = (x: typeof hi) => `${x.l.player.full_name} (${x.l.player.position}), pick ${Math.round(x.adp)}: ${fmt1(x.l.pts)} PPR points`
  return textOnly(`Taken side by side in Sleeper drafts:\n\n${line(hi)}\n${line(lo)}\n\nThrough Week ${p.week}.`)
}

// ── Best single games of the season ──────────────────────────────────────
export async function buildHighs(p: WeekParams): Promise<Built | null> {
  const top = (await seasonLines(p.season, p.week)).sort((a, b) => b.best.pts - a.best.pts).slice(0, 5)
  if (top.length < 5) return null
  return listPost(
    'The best single games of the season so far, one per player, PPR:',
    top.map((l, i) => `${i + 1}. ${named(l.player)}, ${fmt1(l.best.pts)} in Week ${l.best.week}`),
    `Through Week ${p.week}.`,
    // Five fits most weeks; long names drop the fifth rather than the post.
    4,
  )
}

// ── Red zone chances ─────────────────────────────────────────────────────
export async function buildRedZone(p: WeekParams): Promise<Built | null> {
  const [lines, tw] = await Promise.all([seasonLines(p.season, p.week), teamWeeks(p.season, p.week)])
  const top = lines.filter((l) => l.rz > 0 && stillPlaying(l, tw)).sort((a, b) => b.rz - a.rz).slice(0, 5)
  if (top.length < 5 || top[0].rz < 8) return null
  return listPost(
    `Most red zone chances through Week ${p.week}, carries plus targets inside the 20:`,
    top.map((l, i) => `${i + 1}. ${who(l.player)}, ${l.rz}`),
  )
}

// ── Name the player ──────────────────────────────────────────────────────
// A big game from the archive with the name held back. The answer is not in
// the post (blank lines to push it down collapse on both platforms, so it sat
// right under the question); the publisher replies with it a couple of hours
// after the post goes out (ANSWER_DELAY_MS in publish.ts). Written at plan
// time; `k` keeps two in one week apart.
export async function buildNameGame(lastSeason: number, rotation: number, k: number): Promise<{ built: Built; answer: string }> {
  const players = await getPlayersNflDict()
  const years = lastSeason - 2009 + 1
  for (let tries = 0; tries < 6; tries++) {
    const n = rotation * 2 + k + tries * 13
    const year = 2009 + ((n * 7) % years)
    const week = 1 + ((n * 5) % 17)
    const stats = (await fetchWeekStats(year, week).catch(() => ({}))) as Record<string, Stats>
    const best = Object.entries(stats)
      .map(([id, s]) => ({ id, s, pts: s.pts_ppr ?? 0, player: players[id] }))
      .filter((x) => x.player?.full_name && FANTASY_POS.has(x.player.position ?? ''))
      .sort((a, b) => b.pts - a.pts)[0]
    if (!best || best.pts < 30) continue
    const pos = best.player.position!
    const text = `Name the player. A ${POS_WORD[pos]}, Week ${week} of ${year}: ${statLine(pos, best.s)}, ${fmt1(best.pts)} PPR points.\n\nAnswer in the replies.`
    return { built: textOnly(text), answer: `It was ${best.player.full_name}.` }
  }
  throw new Error('no archive game big enough')
}

// ── Monday night ─────────────────────────────────────────────────────────
// The two best fantasy players in each Monday night game, side by side:
// points per game so far, position rank, and Sleeper's projection for the
// night. A comparison people take in before kickoff; nothing to answer.
export async function buildMondayNight(p: WeekParams & { date: string }): Promise<Built | null> {
  if (p.week < 2) return null
  const res = await fetch(`https://api.sleeper.com/schedule/nfl/regular/${p.season}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sleeper schedule ${p.season}: ${res.status}`)
  const games = ((await res.json()) as { week: number; date: string; home: string; away: string; status?: string }[])
    .filter((g) => g.week === p.week && g.date === p.date && g.status !== 'canceled')
    .slice(0, 2)
  if (!games.length) return null

  const [lines, proj] = await Promise.all([seasonLines(p.season, p.week - 1), weekProjections(p.season, p.week)])
  const rank = positionRanks(lines)
  const minGames = Math.max(1, p.week - 2)
  const blocks: { head: string; rows: string[] }[] = []
  for (const g of games) {
    const best = lines
      // Projected for tonight, so nobody ruled out makes the list.
      .filter((l) => (l.player.team === g.home || l.player.team === g.away) && l.games >= minGames && (proj.get(l.id) ?? 0) > 0)
      .sort((a, b) => b.pts / b.games - a.pts / a.games)
      .slice(0, 2)
    if (best.length < 2) continue
    blocks.push({
      head: `${g.away} at ${g.home}`,
      rows: best.map((l) => `${who(l.player)}: ${fmt1(l.pts / l.games)} a game, ${l.player.position}${rank.get(l)}, projected ${fmt1(proj.get(l.id)!)}`),
    })
  }
  if (!blocks.length) return null
  const compose = (bs: typeof blocks, note: boolean) => {
    const title = bs.length === 1
      ? `Monday night, ${bs[0].head}. The two best fantasy players in the game, PPR:`
      : 'Monday night. The two best fantasy players in each game, PPR:'
    const body = bs.length === 1 ? bs[0].rows.join('\n') : bs.map((b) => `${b.head}\n${b.rows.join('\n')}`).join('\n\n')
    return `${title}\n\n${body}${note ? `\n\nSeason averages through Week ${p.week - 1}, projections from Sleeper.` : ''}`
  }
  // Longest version that fits each platform: with the footnote, without it,
  // then (on a doubleheader) the first game alone.
  const options = [compose(blocks, true), compose(blocks, false), compose(blocks.slice(0, 1), true), compose(blocks.slice(0, 1), false)]
  const x = options.find((t) => xLength(t) <= X_ROOM) ?? options.find((t) => xLength(t) <= X_MAX)
  const threads = options.find((t) => t.length <= THREADS_MAX)
  return x && threads ? textOnly(x, threads) : null
}

// ── Thursday night ───────────────────────────────────────────────────────
// Friday morning: the best fantasy games from Thursday night, while the rest
// of the week is still to play. Thanksgiving's three games go in one list.
export async function buildThursday(p: WeekParams & { date: string }): Promise<Built | null> {
  const res = await fetch(`https://api.sleeper.com/schedule/nfl/regular/${p.season}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sleeper schedule ${p.season}: ${res.status}`)
  const games = ((await res.json()) as { week: number; date: string; home: string; away: string; status?: string }[])
    .filter((g) => g.week === p.week && g.date === p.date && g.status !== 'canceled')
  if (!games.length) return null
  const teams = new Set(games.flatMap((g) => [g.home, g.away]))
  const [players, stats] = await Promise.all([getPlayersNflDict(), fetchWeekStats(p.season, p.week)])
  const top = Object.entries(stats as Record<string, Stats>)
    .map(([id, s]) => ({ player: players[id], pts: s.pts_ppr ?? 0 }))
    .filter((t) => t.player?.full_name && FANTASY_POS.has(t.player.position ?? '') && teams.has(t.player.team ?? ''))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 5)
  if (top.length < 3 || top[0].pts < 15) return null
  const head = games.length === 1
    ? `Thursday night, ${games[0].away} at ${games[0].home}. The top fantasy scorers, PPR:`
    : 'Thursday\'s top fantasy scorers, PPR:'
  return listPost(head, top.map((t, i) => `${i + 1}. ${who(t.player)}, ${fmt1(t.pts)}`))
}

// ── Snap share jumps ─────────────────────────────────────────────────────
// Tuesday waiver reading: who played far more of his team's offensive snaps
// last week than he had been. A week he sat out doesn't drag his average down.
export async function buildSnaps(p: WeekParams): Promise<Built | null> {
  if (p.week < 3) return null
  const [players, weeks] = await Promise.all([getPlayersNflDict(), fetchSeasonByWeek(p.season, p.week)])
  const share = (s: Stats | undefined) => (s && (s.tm_off_snp ?? 0) > 0 && (s.off_snp ?? 0) > 0 ? s.off_snp! / s.tm_off_snp! : null)
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const jumps: { player: Player; before: number; now: number }[] = []
  for (const [id, s] of Object.entries(weeks[p.week - 1] as Record<string, Stats>)) {
    const player = players[id]
    if (!player?.full_name || !['RB', 'WR', 'TE'].includes(player.position ?? '')) continue
    if (!player.team || OUT_FOR_WEEKS.has(player.injury_status ?? '')) continue
    const now = share(s)
    const prior = weeks.slice(0, p.week - 1).map((w) => share((w as Record<string, Stats>)[id])).filter((x): x is number => x != null)
    if (now == null || prior.length < 2) continue
    const before = prior.reduce((a, b) => a + b, 0) / prior.length
    if (now >= 0.5 && now - before >= 0.2) jumps.push({ player, before, now })
  }
  const top = jumps.sort((a, b) => (b.now - b.before) - (a.now - a.before)).slice(0, 5)
  return listPost(
    `The biggest jumps in snap share in Week ${p.week}, from the average before it:`,
    top.map((j, i) => `${i + 1}. ${who(j.player)}, ${pct(j.before)} to ${pct(j.now)}`),
  )
}

// ── Rookies ──────────────────────────────────────────────────────────────
export async function buildRookies(p: WeekParams): Promise<Built | null> {
  const [lines, tw] = await Promise.all([seasonLines(p.season, p.week), teamWeeks(p.season, p.week)])
  const top = lines
    .filter((l) => l.player.years_exp === 0 && stillPlaying(l, tw))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 5)
  if (!top.length || top[0].pts < 30) return null
  return listPost(
    `The top rookies in PPR points through Week ${p.week}:`,
    top.map((l, i) => `${i + 1}. ${who(l.player)}, ${fmt1(l.pts)}`),
    '',
    5,
  )
}

// ── The last three weeks ─────────────────────────────────────────────────
// Form, not the season: points per game over the last three weeks, so a bye
// in the window doesn't count against anyone. Two games at least.
export async function buildHot(p: WeekParams): Promise<Built | null> {
  if (p.week < 4) return null
  const from = p.week - 2
  const [lines, tw] = await Promise.all([seasonLines(p.season, p.week), teamWeeks(p.season, p.week)])
  const top = lines
    .map((l) => {
      const pts = [from, from + 1, p.week].map((w) => l.byWeek.get(w)).filter((x): x is number => x != null)
      return { l, games: pts.length, ppg: pts.reduce((a, b) => a + b, 0) / (pts.length || 1) }
    })
    .filter((x) => x.games >= 2 && stillPlaying(x.l, tw))
    .sort((a, b) => b.ppg - a.ppg)
    .slice(0, 5)
  return listPost(
    `The most PPR points per game over Weeks ${from} to ${p.week}:`,
    top.map((x, i) => `${i + 1}. ${who(x.l.player)}, ${fmt1(x.ppg)}`),
    '',
    5,
  )
}

// ── Backups (see BACKUP_KINDS) ───────────────────────────────────────────
export async function buildTouchdowns(p: WeekParams): Promise<Built | null> {
  const [lines, tw] = await Promise.all([seasonLines(p.season, p.week), teamWeeks(p.season, p.week)])
  const top = lines
    .filter((l) => l.player.position !== 'QB' && l.td > 0 && stillPlaying(l, tw))
    .sort((a, b) => b.td - a.td || b.pts - a.pts)
    .slice(0, 5)
  if (top.length < 5 || top[0].td < 4) return null
  return listPost(
    `Most touchdowns through Week ${p.week}, rushing and receiving:`,
    top.map((l, i) => `${i + 1}. ${who(l.player)}, ${l.td}`),
  )
}

export async function buildAirYards(p: WeekParams): Promise<Built | null> {
  const [lines, tw] = await Promise.all([seasonLines(p.season, p.week), teamWeeks(p.season, p.week)])
  const top = lines
    .filter((l) => l.air > 0 && stillPlaying(l, tw))
    .sort((a, b) => b.air - a.air)
    .slice(0, 5)
  if (top.length < 5 || top[0].air < 300) return null
  return listPost(
    `Most air yards through Week ${p.week}:`,
    top.map((l, i) => `${i + 1}. ${who(l.player)}, ${Math.round(l.air)} (${Math.round(l.air / l.games)} a game)`),
  )
}

export async function buildQbRush(p: WeekParams): Promise<Built | null> {
  const [lines, tw] = await Promise.all([seasonLines(p.season, p.week), teamWeeks(p.season, p.week)])
  const top = lines
    .filter((l) => l.player.position === 'QB' && l.qbRush > 0 && stillPlaying(l, tw))
    .sort((a, b) => b.qbRush - a.qbRush)
    .slice(0, 5)
  if (top.length < 5 || top[0].qbRush < 150) return null
  return listPost(
    `Most rushing yards by a quarterback through Week ${p.week}:`,
    top.map((l, i) => `${i + 1}. ${named(l.player)}, ${Math.round(l.qbRush)}`),
  )
}

// ── Send-time builds ─────────────────────────────────────────────────────
/** Builds a post that could only be written on the day, from its params. */
export async function buildOnTheDay(kind: string, params: Record<string, unknown>): Promise<{ built: Built } | { skip: string }> {
  const quiet = (built: Built | null, why: string) => (built ? { built } : { skip: why })
  const wk = params as unknown as WeekParams
  switch (kind) {
    case 'regret':
      return quiet(await buildRegret(params as unknown as RegretParams), 'quiet week: fewer than three dropped players scored 12+')
    case 'trending':
      return quiet(await buildTrending(), 'Sleeper trending list was short')
    case 'drops':
      return quiet(await buildDrops(), 'Sleeper trending list was short')
    case 'leaders':
      return quiet(await buildLeaders(wk), 'the week\'s scores are not in yet')
    case 'beat':
      return quiet(await buildBeat(wk), 'no big beats against projection, or scores not in')
    case 'season':
      return quiet(await buildSeason(params as unknown as SeasonParams), 'not enough season stats')
    case 'yearago':
      return quiet(await buildYearAgo(params as unknown as SeasonParams), 'not enough season stats')
    case 'targets':
      return quiet(await buildTargets(wk), 'not enough season stats')
    case 'pace':
      return quiet(await buildPace(wk), 'not enough season stats')
    case 'bargains':
      return quiet(await buildBargains(wk), 'no late-round picks are starting yet')
    case 'busts':
      return quiet(await buildBusts(wk), 'no early-round busts this week')
    case 'streaks':
      return quiet(await buildStreaks(wk), 'no clean streak list this week')
    case 'byes':
      return quiet(await buildByes(wk), 'no byes this week')
    case 'sidebyside':
      return quiet(await buildSideBySide(wk), 'no big gap between neighbouring draft picks')
    case 'highs':
      return quiet(await buildHighs(wk), 'not enough season stats')
    case 'redzone':
      return quiet(await buildRedZone(wk), 'not enough season stats')
    case 'mnf':
      return quiet(await buildMondayNight(params as unknown as WeekParams & { date: string }), 'no Monday game, or not enough stats yet')
    case 'projections':
      return quiet(await buildProjections(wk), 'no projections for this week yet')
    case 'sunday':
      return quiet(await buildSunday(wk), 'Sunday scores are not in yet')
    case 'tnf':
      return quiet(await buildThursday(params as unknown as WeekParams & { date: string }), 'no Thursday game, or its scores are not in')
    case 'snaps':
      return quiet(await buildSnaps(wk), 'no big snap share jumps this week')
    case 'rookies':
      return quiet(await buildRookies(wk), 'not enough rookie stats')
    case 'hot':
      return quiet(await buildHot(wk), 'not enough season stats')
    case 'touchdowns':
      return quiet(await buildTouchdowns(wk), 'not enough season stats')
    case 'airyards':
      return quiet(await buildAirYards(wk), 'not enough season stats')
    case 'qbrush':
      return quiet(await buildQbRush(wk), 'not enough season stats')
    default:
      return { skip: 'no copy and nothing to build it from' }
  }
}
