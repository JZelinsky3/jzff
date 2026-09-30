// Cumulative position rank under a league's scoring_settings.
//
// Given a league's scoring rules + a season + a "through this week" cutoff,
// computes each player's season-to-date fantasy points and ranks them
// within their position. The output is a Map<sleeper_id, "RB12"> the
// trade ingest can stamp onto each player asset.
//
// Why this matters for the Grader: at the moment a trade happens, the
// most interesting context isn't player value (KTC/FC tier) — it's where
// each player actually sits in the season's points race. "I traded for
// the QB7 and gave up the WR3" tells a richer story than a tier label.
//
// Source of truth:
//   • Per-week NFL stats: Sleeper's /stats endpoints (see playerStats.ts).
//   • Player positions: Sleeper's /players/nfl dict (already cached via
//     sleeperPlayers.ts).
//   • Scoring: the league's own scoring_settings.

import { fetchSeasonByWeek } from './playerStats'
import { scoreSeason } from './scoring'
import { getPlayersMap } from './sleeperPlayers'
import { applyNameAliases, NAME_ALIASES } from './values/nameAliases'
import { nflWeekAt, weekOverAt } from './nflClock'

export type PositionRanks = Map<string, string> // player_id -> "RB12"

/**
 * Where "what position rank is this player" should come from right now.
 *
 *   'stats'  season-to-date fantasy points, once real games have been played
 *   'draft'  the preseason consensus draft board, before they have
 *
 * Why two modes: these are position ranks by POINTS SCORED, which only
 * exists once somebody has scored. Before week 1 there is nothing to rank.
 * Ranking off a partial week 1 is worse than nothing — it briefly made
 * whoever played Thursday the WR1 — and falling back to LAST season's final
 * ranks is wrong in a subtler way: it looks current but describes a season
 * that already ended, which is how Puka Nacua showed as WR1 and Ja'Marr
 * Chase as WR4 for 2026, an ordering essentially no 2026 board agrees with.
 *
 * The honest preseason answer is the draft board, which is what everyone
 * actually means by "he's the WR6" in August. Once week 1 is in the books
 * the stat ranks take over and are allowed to disagree with value: a good
 * player having a bad week genuinely is a low scoring rank, and that gap is
 * the interesting part.
 */
export type RankSource =
  | { kind: 'stats'; season: number; throughWeek: number }
  | { kind: 'draft'; year: number }

// Stat ranks start once week 1 is complete, i.e. the clock has moved on to
// week 2. During week 1 itself the games are still being played.
const FIRST_STATS_WEEK = 2

export function resolveRankSource(
  clock: { season?: string | number | null; week?: string | number | null; season_type?: string | null } | null | undefined,
): RankSource | null {
  if (!clock) return null
  const season = Number(clock.season)
  if (!Number.isFinite(season) || season <= 0) return null

  const inSeason = clock.season_type === 'regular' || clock.season_type === 'post'
  const week = Number(clock.week)

  if (inSeason && Number.isFinite(week) && week >= FIRST_STATS_WEEK) {
    // `week` is the week being PLAYED. Ranking through it counted whatever
    // half of a Sunday had happened so far, so the ranks moved by the hour
    // all weekend. Rank through the last finished week instead.
    const throughWeek = clock.season_type === 'post' ? 18 : week - 1
    return { kind: 'stats', season, throughWeek: Math.min(18, throughWeek) }
  }
  // Preseason, offseason, or week 1 still in progress: the draft board for
  // the season about to be (or just being) played.
  return { kind: 'draft', year: season }
}

type ScoringSettings = Record<string, number>

// Positions we rank. Sleeper carries a wider position set (DB, DL, LB,
// IDP, etc.) but the Grader only surfaces offensive skill positions in
// trades, and IDP leagues are a tiny minority for now.
const RANKED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

// Minimum fantasy points to qualify for a rank — keeps deep-bench players
// from cluttering the leaderboard with rank labels like "WR287". An
// unranked player gets no chip in the UI rather than a sky-high number.
const RANK_FLOOR_PTS = 1

