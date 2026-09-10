#!/usr/bin/env node
// What actually happens when the free preview window closes?
//
// Mirrors resolveLeagueTier (src/lib/leagueTier.ts) against live data and
// prints each league's tier BEFORE and AFTER the flip, so the blast radius
// is a number you looked at rather than one you assumed. Read-only — it
// writes nothing and touches no Stripe.
//
//   cd ~/Desktop/jzff/tsc
//   node scripts/preview-launch-impact.mjs
//   node scripts/preview-launch-impact.mjs --emails   # owner addresses to notify
//
// The rule being mirrored, in order:
//   comp grant / lifetime  → 'comp'  (never locks)
//   owner's earliest league AND preview window open → 'test'
//   active or trialing subscription → 'paid'
//   otherwise → 'udfa'  (locked chapters, data intact)

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
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const BASE = env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1'
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const q = async (path) => {
  const r = await fetch(`${BASE}/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`)
  return r.json()
}

const wantEmails = process.argv.includes('--emails')

const [leagues, subs, comps] = await Promise.all([
  q('leagues?select=id,slug,name,owner_id,created_at,published_at,grace_period_ends_at&order=created_at'),
  q('subscriptions?select=user_id,tier,status'),
  q('comp_grants?select=user_id').catch(() => []),
])

// LIFETIME_USER_IDS is an env allowlist, not a table — isCompUser checks
// both, so this has to as well or comped accounts read as UDFA here.
const lifetime = new Set((env.LIFETIME_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean))
const compSet = new Set([...comps.map((c) => c.user_id), ...lifetime])
const paidSet = new Set(subs.filter((s) => s.status === 'active' || s.status === 'trialing').map((s) => s.user_id))

// Group by owner so "earliest league" is decided the same way the app does.
const byOwner = new Map()
for (const l of leagues) {
  const key = l.owner_id ?? 'none'
  if (!byOwner.has(key)) byOwner.set(key, [])
  byOwner.get(key).push(l)
}

const tierOf = (league, owner, index, previewOpen) => {
  if (!owner || owner === 'none') return 'paid'
  if (compSet.has(owner)) return 'comp'
  if (previewOpen && index === 0) return 'test'
  return paidSet.has(owner) ? 'paid' : 'udfa'
}

const before = {}
const after = {}
const flipping = []

for (const [owner, owned] of byOwner) {
  const sorted = owned.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  sorted.forEach((l, i) => {
    const b = tierOf(l, owner, i, true)
    const a = tierOf(l, owner, i, false)
    before[b] = (before[b] ?? 0) + 1
    after[a] = (after[a] ?? 0) + 1
    if (b !== a) flipping.push({ ...l, from: b, to: a, owner })
  })
}

const fmt = (o) => Object.entries(o).sort().map(([k, v]) => `${k}:${v}`).join('  ')
console.log(`\nLeagues: ${leagues.length}   owners: ${byOwner.size}`)
console.log(`Before the flip   ${fmt(before)}`)
console.log(`After the flip    ${fmt(after)}`)
console.log(`\n${flipping.length} league${flipping.length === 1 ? '' : 's'} change tier:\n`)
for (const l of flipping) {
  const pub = l.published_at ? 'published' : 'unpublished'
  console.log(`  ${l.from} → ${l.to}   ${String(l.name).slice(0, 34).padEnd(34)} /${l.slug}  (${pub})`)
}

// A league already carrying a deletion date is a separate problem from the
// tier flip, and one worth seeing on the same screen — those are scheduled
// to be wiped and are already out of the minigame pools.
const graced = leagues.filter((l) => l.grace_period_ends_at)
if (graced.length) {
  console.log(`\n⚠ ${graced.length} league(s) already carry a deletion date (grace_period_ends_at):`)
  for (const l of graced) console.log(`    /${l.slug} → ${l.grace_period_ends_at}`)
}

if (wantEmails) {
  // Owners losing something on flip day. These are the people the launch
  // email actually has to reach, as opposed to every account on file.
  //
  // Addresses come from auth.users, not `profiles` — the profile row the
  // signup trigger writes carries a created_at and no email.
  const owners = new Set(flipping.map((l) => l.owner))
  const emailById = {}
  for (let page = 1; ; page++) {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    })
    const body = await r.json()
    const users = body.users ?? []
    for (const u of users) if (owners.has(u.id)) emailById[u.id] = u.email
    if (users.length < 200) break
  }
  console.log(`\nOwners affected (${owners.size}):`)
  for (const o of owners) console.log(`  ${emailById[o] ?? `(no address on file: ${o})`}`)
}

console.log()
