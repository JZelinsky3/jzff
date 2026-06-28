// Sleeper player stats — per-week raw stat lines for every NFL player.
//
// Used by positionRanks to compute season-to-date fantasy ranks under a
// specific league's scoring_settings. Sleeper publishes free public endpoints
// for both season aggregate and per-week stats.
//
// We need PER-WEEK data (not just season aggregates) because most leagues
// apply per-game bonuses ("100+ rushing yards = +3 pts") that can't be
// recovered from cumulative season totals.
//
//   /stats/nfl/regular/{season}/{week}   one week, every player
//   /stats/nfl/regular/{season}          season aggregate (kept as a fast path
//                                        when no bonuses are in play)
//
// The response shape is { [player_id]: { [stat_key]: number } } for season
// aggregate, and an array variant for per-week. Both are kept in a per-
// process in-memory cache with a 1-hour TTL — the data only changes after
// each NFL week, so re-fetching per request would be wasteful.

const BASE = 'https://api.sleeper.app/v1'
const TTL_MS = 60 * 60 * 1000 // 1 hour

type RawStats = Record<string, number>
type WeekStats = Record<string, RawStats> // player_id -> stat line

type CacheEntry<T> = { value: T; expires: number }
const cache = new Map<string, CacheEntry<unknown>>()

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expires < Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.value as T
}

function setCached<T>(key: string, value: T): void {
  cache.set(key, { value, expires: Date.now() + TTL_MS })
}

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' })
  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error(`Sleeper stats ${path} -> ${res.status}`)
  }
  return (await res.json()) as T
}

// Per-week stats. Sleeper returns an array where each item carries
// `player_id` plus a `stats` object. Normalize to a flat
// player_id -> stats map for downstream consumers.
export async function fetchWeekStats(season: number, week: number): Promise<WeekStats> {
  const cacheKey = `week:${season}:${week}`
  const hit = getCached<WeekStats>(cacheKey)
  if (hit) return hit

  type RawRow = { player_id?: string; stats?: RawStats } | RawStats
  const data = await getJson<unknown>(`/stats/nfl/regular/${season}/${week}`)

  const out: WeekStats = {}
  if (Array.isArray(data)) {
    for (const row of data as RawRow[]) {
      if ('player_id' in row && row.player_id) {
        out[row.player_id] = (row.stats ?? {}) as RawStats
      }
    }
  } else if (data && typeof data === 'object') {
    // Object form: { player_id: { stats } }
    for (const [pid, stats] of Object.entries(data as Record<string, RawStats>)) {
      out[pid] = stats
    }
  }

  setCached(cacheKey, out)
  return out
}

// Pull weeks 1..throughWeek. Done in parallel — Sleeper's stats endpoints
// have no rate limit we've ever hit, and a 17-week pull is well under a
// second on a warm cache.
export async function fetchSeasonByWeek(
  season: number,
  throughWeek: number,
): Promise<WeekStats[]> {
  const weeks = Array.from({ length: throughWeek }, (_, i) => i + 1)
  return Promise.all(weeks.map((w) => fetchWeekStats(season, w)))
}