// Compute cumulative position ranks through a given week of a season.
//
// Throws on stats fetch failure (caller decides whether to swallow); a
// missing scoring_settings just yields zero-point scores across the board,
// which is fine — every player ends up tied at the bottom and no ranks
// get stamped.
export async function computePositionRanks(opts: {
  season: number
  throughWeek: number
  scoring: ScoringSettings
}): Promise<PositionRanks> {
  const { season, throughWeek, scoring } = opts

  if (throughWeek < 1) return new Map()

  const [weekly, playersMap] = await Promise.all([
    fetchSeasonByWeek(season, throughWeek),
    getPlayersMap(),
  ])

  // For each player who has any stat line in the window, sum their points
  // and group by position. Players Sleeper has metadata for but who
  // appeared in zero weeks contribute nothing.
  const seenIds = new Set<string>()
  for (const week of weekly) {
    for (const pid of Object.keys(week)) seenIds.add(pid)
  }

  const byPos: Map<string, Array<{ id: string; points: number }>> = new Map()
  for (const pid of seenIds) {
    const player = playersMap[pid]
    if (!player) continue
    const pos = (player.position ?? '').toUpperCase()
    if (!RANKED_POSITIONS.has(pos)) continue

    const lines = weekly.map((w) => w[pid])
    const points = scoreSeason(scoring, lines, pos)
    if (points < RANK_FLOOR_PTS) continue

    const list = byPos.get(pos) ?? []
    list.push({ id: pid, points })
    byPos.set(pos, list)
  }

  const ranks: PositionRanks = new Map()
  for (const [pos, list] of byPos) {
    list.sort((a, b) => b.points - a.points)
    list.forEach((entry, idx) => {
      ranks.set(entry.id, `${pos}${idx + 1}`)
    })
  }
  return ranks
}

// ── Which finished week a trade's ranks describe ──────────────────────────
//
// "Rank at trade" is where a player sat in the points race when the deal was
// made, read through a FINISHED week so the chip never moves afterwards:
//
//   • Tuesday to Saturday of week N: week N-1 was in the books, so N-1.
//     (A Thursday game may have started; one game is not a week.)
//   • Sunday, Monday, or the small hours of Tuesday before the rollover:
//     week N is being played. Ranks read mid-weekend move by the hour and
//     look absurd a day later, so these wait for week N to finish and rank
//     through N. Grading waits with them (the grade-trades cron checks
//     tradeRankWeekOver), which is what holds a Sunday trade until Tuesday.
//   • Before week 1 opens: 0, the preseason draft board.
//
// The verdict four weeks later reads through rank week + 4, so every trade
// gets four finished weeks of games between its two chips.
export const VERDICT_LAG_WEEKS = 4
// Trades are graded from this season on, and from it on the grade-trades
// cron is the one writer of their rank chips (rank_at_trade and the
// verdict's rank_now). Ingest still stamps older seasons' trades.
export const FIRST_GRADED_SEASON = 2026
const DAY_MS = 24 * 60 * 60 * 1000

function etWeekday(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(ms)
}

export function tradeRankWeek(
  year: number,
  executedAt: string | number | Date,
  seasonStartDate?: string | null,
): number {
  const t = executedAt instanceof Date ? executedAt.getTime() : typeof executedAt === 'number' ? executedAt : Date.parse(executedAt)
  if (!Number.isFinite(t)) return 0
  const week = nflWeekAt(year, t, seasonStartDate)
  if (week === 0) return 0
  const day = etWeekday(t)
  const midWeekend = day === 'Sun' || day === 'Mon' ||
    // Tuesday before the rollover still belongs to the week just played.
    (day === 'Tue' && nflWeekAt(year, t - DAY_MS, seasonStartDate) === week)
  return Math.min(18, midWeekend ? week : week - 1)
}

// Is that week finished, so its ranks can be read and frozen?
export function tradeRankWeekOver(year: number, rankWeek: number, seasonStartDate?: string | null, now = Date.now()): boolean {
  return now >= weekOverAt(year, rankWeek, seasonStartDate)
}

