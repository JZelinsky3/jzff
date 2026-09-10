#!/usr/bin/env node
// ⚠️  THIS IS NOT THE GO-LIVE SCRIPT. Do not run it to end the free period.
//
// Ending the free period is a config change, not a data change: set
// TRIAL_SLOT_ENDS_AT in Vercel and the trial slot expires on its own (see
// trialSlotActive in src/lib/stripe.ts and resolveLeagueTier in
// src/lib/leagueTier.ts). Nothing in the database has to move, and no
// league has to be re-synced.
//
// What THIS script does is schedule DELETION. It stamps a 3-month
// grace_period_ends_at on every is_udfa league, which puts them on the same
// pipeline as lapsed-subscription leagues — scripts/wipe-expired-leagues.mjs
// permanently removes them once the date passes. Two reasons that is almost
// never what you want:
//
//   1. It contradicts the promise made at launch, which was that free
//      leagues keep their data and simply lose the paid chapters.
//   2. grace_period_ends_at also drops a league out of the minigame pools,
//      so stamping the whole free tier would gut the site-wide wheel.
//
// It also selects on `is_udfa`, a flag stamped at CREATION time, which is
// not the same set as the leagues that resolve to the UDFA tier today.
//
// If you genuinely mean to schedule deletions, pass --i-mean-it.
//
//   cd ~/Desktop/jzff/tsc
//   node scripts/end-testing-session.mjs --i-mean-it

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

if (!process.argv.includes('--i-mean-it')) {
  console.error(
    '\nThis script SCHEDULES DELETION of every free-tier league.\n\n' +
      'It is not how the free period ends — that is TRIAL_SLOT_ENDS_AT in Vercel,\n' +
      'which needs no database change at all. Read the header of this file.\n\n' +
      'If you really want to set deletion dates, re-run with --i-mean-it.\n',
  )
  process.exit(1)
}

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
