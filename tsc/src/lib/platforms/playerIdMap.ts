// Cross-platform player ID translation.
//
// Sleeper's /players/nfl response carries every player's identifiers on the
// other major platforms (espn_id, yahoo_id, gsis_id). We build reverse maps
// once per cache window so any platform-specific roster can be translated
// back to Sleeper IDs — which is the canonical key the value engine, depth
// math, and analyzer route all expect.
//
// Cached 6h. Sleeper's dictionary updates daily for injuries; the cross-
// platform IDs are effectively immutable per player, so we could cache for
// much longer, but 6h aligns with the other Sleeper dict caches in the app
// and keeps mental model simple.

import { unstable_cache } from 'next/cache'
import { sleeper } from './sleeper'

export type PlatformIdMaps = {
  // ESPN's numeric playerId → Sleeper player_id. ESPN sometimes sends the id
  // as a number in payloads; we key by string to avoid coercion surprises.
  espnToSleeper: Map<string, string>
  // Yahoo's numeric playerId (the `<id>` in `nfl.p.<id>`) → Sleeper.
  yahooToSleeper: Map<string, string>
  // NFL.com fantasy uses gsis_id under the hood — the NFL's canonical id —
  // which Sleeper exposes directly.
  gsisToSleeper: Map<string, string>
  // Diagnostic: how many Sleeper rows had each kind of foreign id. Useful for
  // sanity checks ("did the mapping degrade?").
  counts: { espn: number; yahoo: number; gsis: number; total: number }
}

async function build(): Promise<PlatformIdMaps> {
  const all = await sleeper.playersNfl()
  const espnToSleeper = new Map<string, string>()
  const yahooToSleeper = new Map<string, string>()
  const gsisToSleeper = new Map<string, string>()
  let cEspn = 0, cYahoo = 0, cGsis = 0, total = 0
  if (!all) {
    return { espnToSleeper, yahooToSleeper, gsisToSleeper, counts: { espn: 0, yahoo: 0, gsis: 0, total: 0 } }
  }
  for (const [sid, p] of Object.entries(all)) {
    total += 1
    if (p.espn_id != null && p.espn_id !== '') {
      const key = String(p.espn_id)
      // First write wins — active players appear before retired homonyms in
      // Sleeper's dict ordering (best-effort, but safer than overwriting).
      if (!espnToSleeper.has(key)) { espnToSleeper.set(key, sid); cEspn += 1 }
    }
    if (p.yahoo_id != null && p.yahoo_id !== '') {
      const key = String(p.yahoo_id)
      if (!yahooToSleeper.has(key)) { yahooToSleeper.set(key, sid); cYahoo += 1 }
    }
    if (p.gsis_id != null && p.gsis_id !== '') {
      const key = String(p.gsis_id)
      if (!gsisToSleeper.has(key)) { gsisToSleeper.set(key, sid); cGsis += 1 }
    }
  }
  return {
    espnToSleeper,
    yahooToSleeper,
    gsisToSleeper,
    counts: { espn: cEspn, yahoo: cYahoo, gsis: cGsis, total },
  }
}

// Cached export. Maps don't serialize through the data cache cleanly — we
// store the arrays of entries and rehydrate. Same pattern Sunday Live uses
// for its cached lookup tables.
type Serialized = {
  espn: [string, string][]
  yahoo: [string, string][]
  gsis: [string, string][]
  counts: PlatformIdMaps['counts']
}
const cachedSerialized = unstable_cache(
  async (): Promise<Serialized> => {
    const m = await build()
    return {
      espn: [...m.espnToSleeper.entries()],
      yahoo: [...m.yahooToSleeper.entries()],
      gsis: [...m.gsisToSleeper.entries()],
      counts: m.counts,
    }
  },
  ['platform-id-maps', 'v1'],
  { revalidate: 6 * 60 * 60, tags: ['sleeper-players'] },
)

export async function getPlayerIdMaps(): Promise<PlatformIdMaps> {
  const s = await cachedSerialized()
  return {
    espnToSleeper: new Map(s.espn),
    yahooToSleeper: new Map(s.yahoo),
    gsisToSleeper: new Map(s.gsis),
    counts: s.counts,
  }
}

// Translate an array of platform-native player IDs to Sleeper IDs. Returns
// both the resolved Sleeper IDs (in input order, with unresolved positions
// dropped) and the list of unresolved inputs so callers can surface a
// diagnostic count in their response. Pass `'espn' | 'yahoo' | 'gsis'`.
export type PlatformKind = 'espn' | 'yahoo' | 'gsis'
export async function translatePlayerIds(
  kind: PlatformKind,
  ids: Array<string | number | null | undefined>,
): Promise<{ sleeperIds: string[]; unresolved: string[] }> {
  const maps = await getPlayerIdMaps()
  const lookup =
    kind === 'espn'   ? maps.espnToSleeper :
    kind === 'yahoo'  ? maps.yahooToSleeper :
                        maps.gsisToSleeper
  const sleeperIds: string[] = []
  const unresolved: string[] = []
  for (const raw of ids) {
    if (raw == null || raw === '') continue
    const key = String(raw)
    const sid = lookup.get(key)
    if (sid) sleeperIds.push(sid)
    else     unresolved.push(key)
  }
  return { sleeperIds, unresolved }
}