// The week a verdict's ranks read through: four finished weeks past the
// rank at trade, or the last finished week if the verdict ran sooner (a
// hand-run revisit, or one written before this rule existed).
export function verdictRankWeek(
  year: number,
  rankWeek: number,
  verdictAt: string | number | Date,
  seasonStartDate?: string | null,
): number {
  const lastFinished = Math.max(0, nflWeekAt(year, verdictAt, seasonStartDate) - 1)
  return Math.min(18, rankWeek + VERDICT_LAG_WEEKS, lastFinished)
}

// Ranks through a rank week: season-to-date stats, or for week 0 the
// preseason draft board. The board is live, so it only stands in for the
// preseason of the season being played now; week 0 of an older season
// gets no ranks rather than this year's board.
export async function ranksThroughWeek(opts: {
  season: number
  week: number
  scoring: ScoringSettings
}): Promise<PositionRanks> {
  if (opts.week >= 1) {
    return computePositionRanks({ season: opts.season, throughWeek: opts.week, scoring: opts.scoring })
  }
  const now = new Date()
  const draftSeason = now.getUTCMonth() >= 5 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  if (opts.season !== draftSeason) return new Map()
  return draftBoardRanks({ year: opts.season })
}

// Current position ranks, from whichever source resolveRankSource picks.
//
// One call so the Rumor Mill and the daily rank refresh can't drift into
// two different definitions of "rank right now". Returns an empty map
// rather than throwing: these ranks are decorative, and a chip with no rank
// beats a chip with a wrong one.
export async function buildCurrentRanks(opts: {
  scoring: ScoringSettings
  // Draft-board shape, used only in preseason. Defaults suit a standard
  // 1-QB PPR league.
  draftScoring?: 'ppr' | 'half'
  qbStarters?: number
}): Promise<PositionRanks> {
  const { sleeper } = await import('./platforms/sleeper')
  const source = resolveRankSource(await sleeper.state())
  if (!source) return new Map()

  if (source.kind === 'stats') {
    return computePositionRanks({
      season: source.season,
      throughWeek: source.throughWeek,
      scoring: opts.scoring,
    })
  }

  return draftBoardRanks({
    year: source.year,
    draftScoring: opts.draftScoring,
    qbStarters: opts.qbStarters,
  })
}

