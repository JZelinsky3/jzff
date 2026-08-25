// Sleeper player dictionary, served from our own cache.
//
// Sleeper's docs ask that /players/nfl be called "once per day at most" — the
// payload is ~16MB. Exactly one function in this codebase calls it now:
// refreshSleeperPlayers(), driven by a daily cron. Everything else reads the
// sleeper_players_cache row that writes.
//
// Two shapes are served from that one row:
//   getPlayersMap()      lean (name/team/pos/injury) for roster rendering
//   getPlayersNflDict()  full SleeperPlayer records for the value engine's
//                        name→id matching (KTC / DynastyProcess / FantasyPros)

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { sleeper, type SleeperPlayer } from '@/lib/platforms/sleeper'

// Fields SleeperPlayer declares. Sleeper ships ~50 per player; projecting to
// just these before the row is stored drops roughly two thirds of the bytes.
const KEEP = [
  'player_id', 'full_name', 'first_name', 'last_name', 'position', 'team',
  'injury_status', 'injury_body_part', 'injury_notes', 'injury_start_date',
  'status', 'news_updated', 'years_exp', 'age', 'search_rank',
  'search_rank_pos', 'fantasy_positions',
  'espn_id', 'yahoo_id', 'gsis_id', 'fantasy_data_id', 'rotowire_id',
] as const satisfies readonly (keyof SleeperPlayer)[]

function project(all: Record<string, SleeperPlayer>): Record<string, SleeperPlayer> {
  const out: Record<string, SleeperPlayer> = {}
  for (const [id, p] of Object.entries(all)) {
    const slim = {} as Record<string, unknown>
    for (const k of KEEP) {
      const v = (p as Record<string, unknown>)[k]
      // Skip null/undefined rather than storing them — on ~11k players the
      // omitted keys are worth several MB on their own.
      if (v != null) slim[k] = v
    }
    out[id] = slim as SleeperPlayer
  }
  return out
}

// The ONLY caller of sleeper.playersNfl() outside a cold-start fallback.
// Invoked by /api/cron/refresh-sleeper-players once a day.
export async function refreshSleeperPlayers(): Promise<{
  fetched: number
  storedBytes: number
}> {
  const all = await sleeper.playersNfl()
  if (!all || Object.keys(all).length === 0) {
    throw new Error('Sleeper /players/nfl returned nothing — keeping the previous cache row')
  }
  const payload = project(all)
  const count = Object.keys(payload).length
  const storedBytes = Buffer.byteLength(JSON.stringify(payload))

  const db = createAdminClient()
  const { error } = await db.from('sleeper_players_cache').upsert(
    {
      id: 'nfl',
      fetched_at: new Date().toISOString(),
      player_count: count,
      payload: payload as unknown as Record<string, unknown>,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(`sleeper_players_cache write failed: ${error.message}`)
  return { fetched: count, storedBytes }
}

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
  // Derived from our cached row, not a live pull. Still wrapped in
  // unstable_cache below so the derivation itself isn't redone per request.
  const all = await getPlayersNflDict()
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

// ── Full dictionary ──────────────────────────────────────────────────────
//
// Read from sleeper_players_cache, NOT from Sleeper. Sleeper's docs ask that
// /players/nfl be called "once per day at most"; the only caller that still
// hits it is refreshSleeperPlayers() below, driven by a daily cron. Every
// request path reads the row this writes.
//
// Two layers of caching sit in front of the table:
//   • module memory, so a warm instance re-reads nothing
//   • the shared in-flight promise, so parallel valuations during one cold
//     start trigger a single DB read rather than one each
//
// The payload is still too big for unstable_cache's 2MB entry limit (which
// current Next treats as a HARD error mid-response, not a cache skip), which
// is why this stays hand-rolled instead of using the Next data cache.
const FULL_DICT_TTL_MS = 6 * 60 * 60 * 1000
let fullDict: { at: number; promise: Promise<Record<string, SleeperPlayer>> } | null = null

async function readDictFromCache(): Promise<Record<string, SleeperPlayer>> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('sleeper_players_cache')
    .select('payload')
    .eq('id', 'nfl')
    .maybeSingle()
  if (error) throw new Error(`sleeper_players_cache read failed: ${error.message}`)
  // Cold start before the cron has ever run: fall back to a live pull rather
  // than serving an empty dictionary, which would silently blank every name
  // on the Trade Desk and the value engine. Logged so it is visible if the
  // cron is broken, because this is the one path that can drift back into
  // calling Sleeper per instance.
  if (!data?.payload) {
    console.warn('[sleeperPlayers] cache row missing — falling back to a live /players/nfl pull')
    return (await sleeper.playersNfl()) ?? {}
  }
  return data.payload as Record<string, SleeperPlayer>
}

export function getPlayersNflDict(): Promise<Record<string, SleeperPlayer>> {
  const now = Date.now()
  if (fullDict && now - fullDict.at < FULL_DICT_TTL_MS) return fullDict.promise
  const promise = readDictFromCache()
  // Never cache a rejection — the next caller should retry.
  promise.catch(() => {
    if (fullDict?.promise === promise) fullDict = null
  })
  fullDict = { at: now, promise }
  return promise
}
