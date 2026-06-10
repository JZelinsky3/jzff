// Cached lean Sleeper player dictionary.
//
// sleeper.playersNfl() is ~5MB and changes slowly (team, position, injury
// status). We derive a much smaller map (name/team/pos/injury) and cache it in
// the Next data cache so the Games / News / My-Players pages can resolve roster
// player ids → NFL team + injury without re-pulling the whole dictionary each
// request. Revalidates hourly; the gameday "breaking" freshness comes from the
// ESPN news feed (see nflLive.ts), not this map.

import { unstable_cache } from 'next/cache'
import { sleeper, type SleeperPlayer } from '@/lib/platforms/sleeper'

export type LeanPlayer = {
  name: string
  team: string | null
  position: string | null
  injuryStatus: string | null
  injuryNote: string | null
  status: string | null
  newsUpdated: number | null
}

async function build(): Promise<Record<string, LeanPlayer>> {
  const all = await sleeper.playersNfl()
  const out: Record<string, LeanPlayer> = {}
  if (!all) return out
  for (const [id, p] of Object.entries(all)) {
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ')
    if (!name) continue
    out[id] = {
      name,
      team: p.team ?? null,
      position: p.position ?? null,
      injuryStatus: p.injury_status ?? null,
      injuryNote: p.injury_notes ?? null,
      status: p.status ?? null,
      newsUpdated: p.news_updated ?? null,
    }
  }
  return out
}

export const getPlayersMap = unstable_cache(build, ['sleeper-players-lean', 'v1'], {
  revalidate: 3600,
  tags: ['sleeper-players'],
})

// ── Full dictionary (in-memory only) ─────────────────────────────────────
//
// The raw /players/nfl payload is ~16MB of JSON — far over unstable_cache's
// 2MB entry limit, which current Next treats as a HARD error mid-response
// ("failed to pipe response") instead of a cache skip. The value sources
// (KTC / DynastyProcess / FantasyPros) need the full dict for name→id
// matching, so cache it per server instance in module memory instead.
// The in-flight promise is shared so parallel valuations during one cold
// start trigger a single fetch.
const FULL_DICT_TTL_MS = 6 * 60 * 60 * 1000
let fullDict: { at: number; promise: Promise<Record<string, SleeperPlayer>> } | null = null

export function getPlayersNflDict(): Promise<Record<string, SleeperPlayer>> {
  const now = Date.now()
  if (fullDict && now - fullDict.at < FULL_DICT_TTL_MS) return fullDict.promise
  const promise = sleeper.playersNfl().then((d) => d ?? {})
  // Never cache a rejection — the next caller should retry the fetch.
  promise.catch(() => {
    if (fullDict?.promise === promise) fullDict = null
  })
  fullDict = { at: now, promise }
  return promise
}