// Preseason position ranks off the consensus draft board.
async function draftBoardRanks(opts: {
  year: number
  draftScoring?: 'ppr' | 'half'
  qbStarters?: number
}): Promise<PositionRanks> {
  // Deliberately NOT DraftBoardPlayer.tier — that is a positional TIER
  // bucket in the fantasy sense ("he's a WR1", i.e. startable as your best
  // receiver), so a board has a dozen different WR1s. Stat ranks are
  // ordinals, so the preseason ranks have to be ordinals too or the same
  // chip means two different things in September and October.
  //
  // board.players carries a rank-decayed `value`, so ordering by it
  // reproduces the consensus overall ordering; counting down that list per
  // position gives WR1, WR2, WR3...
  const { buildDraftBoard } = await import('./values/draftRanks')
  const board = await buildDraftBoard({
    year: opts.year,
    scoring: opts.draftScoring ?? 'ppr',
    qbStarters: opts.qbStarters ?? 1,
  })

  const ordered = [...board.players].sort((a, b) => b.value - a.value)
  const seenPerPos = new Map<string, number>()
  const out: PositionRanks = new Map()
  for (const player of ordered) {
    const pos = (player.pos ?? '').toUpperCase()
    if (!RANKED_POSITIONS.has(pos)) continue
    const next = (seenPerPos.get(pos) ?? 0) + 1
    seenPerPos.set(pos, next)
    out.set(player.id, `${pos}${next}`)
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────
// Cross-platform asset stamping
// ──────────────────────────────────────────────────────────────────────
//
// Trade ingest stores a JSONB asset array per trade side. Each player asset
// carries the platform's own player_id, plus name + position. To stamp the
// season cumulative rank we look up the Sleeper id (the ranks map is keyed
// on Sleeper ids since stats came from /stats/nfl):
//
//   • Sleeper league: asset.player_id IS a Sleeper id, look up directly.
//   • ESPN / Yahoo / NFL: asset.player_id is platform-native; name+position
//     match against the Sleeper player dict (same path the analyzer uses
//     for cross-platform roster translation).
//
// Cached per (season, throughWeek) so multiple trades in the same week
// don't re-fetch stats.

// Loose asset shape — callers across ingest plumb assets through as
// Record<string, unknown> arrays, so we don't lock the type down further
// than "has a 'kind' field". The runtime check is what gates player
// handling.
type TradeAsset = Record<string, unknown>

export function nameKey(name: string, position?: string | null): string {
  const stripped = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'`’]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return `${stripped}|${(position ?? '').toUpperCase()}`
}

// Build a (name|POS) → sleeper_id lookup over the players dict, with the
// same nickname aliases the value sources apply. Memoized per ranks call
// — the dict is large and rebuilding per asset would be wasteful. Also
// used by the trade grader to resolve ESPN/Yahoo/NFL asset ids to Sleeper
// ids so value data attaches on every platform.
let lookupMemo: { at: number; map: Promise<Map<string, string>> } | null = null
const LOOKUP_TTL_MS = 10 * 60 * 1000

export async function buildNameLookup(): Promise<Map<string, string>> {
  // Memoized briefly: stamping a batch of trades used to rebuild this map
  // (a pass over the whole player dict) once per trade side.
  if (lookupMemo && Date.now() - lookupMemo.at < LOOKUP_TTL_MS) return lookupMemo.map
  const map = buildNameLookupFresh()
  lookupMemo = { at: Date.now(), map }
  map.catch(() => { lookupMemo = null })
  return map
}

async function buildNameLookupFresh(): Promise<Map<string, string>> {
  const playersMap = await getPlayersMap()
  const out = new Map<string, string>()
  // Name-only keys ("name|") are registered when the name is UNIQUE across
  // the dict — old NFL.com trade assets sometimes carry no position
  // (retired players), and an unambiguous name is still a safe match.
  // Ambiguous names get tombstoned so they never mismatch.
  const AMBIGUOUS = ' '
  for (const [pid, p] of Object.entries(playersMap)) {
    if (!p.name) continue
    const key = nameKey(p.name, p.position ?? '')
    if (!out.has(key)) out.set(key, pid)
    const bare = nameKey(p.name, '')
    const existing = out.get(bare)
    if (existing == null) out.set(bare, pid)
    else if (existing !== pid) out.set(bare, AMBIGUOUS)
  }
  for (const [k, v] of out) {
    if (v === AMBIGUOUS) out.delete(k)
  }
  applyNameAliases(out, nameKey)
  void NAME_ALIASES
  return out
}

// Stamp `rank_at_trade` (or `rank_now`) onto each player asset in the
// array. Returns a new array — does not mutate the input.
//
// `platform` selects the id-resolution strategy:
//   sleeper → asset.player_id is already a Sleeper id
//   other   → name-match against the Sleeper dict
//
// Assets the lookup can't resolve are passed through untouched (no rank
// stamp, no error). Picks and FAAB are passed through verbatim.
export async function stampRanks(
  assets: TradeAsset[],
  opts: {
    ranks: PositionRanks
    platform: 'sleeper' | 'espn' | 'yahoo' | 'nfl'
    field?: 'rank_at_trade' | 'rank_now'
  },
): Promise<TradeAsset[]> {
  const field = opts.field ?? 'rank_at_trade'
  const lookup = opts.platform === 'sleeper'
    ? null
    : await buildNameLookup()

  return assets.map((a) => {
    if (a.kind !== 'player') return a
    const pid = typeof a.player_id === 'string' ? a.player_id : undefined
    const name = typeof a.name === 'string' ? a.name : undefined
    const position = typeof a.position === 'string' ? a.position : undefined

    let sleeperId: string | undefined
    if (opts.platform === 'sleeper') {
      sleeperId = pid
    } else if (name && position && lookup) {
      sleeperId = lookup.get(nameKey(name, position)) ?? undefined
    }

    if (!sleeperId) return a
    const rank = opts.ranks.get(sleeperId)
    if (!rank) return a

    return { ...a, [field]: rank }
  })
}
