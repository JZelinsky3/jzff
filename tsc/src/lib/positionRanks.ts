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

function nameKey(name: string, position?: string | null): string {
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
// — the dict is large and rebuilding per asset would be wasteful.
async function buildNameLookup(): Promise<Map<string, string>> {
  const playersMap = await getPlayersMap()
  const out = new Map<string, string>()
  for (const [pid, p] of Object.entries(playersMap)) {
    if (!p.name) continue
    const key = nameKey(p.name, p.position ?? '')
    if (!out.has(key)) out.set(key, pid)
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
