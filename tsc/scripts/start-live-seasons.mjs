#!/usr/bin/env node
// Put every eligible 2026 league on the clock, so the weekly cron picks it
// up and the live pages resolve a week on their own.
//
//   cd ~/Desktop/jzff/tsc
//   node scripts/start-live-seasons.mjs            # dry run, prints the plan
//   node scripts/start-live-seasons.mjs --apply    # write it
//
// Three things have to line up before a league is actually "running", and
// flipping only the first is the usual mistake:
//
//   1. seasons.is_live on the 2026 row      — what the live pages read
//   2. seasons.settings.season_start_date   — what resolveCurrentWeek needs;
//        without it the pages render but every one of them says "no week"
//   3. league_sources.is_live on ONE source — what /api/cron/refresh iterates
//
// Eligibility, and why each test is here:
//   - the 2026 season has a real schedule (matchups rows). Roughly a third
//     of the 2026 season rows are `pre_draft` shells with zero games; those
//     get an empty live hub and an empty pick'ems slate.
//   - the source is Sleeper or ESPN. NFL.com was retired ahead of the 2026
//     season and the cron skips it outright; Yahoo's Fantasy API answers 403
//     for every endpoint, so a live Yahoo source just throws once a week.
//   - the league isn't UDFA-locked. The cron skips those anyway.
//
// Sources are also switched to walk_history = false. A live source only
// needs the current season; re-walking a decade of history every Tuesday is
// what pushes the cron into the function timeout.

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
    })
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
// Plain PostgREST over fetch rather than supabase-js: the client pulls in
// realtime, which refuses to load on Node < 22 without a `ws` shim.
const rest = async (path, init = {}) => {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${body}`)
  return { body, res }
}
const select = async (path) => JSON.parse((await rest(path)).body)
const patch = async (path, values) => {
  await rest(path, { method: 'PATCH', body: JSON.stringify(values) })
}
const countRows = async (path) => {
  const { res } = await rest(path, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact', Range: '0-0' },
  })
  return Number((res.headers.get('content-range') ?? '/0').split('/')[1]) || 0
}

const YEAR = 2026
// Week 1 kickoff. resolveCurrentWeek counts 7-day blocks from here, so this
// is the single knob that decides what week the whole site thinks it is.
const SEASON_START = '2026-09-09'
const LIVE_PLATFORMS = new Set(['sleeper', 'espn'])
const apply = process.argv.includes('--apply')

const [leagues, seasons, sources, subs, grants] = await Promise.all([
  select('leagues?select=id,slug,owner_id,created_at&order=created_at.asc&limit=5000'),
  select('seasons?select=id,league_id,year,is_live,settings&limit=20000'),
  select('league_sources?select=id,league_id,platform,external_id,is_live,walk_history&limit=5000'),
  select('subscriptions?select=user_id,status&limit=5000'),
  select('comp_grants?select=user_id,expires_at&limit=5000'),
])
const leagueById = new Map(leagues.map((l) => [l.id, l]))

// Mirror of resolveLeagueTier in lib/leagueTier.ts, which is what the cron
// actually consults. Deliberately NOT leagues.is_udfa: that column records
// the owner's plan on the day the league was created and nothing updates it,
// so it reads true for every trial-slot league even though the trial slot
// bypasses the UDFA locks. Trusting it here would skip nearly everything.
const compUsers = new Set([
  ...(env.LIFETIME_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ...grants
    .filter((g) => !g.expires_at || new Date(g.expires_at).getTime() > Date.now())
    .map((g) => g.user_id),
])
const activeSub = new Set(
  subs.filter((s) => s.status === 'active' || s.status === 'trialing').map((s) => s.user_id)
)
const firstLeagueOf = new Map()
for (const l of leagues) {
  if (l.owner_id && !firstLeagueOf.has(l.owner_id)) firstLeagueOf.set(l.owner_id, l.id)
}
const tierOf = (l) => {
  if (!l.owner_id) return 'paid'
  if (compUsers.has(l.owner_id)) return 'comp'
  if (firstLeagueOf.get(l.owner_id) === l.id) return 'test' // the free trial slot
  return activeSub.has(l.owner_id) ? 'paid' : 'udfa'
}

const plan = []
const skipped = []
for (const season of seasons.filter((s) => s.year === YEAR)) {
  const league = leagueById.get(season.league_id)
  if (!league) continue
  const note = (reason) => skipped.push({ slug: league.slug, reason })

  const tier = tierOf(league)
  if (tier === 'udfa') { note('UDFA — the cron skips it'); continue }

  const count = await countRows(`matchups?season_id=eq.${season.id}&select=id`)
  if (!count) { note('no 2026 schedule yet (undrafted)'); continue }

  const mine = sources.filter((s) => s.league_id === league.id)
  // Keep an already-chosen live source if it's on a platform that still
  // works; otherwise take the first Sleeper/ESPN one.
  const current = mine.find((s) => s.is_live && LIVE_PLATFORMS.has(s.platform))
  const source = current ?? mine.find((s) => LIVE_PLATFORMS.has(s.platform))
  if (!source) {
    note(`no Sleeper/ESPN source (has: ${mine.map((s) => s.platform).join(', ') || 'none'})`)
    continue
  }

  const settings = { ...(season.settings ?? {}) }
  plan.push({
    slug: league.slug,
    tier,
    seasonId: season.id,
    leagueId: league.id,
    source,
    games: count,
    alreadyLive: season.is_live,
    hadStartDate: !!settings.season_start_date,
    settings: { ...settings, season_start_date: settings.season_start_date ?? SEASON_START },
  })
}

console.log(`\n${apply ? 'APPLYING' : 'DRY RUN'} — ${YEAR} season, week 1 = ${SEASON_START}\n`)
for (const p of plan) {
  const bits = [
    p.alreadyLive ? 'season already live' : 'season -> live',
    p.hadStartDate ? 'start date kept' : `start date -> ${SEASON_START}`,
    p.source.is_live ? `source ${p.source.platform} already live` : `source -> ${p.source.platform}:${p.source.external_id}`,
    p.source.walk_history ? 'walk_history -> false' : null,
  ].filter(Boolean)
  console.log(`  ${p.slug.padEnd(42)} ${p.tier.padEnd(5)} ${String(p.games).padStart(3)} games   ${bits.join(' · ')}`)
}
console.log(`\n  ${plan.length} league${plan.length === 1 ? '' : 's'} to start\n`)
if (skipped.length > 0) {
  console.log('  skipped:')
  for (const s of skipped) console.log(`    ${s.slug.padEnd(42)} ${s.reason}`)
  console.log()
}

if (!apply) {
  console.log('  Re-run with --apply to write.\n')
  process.exit(0)
}

for (const p of plan) {
  try {
    // One live season and one live source per league — clear, then set.
    await patch(`seasons?league_id=eq.${p.leagueId}`, { is_live: false })
    await patch(`seasons?id=eq.${p.seasonId}`, { is_live: true, settings: p.settings })
    await patch(`league_sources?league_id=eq.${p.leagueId}`, { is_live: false })
    await patch(`league_sources?id=eq.${p.source.id}`, { is_live: true, walk_history: false })
    console.log(`  ${p.slug}: started`)
  } catch (err) {
    console.log(`  ${p.slug}: FAILED — ${err.message}`)
  }
}
console.log('\nDone. Trigger /api/cron/refresh once to backfill before Tuesday.\n')
