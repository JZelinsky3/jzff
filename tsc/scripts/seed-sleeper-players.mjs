#!/usr/bin/env node
// One-time seed for sleeper_players_cache.
//
//   node scripts/seed-sleeper-players.mjs
//
// Run this once after applying migration 0059, so the cache row exists before
// the daily cron first fires. Without it, getPlayersNflDict() falls back to a
// live /players/nfl pull on every cold start until 09:00 UTC.
//
// Mirrors the KEEP projection in src/lib/sleeperPlayers.ts. If you change the
// field list there, change it here too (or just let the cron overwrite this).

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !K) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const KEEP = [
  'player_id', 'full_name', 'first_name', 'last_name', 'position', 'team',
  'injury_status', 'injury_body_part', 'injury_notes', 'injury_start_date',
  'status', 'news_updated', 'years_exp', 'age', 'search_rank',
  'search_rank_pos', 'fantasy_positions',
  'espn_id', 'yahoo_id', 'gsis_id', 'fantasy_data_id', 'rotowire_id',
]

console.log('Fetching /players/nfl (this is the one sanctioned daily call)...')
const res = await fetch('https://api.sleeper.app/v1/players/nfl')
if (!res.ok) {
  console.error('Sleeper returned', res.status)
  process.exit(1)
}
const all = await res.json()
const count = Object.keys(all).length
if (count === 0) {
  console.error('Sleeper returned an empty dictionary. Not writing.')
  process.exit(1)
}

const payload = {}
for (const [id, p] of Object.entries(all)) {
  const slim = {}
  for (const k of KEEP) if (p[k] != null) slim[k] = p[k]
  payload[id] = slim
}

const rawMb = Buffer.byteLength(JSON.stringify(all)) / 1e6
const slimMb = Buffer.byteLength(JSON.stringify(payload)) / 1e6
console.log(`players: ${count}  raw: ${rawMb.toFixed(1)} MB  stored: ${slimMb.toFixed(1)} MB`)

const r = await fetch(`${U}/rest/v1/sleeper_players_cache?on_conflict=id`, {
  method: 'POST',
  headers: {
    apikey: K,
    Authorization: `Bearer ${K}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  },
  body: JSON.stringify({
    id: 'nfl',
    fetched_at: new Date().toISOString(),
    player_count: count,
    payload,
  }),
})
if (!r.ok) {
  console.error('Write failed:', r.status, await r.text())
  process.exit(1)
}
console.log('Seeded sleeper_players_cache.')
