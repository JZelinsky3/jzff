// Real player projections, sourced from Sleeper's RotoWire-backed feed.
//
// Endpoint:
//   GET https://api.sleeper.com/projections/nfl/<year>?season_type=regular
// Returns season-long projections for every player Sleeper tracks. Each row
// has `player_id` (Sleeper's), `stats.pts_ppr / pts_half_ppr / pts_std`, and
// `stats.gp` (projected games played). Per-game average is total / gp.
//
// This is the analyzer's source of truth for "projected lineup ppg" — far
// better than deriving it from consensus value via a fixed multiplier. The
// previous proxy (value × 0.0036 + 14) is preserved as a fallback when the
// endpoint fails or a player isn't projected (rookies who don't appear yet,
// etc.).
//
// Cached 12h to match the other Sleeper-flavored caches in the app.

import { unstable_cache } from 'next/cache'

const SLEEPER_PROJ_URL = (year: number) =>
  `https://api.sleeper.com/projections/nfl/${year}?season_type=regular`

export type ScoringProfile = 'PPR' | 'HALF' | 'STANDARD'

type RawProjectionRow = {
  player_id?: string
  player?: { position?: string | null }
  stats?: {
    pts_ppr?: number
    pts_half_ppr?: number
    pts_std?: number
    gp?: number
  }
}

type CachedProjectionMap = {
  // playerId → projected fantasy points per game for each scoring variant.
  ppgByPid: Record<string, { ppr: number; half: number; std: number }>
  year: number
  rowCount: number
}

async function fetchAndShape(year: number): Promise<CachedProjectionMap> {
  const res = await fetch(SLEEPER_PROJ_URL(year), {
    cache: 'no-store',
    headers: { 'User-Agent': 'TSC-ManagerHub/1.0 (+https://thesunday.chronicle)' },
  })
  if (!res.ok) throw new Error(`Sleeper projections ${year} → ${res.status}`)
  const rows = (await res.json()) as RawProjectionRow[]
  if (!Array.isArray(rows)) throw new Error('Sleeper projections returned non-array')

  const ppgByPid: CachedProjectionMap['ppgByPid'] = {}
  for (const r of rows) {
    const pid = r.player_id
    if (!pid) continue
    const stats = r.stats ?? {}
    const gp = typeof stats.gp === 'number' && stats.gp > 0 ? stats.gp : 18
    const total = (variant: 'ppr' | 'half' | 'std'): number => {
      const raw =
        variant === 'ppr'  ? stats.pts_ppr :
        variant === 'half' ? stats.pts_half_ppr :
                             stats.pts_std
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0
      return raw / gp
    }
    const ppr = total('ppr')
    const half = total('half')
    const std = total('std')
    // Skip rows with zero projections in all scoring variants (IDP, undrafted
    // FAs Sleeper still ships — they'd just be noise in the map).
    if (ppr === 0 && half === 0 && std === 0) continue
    ppgByPid[pid] = { ppr, half, std }
  }
  return { ppgByPid, year, rowCount: Object.keys(ppgByPid).length }
}

// Per-year cache. unstable_cache key includes the year so different seasons
// don't clobber each other.
const cachedYear = (year: number) =>
  unstable_cache(
    () => fetchAndShape(year),
    ['sleeper-projections', 'v1', String(year)],
    { revalidate: 12 * 60 * 60 },
  )

export async function getProjectionsForYear(year: number): Promise<CachedProjectionMap> {
  try {
    return await cachedYear(year)()
  } catch {
    return { ppgByPid: {}, year, rowCount: 0 }
  }
}

// Convert a scoring profile string (from EffectiveSettings) to the variant
// key used in the cached map. STANDARD → std, HALF → half, PPR → ppr.
function variantFor(scoring: string | undefined): 'ppr' | 'half' | 'std' {
  const s = (scoring ?? 'PPR').toUpperCase()
  if (s === 'STANDARD' || s === 'STD') return 'std'
  if (s === 'HALF' || s === 'HALF_PPR' || s === 'HALF-PPR') return 'half'
  return 'ppr'
}

// Per-player ppg projection. Returns 0 when the player isn't projected.
export function ppgFor(
  pid: string,
  scoring: string | undefined,
  map: CachedProjectionMap,
): number {
  const row = map.ppgByPid[pid]
  if (!row) return 0
  return row[variantFor(scoring)]
}

// Sum projections over a list of player ids — used for "starting lineup ppg".
// Missing players contribute 0; the caller can decide whether to layer on a
// flat DEF/K offset for positions not in the projection set or use the
// projection's own DEF/K values if they're present.
export function sumPpg(
  pids: Iterable<string>,
  scoring: string | undefined,
  map: CachedProjectionMap,
): number {
  let total = 0
  for (const pid of pids) total += ppgFor(pid, scoring, map)
  return total
}
