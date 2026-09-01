#!/usr/bin/env node
// What backups exist for this Supabase project, and how far back do they go?
//
// The service-role key cannot answer this: backups live in the Management API,
// not the database. That needs a Personal Access Token, which is a different
// credential. Create one at
//
//   https://supabase.com/dashboard/account/tokens
//
// then add it to .env.local as
//
//   SUPABASE_ACCESS_TOKEN=sbp_...
//
// and run: node scripts/supabase-backups.mjs
//
// Free projects have no daily backups and no point-in-time recovery, in which
// case this prints an empty list and that IS the answer.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const env = {}
for (const name of ['.env.local', '.env']) {
  const file = path.join(ROOT, name)
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq === -1 || line.trimStart().startsWith('#')) continue
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
}

const token = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error('Need SUPABASE_ACCESS_TOKEN (sbp_...) in .env.local. See the notes at the top of this file.')
  process.exit(1)
}

// Project ref is the subdomain of the project URL already in .env.local.
const ref = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!ref) {
  console.error('Could not read the project ref out of NEXT_PUBLIC_SUPABASE_URL.')
  process.exit(1)
}

const api = async (p) => {
  const res = await fetch(`https://api.supabase.com/v1${p}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${p} → ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

console.log(`project: ${ref}\n`)

const org = await api(`/projects`).then(
  (list) => list.find((p) => p.id === ref) ?? null,
).catch(() => null)
if (org) {
  console.log(`name:    ${org.name}`)
  console.log(`region:  ${org.region}`)
  console.log(`status:  ${org.status}`)
  const orgs = await api('/organizations').catch(() => [])
  const match = orgs.find?.((o) => o.id === org.organization_id)
  if (match) console.log(`org:     ${match.name} (plan on the billing page)`)
  console.log('')
}

const backups = await api(`/projects/${ref}/database/backups`)
const list = backups?.backups ?? []

console.log(`point-in-time recovery: ${backups?.pitr_enabled ? 'ENABLED' : 'not enabled'}`)
if (backups?.physical_backup_data?.earliest_physical_backup_date_utc) {
  console.log(`  earliest restore point: ${backups.physical_backup_data.earliest_physical_backup_date_utc}`)
  console.log(`  latest restore point:   ${backups.physical_backup_data.latest_physical_backup_date_utc}`)
}
console.log(`\ndaily backups on file: ${list.length}`)
for (const b of list) {
  console.log(`  ${b.inserted_at ?? b.created_at ?? '?'}  status=${b.status ?? '?'}`)
}

if (list.length === 0 && !backups?.pitr_enabled) {
  console.log('\nNo backups. On the free plan this is expected: nothing to restore from.')
} else {
  console.log('\nA backup from before 2026-08-30 23:26 ET (2026-08-31T03:26Z) would still hold')
  console.log("weekly-depression's 2021-2025 NFL matchups, drafts and lineups.")
}
