#!/usr/bin/env node
// Wipe leagues whose grace_period_ends_at has passed.
//
// Run manually whenever you want to reap (no cron yet):
//   cd ~/Desktop/jzff/tsc
//   node scripts/wipe-expired-leagues.mjs
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local (so it can
// bypass RLS the same way the server does). Dry-runs first — prints what
// would be deleted, asks for confirmation, then actually deletes.
//
// Postgres `on delete cascade` on every league-scoped table means deleting
// the leagues row cleans up seasons, matchups, managers, drafts, sources,
// rivalries, manager_seasons, pickems, etc. automatically.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createInterface } from 'readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

const nowIso = new Date().toISOString()
const { data: expired, error } = await db
  .from('leagues')
  .select('id, name, slug, owner_id, grace_period_ends_at')
  .lt('grace_period_ends_at', nowIso)
  .not('grace_period_ends_at', 'is', null)

if (error) {
  console.error('Query failed:', error.message)
  process.exit(1)
}

if (!expired || expired.length === 0) {
  console.log('No expired leagues. Nothing to delete.')
  process.exit(0)
}

console.log(`\nFound ${expired.length} expired league${expired.length === 1 ? '' : 's'}:\n`)
for (const l of expired) {
  console.log(`  • ${l.name} (${l.slug}) — grace ended ${l.grace_period_ends_at}`)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = await new Promise((resolve) =>
  rl.question('\nType DELETE to wipe these leagues + all their data (cascades): ', resolve)
)
rl.close()

if (answer.trim() !== 'DELETE') {
  console.log('Aborted.')
  process.exit(0)
}

const ids = expired.map((l) => l.id)
const { error: delErr } = await db.from('leagues').delete().in('id', ids)
if (delErr) {
  console.error('Delete failed:', delErr.message)
  process.exit(1)
}

console.log(`\nDeleted ${ids.length} league${ids.length === 1 ? '' : 's'}.`)
