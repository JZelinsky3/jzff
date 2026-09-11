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
    return { kind: 'stats', season, throughWeek: Math.min(18, week) }
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

  // Preseason: rank within position off the consensus draft board.
  //
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
    year: source.year,
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
export async function buildNameLookup(): Promise<Map<string, string>> {
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
