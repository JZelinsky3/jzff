#!/usr/bin/env node
// One-shot: import the hand-curated 2019 draft from the legacy pams JSON
// into the Nubbs/Lubbs league. The 2019 NFL.com draft was a mess (the
// commissioner couldn't restore the real picks), so a manual reconstruction
// was authored in /public/old/pams/data/drafts/2019.json. This script
// replaces whatever Sleeper / NFL ingest landed for the 2019 season on the
// target league with the curated version.
//
// Usage:
//   node scripts/import-nubbs-2019-draft.mjs <league-slug>
//
// Example:
//   node scripts/import-nubbs-2019-draft.mjs lubbs
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
// Matches manager rows by external_id == String(pick.user_id) — i.e. the
// NFL.com user id — so only works on a league that has an NFL.com source
// (or whose Sleeper managers happen to carry NFL.com user ids on the row,
// which doesn't happen automatically). The script prints every pick it
// inserts so you can sanity-check the team→player mapping.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env.local')
let envText
try {
  envText = readFileSync(envPath, 'utf8')
} catch {
  console.error(`Could not read ${envPath} — run this from your project root.`)
  process.exit(1)
}

const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (!m) continue
  let val = m[2].trim()
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
  env[m[1]] = val
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local')
  process.exit(1)
}

const [slug] = process.argv.slice(2)
if (!slug) {
  console.error('Usage: node scripts/import-nubbs-2019-draft.mjs <league-slug>')
  process.exit(1)
}

const draftPath = resolve(process.cwd(), 'public/old/pams/data/drafts/2019.json')
const draft = JSON.parse(readFileSync(draftPath, 'utf8'))
if (!Array.isArray(draft?.picks) || draft.picks.length === 0) {
  console.error(`No picks in ${draftPath}`)
  process.exit(1)
}

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function pgrest(method, path, body) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const init = { method, headers: { ...headers, Prefer: 'return=representation' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await fetch(url, init)
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : null
}

// 1. Resolve league by slug.
const leagues = await pgrest('GET', `leagues?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug`)
if (!leagues?.length) {
  console.error(`No league found with slug "${slug}".`)
  process.exit(1)
}
const league = leagues[0]
console.log(`League: ${league.name} (${league.id})`)

// 2. Resolve the 2019 season for this league.
const seasons = await pgrest(
  'GET',
  `seasons?league_id=eq.${league.id}&year=eq.2019&select=id,year,external_id`
)
if (!seasons?.length) {
  console.error(`No 2019 season exists for league ${slug}. Run a sync first so the season row is created, then re-run this import.`)
  process.exit(1)
}
const season = seasons[0]
console.log(`Season 2019: ${season.id} (external_id=${season.external_id})`)

// 3. Resolve managers — we'll match on external_id == String(pick.user_id).
const managers = await pgrest(
  'GET',
  `managers?league_id=eq.${league.id}&select=id,external_id,display_name`
)
if (!managers?.length) {
  console.error(`No managers found for league ${slug}.`)
  process.exit(1)
}
const managerByUserId = new Map()
for (const m of managers) {
  if (m.external_id) managerByUserId.set(String(m.external_id), m)
}

// 4. Resolve a pick's manager (and surface any user_ids the import can't map).
const unmapped = new Set()
for (const p of draft.picks) {
  const uid = String(p.user_id)
  if (!managerByUserId.has(uid)) unmapped.add(`${uid} (${p.manager_name})`)
}
if (unmapped.size > 0) {
  console.error('\nCannot map these user_ids in the curated draft to any manager row for the target league:')
  for (const u of unmapped) console.error(`  · ${u}`)
  console.error(`\nMake sure the league has an NFL.com source synced so the manager external_ids match.`)
  process.exit(1)
}

// 5. Replace existing 2019 drafts (cascades to draft_picks).
const existing = await pgrest('GET', `drafts?season_id=eq.${season.id}&select=id,external_id`)
if (existing?.length) {
  console.log(`Deleting ${existing.length} existing draft row(s) for the season (cascades to draft_picks)…`)
  await pgrest('DELETE', `drafts?season_id=eq.${season.id}`)
}

// 6. Insert the new draft row.
const draftRow = await pgrest('POST', 'drafts', {
  season_id: season.id,
  external_id: 'curated-2019',
  draft_type: 'snake',
  rounds: Math.max(...draft.picks.map((p) => p.round)),
})
const draftId = draftRow[0].id
console.log(`Created draft ${draftId}`)

// 7. Bulk-insert picks.
const rows = draft.picks.map((p) => ({
  draft_id: draftId,
  round: p.round,
  pick: p.overall_pick,
  manager_id: managerByUserId.get(String(p.user_id)).id,
  player_name: p.player_name,
  position: p.position ?? null,
  nfl_team: p.nfl_team ?? null,
  player_external_id: p.player_id ? String(p.player_id) : null,
}))
const inserted = await pgrest('POST', 'draft_picks', rows)
console.log(`Inserted ${inserted.length} picks.`)

// 8. Print a quick summary so you can eyeball the result.
const byRound = new Map()
for (const p of draft.picks) {
  if (!byRound.has(p.round)) byRound.set(p.round, [])
  byRound.get(p.round).push(p)
}
for (const round of [...byRound.keys()].sort((a, b) => a - b)) {
  const picks = byRound.get(round).sort((a, b) => a.round_pick - b.round_pick)
  console.log(`\nRound ${round}:`)
  for (const p of picks) {
    console.log(`  ${p.overall_pick.toString().padStart(3)}. ${(p.manager_name || '?').padEnd(10)} → ${p.player_name} (${p.position}-${p.nfl_team})`)
  }
}

console.log(`\nDone. The Drafts page for ${league.slug}/2019 should now show the curated picks.`)
