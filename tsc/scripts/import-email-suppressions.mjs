#!/usr/bin/env node
// Carry Resend's unsubscribes over to the site before the first recap goes
// out.
//
// People who clicked unsubscribe on the August or September broadcast are
// recorded in Resend's audience, not in our database, so the recap job has
// no idea they asked to be left alone. This reads a Resend contacts export
// and adds every unsubscribed address to email_suppressions (reason
// 'imported'), which the recap job checks before every send.
//
// Either hand it Resend's contacts export (CSV with "email" and
// "unsubscribed" columns), or, when there are only a few, type them in:
//
//   cd ~/Desktop/jzff/tsc
//   node scripts/import-email-suppressions.mjs ~/Downloads/contacts.csv          # dry run
//   node scripts/import-email-suppressions.mjs ~/Downloads/contacts.csv --apply  # write
//   node scripts/import-email-suppressions.mjs --emails a@x.com,b@y.com --apply
//
// Safe to run twice: an address already on the list keeps its existing
// reason. Needs migration 0070_weekly_recaps.sql applied.

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

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const listAt = args.indexOf('--emails')
const typed = listAt >= 0 ? (args[listAt + 1] ?? '') : null
const file = typed === null ? args[0] : null
if (typed === null && (!file || file.startsWith('--'))) {
  console.error('Usage: node scripts/import-email-suppressions.mjs <resend-contacts.csv> [--apply]')
  console.error('   or: node scripts/import-email-suppressions.mjs --emails a@x.com,b@y.com [--apply]')
  process.exit(1)
}

// Minimal CSV: handles quoted fields and commas inside quotes, which is all a
// contacts export contains.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

function fromCsv(path) {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8'))
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name)
  const emailCol = col('email')
  const unsubCol = col('unsubscribed')
  if (emailCol < 0 || unsubCol < 0) {
    console.error(`Expected "email" and "unsubscribed" columns, found: ${header.join(', ')}`)
    process.exit(1)
  }
  const picked = rows
    .filter((r) => /^(true|yes|1)$/i.test((r[unsubCol] ?? '').trim()))
    .map((r) => r[emailCol] ?? '')
  console.log(`${rows.length} contacts in the export, ${picked.length} unsubscribed.`)
  return picked
}

const emails = [
  ...new Set(
    (typed !== null ? typed.split(',') : fromCsv(file))
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@')),
  ),
]

for (const e of emails) console.log(`  ${e}`)
if (!apply) {
  console.log('\nDry run. Re-run with --apply to add these to email_suppressions.')
  process.exit(0)
}
if (!emails.length) process.exit(0)

const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/email_suppressions?on_conflict=email`, {
  method: 'POST',
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    // Keep an existing row (a bounce or complaint says more than this does).
    Prefer: 'resolution=ignore-duplicates,return=minimal',
  },
  body: JSON.stringify(emails.map((email) => ({ email, reason: 'imported' }))),
})
if (!res.ok) {
  console.error(`Insert failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
console.log(`\nAdded ${emails.length} address${emails.length === 1 ? '' : 'es'} to email_suppressions.`)
