#!/usr/bin/env node
// Set a 3-month grace_period_ends_at on every league marked
// created_during_testing that doesn't already have one. Run this AFTER
// removing/expiring TESTING_MODE_UNTIL in Vercel.
//
//   cd ~/Desktop/jzff/tsc
//   node scripts/end-testing-session.mjs
//
// After this runs, testing leagues are on the same delete pipeline as
// lapsed-subscription leagues. scripts/wipe-expired-leagues.mjs cleans
// them up after 3 months pass.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createInterface } from 'readline'

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

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: testingLeagues, error } = await db
  .from('leagues')
  .select('id, name, slug, owner_id, grace_period_ends_at')
  .eq('is_udfa', true)

if (error) { console.error(error.message); process.exit(1) }

const needsGrace = (testingLeagues ?? []).filter((l) => !l.grace_period_ends_at)
if (needsGrace.length === 0) {
  console.log('No testing leagues need a grace period set. Nothing to do.')
  process.exit(0)
}

const graceEnds = new Date()
graceEnds.setMonth(graceEnds.getMonth() + 3)

console.log(`\nFound ${needsGrace.length} testing league${needsGrace.length === 1 ? '' : 's'} without grace set:\n`)
for (const l of needsGrace) console.log(`  • ${l.name} (${l.slug})`)
console.log(`\nWill set grace_period_ends_at = ${graceEnds.toISOString()} (3 months out).`)

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ans = await new Promise((r) => rl.question('\nType YES to apply: ', r))
rl.close()
if (ans.trim() !== 'YES') { console.log('Aborted.'); process.exit(0) }

const ids = needsGrace.map((l) => l.id)
const { error: upErr } = await db
  .from('leagues')
  .update({ grace_period_ends_at: graceEnds.toISOString() })
  .in('id', ids)
if (upErr) { console.error(upErr.message); process.exit(1) }

console.log(`\nSet grace period on ${ids.length} league${ids.length === 1 ? '' : 's'}.`)
console.log('Notify your test users — they have 3 months to subscribe before deletion.')
