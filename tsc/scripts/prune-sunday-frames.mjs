#!/usr/bin/env node
// Prune Sunday Live frames.
//
//   node scripts/prune-sunday-frames.mjs            # dry run, prints only
//   node scripts/prune-sunday-frames.mjs --apply    # actually deletes
//
// Why this exists: loadSundayLive() persists a frame on EVERY page load of a
// Sunday Live week (debounced to 1/min), including weeks that finished a year
// ago. Payloads run ~100 KB each, so a page left open -- or a week reloaded
// during development -- accrues ~6 MB an hour against one league.
//
// Keeps the newest frame per (league_id, year, week), which is what the
// Sunday Live Archive permalink reads. What is lost is intra-week history:
// the WP sparkline and Big Moments diffing for already-finished weeks.
// Nothing reconstructs a live week after the fact anyway.

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
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const APPLY = process.argv.includes('--apply')

// Metadata only -- pulling payloads here would defeat the purpose.
let frames = []
for (let from = 0; ; from += 1000) {
  const r = await fetch(
    `${U}/rest/v1/sunday_live_frames?select=id,league_id,year,week,taken_at&order=taken_at.asc`,
    { headers: { ...H, Range: `${from}-${from + 999}` } }
  )
  const page = await r.json()
  if (!Array.isArray(page) || page.length === 0) break
  frames = frames.concat(page)
  if (page.length < 1000) break
}

if (frames.length === 0) {
  console.log('No frames. Nothing to do.')
  process.exit(0)
}

// Newest frame per (league, year, week) survives.
const keep = new Map()
for (const f of frames) {
  const k = `${f.league_id}|${f.year}|${f.week}`
  const cur = keep.get(k)
  if (!cur || Date.parse(f.taken_at) > Date.parse(cur.taken_at)) keep.set(k, f)
}
const keepIds = new Set([...keep.values()].map((f) => f.id))
const doomed = frames.filter((f) => !keepIds.has(f.id))

const AVG_BYTES = 100_000
console.log(`frames total       : ${frames.length}`)
console.log(`distinct week-slots: ${keep.size}  (kept)`)
console.log(`to delete          : ${doomed.length}  (~${(doomed.length * AVG_BYTES / 1e6).toFixed(0)} MB uncompressed)`)

const byLeague = {}
for (const f of doomed) byLeague[f.league_id] = (byLeague[f.league_id] || 0) + 1
console.log('\nby league:')
for (const [id, n] of Object.entries(byLeague).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${id}  ${n}`)
}

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to delete.')
  process.exit(0)
}

// Chunked so the URL stays under any proxy limit.
let done = 0
for (let i = 0; i < doomed.length; i += 100) {
  const ids = doomed.slice(i, i + 100).map((f) => f.id)
  const r = await fetch(`${U}/rest/v1/sunday_live_frames?id=in.(${ids.join(',')})`, {
    method: 'DELETE',
    headers: H,
  })
  if (!r.ok) {
    console.error('Delete failed:', r.status, await r.text())
    process.exit(1)
  }
  done += ids.length
  process.stdout.write(`\rdeleted ${done}/${doomed.length}`)
}
console.log('\nDone. Run VACUUM FULL sunday_live_frames; in the SQL editor to return the disk.')
