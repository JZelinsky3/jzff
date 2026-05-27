// Player values — global, source-pluggable, refreshed by cron.
//
// Phase 3 ships with one source: Sleeper. Sleeper exposes a `search_rank`
// in /players/nfl that correlates with consensus rest-of-season value
// (lower = more valuable). It's not true ADP but it's free, refreshed
// often, and we already pull this dictionary during ingest.
//
// The grader reads values via getValuesForPlayerIds() at grade time; the
// refresh job here populates the player_values table.

import { createAdminClient } from '@/lib/supabase/admin'
import { sleeper, type SleeperPlayer } from '@/lib/platforms/sleeper'

export type PlayerValue = {
  player_id: string
  source: string
  overall_rank: number | null
  position_rank: number | null
  position: string | null
  team: string | null
  age: number | null
  years_exp: number | null
  injury_status: string | null
  full_name: string | null
  updated_at: string
}

// Fantasy-relevant positions only. Sleeper's `fantasy_positions` array
// includes things like 'WR/RB' for flex eligibility; we use the primary
// `position` field to keep the position ranks clean.
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

// Refresh all player values from Sleeper. Idempotent: re-running upserts
// every row. Returns counts + warnings.
export async function refreshSleeperPlayerValues(): Promise<{
  fetched: number
  upserted: number
  warnings: string[]
}> {
  const warnings: string[] = []
  const db = createAdminClient()

  const players = await sleeper.playersNfl()
  if (!players) {
    return { fetched: 0, upserted: 0, warnings: ['sleeper /players/nfl returned nothing'] }
  }

  // Sleeper's dict is ~10k entries including retired/practice-squad players.
  // Filter to fantasy-relevant positions with a search_rank — that drops the
  // tail aggressively. Cap at a reasonable number to keep the table small
  // and the upsert fast.
  const candidates: SleeperPlayer[] = []
  for (const [, p] of Object.entries(players)) {
    if (!p?.position) continue
    if (!POSITIONS.includes(p.position)) continue
    candidates.push(p)
  }

  // Derive position rank: sort each position by search_rank ascending (Sleeper
  // uses `search_rank` as a popularity-derived score; lower = more valuable).
  // Missing search_rank goes to the end.
  type WithSearchRank = SleeperPlayer & { search_rank?: number | null }
  const byPosition = new Map<string, WithSearchRank[]>()
  for (const p of candidates as WithSearchRank[]) {
    const pos = p.position ?? 'UNK'
    const arr = byPosition.get(pos) ?? []
    arr.push(p)
    byPosition.set(pos, arr)
  }
  const posRankByPlayer = new Map<string, number>()
  for (const [, arr] of byPosition) {
    arr.sort((a, b) => {
      const ar = a.search_rank ?? Number.MAX_SAFE_INTEGER
      const br = b.search_rank ?? Number.MAX_SAFE_INTEGER
      return ar - br
    })
    arr.forEach((p, idx) => {
      posRankByPlayer.set(p.player_id, idx + 1)
    })
  }

  // Build the rows. We only persist players with a search_rank — the rest
  // are deep waiver wire / retired and would just bloat the table.
  type SleeperFull = SleeperPlayer & {
    search_rank?: number | null
    age?: number | null
    years_exp?: number | null
    injury_status?: string | null
  }
  const now = new Date().toISOString()
  const rows: PlayerValue[] = []
  for (const p of candidates as SleeperFull[]) {
    if (p.search_rank == null) continue
    rows.push({
      player_id: p.player_id,
      source: 'sleeper',
      overall_rank: p.search_rank,
      position_rank: posRankByPlayer.get(p.player_id) ?? null,
      position: p.position ?? null,
      team: p.team ?? null,
      age: p.age ?? null,
      years_exp: p.years_exp ?? null,
      injury_status: p.injury_status ?? null,
      full_name: p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(' ') ?? null,
      updated_at: now,
    })
  }

  // Upsert in chunks. Supabase has a request-size limit; ~500/chunk fits
  // well under typical caps and is fast enough for ~3-5k players.
  const CHUNK = 500
  let upserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await db.from('player_values').upsert(slice, {
      onConflict: 'player_id,source',
    })
    if (error) {
      warnings.push(`upsert chunk ${i}-${i + slice.length}: ${error.message}`)
      continue
    }
    upserted += slice.length
  }

  return { fetched: candidates.length, upserted, warnings }
}

// Load values for a list of Sleeper player_ids. Returns a Map keyed by
// player_id. Players with no row in the table (deep waiver, missing search
// rank) are simply absent — caller should treat absence as "no value data".
export async function getSleeperValuesForPlayerIds(
  playerIds: string[],
): Promise<Map<string, PlayerValue>> {
  if (playerIds.length === 0) return new Map()
  const db = createAdminClient()
  const { data } = await db
    .from('player_values')
    .select('player_id, source, overall_rank, position_rank, position, team, age, years_exp, injury_status, full_name, updated_at')
    .eq('source', 'sleeper')
    .in('player_id', playerIds)
  const map = new Map<string, PlayerValue>()
  for (const r of data ?? []) {
    map.set(r.player_id, r as PlayerValue)
  }
  return map
}
