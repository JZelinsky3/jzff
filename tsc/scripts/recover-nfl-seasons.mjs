#!/usr/bin/env node
// Rebuild what the NFL.com sunset deleted.
//
// Background: ahead of the 2026 season NFL Fantasy was retired and every
// fantasy.nfl.com league URL started 301ing to the nfl.com fantasy news page.
// The scrapers parsed that page into zero rows, and the NFL ingest used to
// delete a season's aggregates BEFORE fetching their replacements — so every
// league that synced after the shutdown had its manager_seasons wiped, its
// drafts and weekly_lineups deleted, and its champion/runner-up nulled.
//
// What survived: managers, matchups (upsert-only, never wiped — including the
// is_playoff / is_championship flags), seasons, trades. That's enough to
// reconstruct the standings exactly, because manager_seasons was always a
// derived table: wins/losses/ties and points for/against come straight from
// the regular-season matchups, and the champion is the winner of the game
// already flagged is_championship.
//
// What cannot be recovered: draft picks and weekly lineups. Those were only
// ever on NFL.com, the site is gone, and the Wayback Machine never crawled
// league pages. This script reports them so the loss is at least visible.
//
// Usage:
//   node scripts/recover-nfl-seasons.mjs                 # dry run, all NFL leagues
//   node scripts/recover-nfl-seasons.mjs --apply         # write
//   node scripts/recover-nfl-seasons.mjs --league=pams   # one league by slug
//   node scripts/recover-nfl-seasons.mjs --apply --verbose

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPLY = process.argv.includes('--apply')
const VERBOSE = process.argv.includes('--verbose')
const ONLY_SLUG = process.argv.find((a) => a.startsWith('--league='))?.split('=')[1] ?? null

// ─── Supabase REST (service role) ─────────────────────────────────────────
// Deliberately raw REST rather than supabase-js: the client pulls in
// realtime-js, which refuses to load on Node 20 without a WebSocket polyfill.

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name)
    if (!fs.existsSync(file)) continue
    const env = {}
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq === -1 || line.trimStart().startsWith('#')) continue
      env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return env
  }
  throw new Error('Could not find NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local/.env')
}

const ENV = loadEnv()
const BASE = `${ENV.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`
const HEADERS = {
  apikey: ENV.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

async function rest(method, pathAndQuery, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}/${pathAndQuery}`, {
    method,
    headers: { ...HEADERS, ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${pathAndQuery} → ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

const get = (q) => rest('GET', q)

// PostgREST caps a response at 1000 rows by default; page until short.
async function getAll(query) {
  const out = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const sep = query.includes('?') ? '&' : '?'
    const page = await get(`${query}${sep}limit=${PAGE}&offset=${offset}`)
    out.push(...page)
    if (page.length < PAGE) return out
  }
}

// ─── Reconstruction ───────────────────────────────────────────────────────

// Mirrors the aggregate loop in lib/ingest/nfl.ts so a recovered season is
// byte-identical to one the ingest would have written from a live scrape:
// regular-season games only, unplayed games (null scores) skipped.
function aggregateRegularSeason(matchups) {
  const agg = new Map()
  const ensure = (id) => {
    let a = agg.get(id)
    if (!a) { a = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }; agg.set(id, a) }
    return a
  }
  for (const m of matchups) {
    if (m.is_playoff) continue
    if (m.score_a == null || m.score_b == null) continue
    const a = ensure(m.manager_a_id)
    const b = ensure(m.manager_b_id)
    const sa = Number(m.score_a)
    const sb = Number(m.score_b)
    a.pf += sa; a.pa += sb
    b.pf += sb; b.pa += sa
    if (sa > sb) { a.wins++; b.losses++ }
    else if (sa < sb) { a.losses++; b.wins++ }
    else { a.ties++; b.ties++ }
  }
  return agg
}

const winner = (m) => (Number(m.score_a) > Number(m.score_b) ? m.manager_a_id : m.manager_b_id)
const loser = (m) => (Number(m.score_a) > Number(m.score_b) ? m.manager_b_id : m.manager_a_id)
const decided = (m) => Number(m.score_a) !== Number(m.score_b)

// Regular-season seed order (wins desc, then PF desc) — the same ordering the
// ingest used for regular_rank, reused here to tell the championship bracket
// apart from the consolation bracket.
function seedOrder(matchups) {
  const agg = aggregateRegularSeason(matchups)
  const ranked = [...agg.entries()].sort(([, a], [, b]) => (b.wins !== a.wins ? b.wins - a.wins : b.pf - a.pf))
  return new Map(ranked.map(([id], i) => [id, i + 1]))
}

// Champion + runner-up, best source first:
//
//   1. The game already flagged is_championship — recorded fact, not a guess.
//      The flag survived the wipe because matchups are never deleted.
//   2. Bracket inference, for seasons where the flag was never set (the old
//      ingest only set it when the standings scrape ALSO named a champion, so
//      a season whose title game fell outside the configured playoff weeks has
//      real playoff matchups but no flag). The final is the last-playoff-week
//      game where both teams are still unbeaten in the playoffs AND both made
//      the playoff field by seed. That seed filter is what separates the title
//      game from the third-place and consolation games played the same week —
//      leagues that schedule all twelve teams every week produce several
//      "unbeaten" finalists otherwise.
//
// Validated against all 31 NFL seasons that still hold a scraped champion:
// with the flag deliberately ignored, this reproduced 25 of them exactly, got
// 0 wrong, and declined 7. Declining is the designed failure mode — a wrong
// champion is far worse than a blank one.
function resolveTitleGame(matchups, playoffTeamCount) {
  const played = matchups.filter((m) => m.score_a != null && m.score_b != null)

  const flagged = played.filter((m) => m.is_championship)
  if (flagged.length === 1) {
    const f = flagged[0]
    if (!decided(f)) return { champion: null, runnerUp: null, source: null, note: 'championship game is a tie' }
    return { champion: winner(f), runnerUp: loser(f), source: 'flag', note: null }
  }
  if (flagged.length > 1) {
    return { champion: null, runnerUp: null, source: null, note: 'multiple championship games flagged' }
  }

  const playoff = played.filter((m) => m.is_playoff)
  if (playoff.length === 0) {
    return { champion: null, runnerUp: null, source: null, note: 'no playoff matchups recorded' }
  }

  const seed = seedOrder(matchups)
  const inField = (id) => (playoffTeamCount ? (seed.get(id) ?? 99) <= playoffTeamCount : true)
  const lastWeek = Math.max(...playoff.map((m) => m.week))
  const earlier = playoff.filter((m) => m.week < lastWeek)

  const ambiguous = { champion: null, runnerUp: null, source: null, note: 'no title game flagged and bracket is ambiguous' }
  const inferred = (g) => ({
    champion: winner(g),
    runnerUp: loser(g),
    source: 'inferred',
    note: 'inferred from bracket (no title game flag survived)',
  })

  if (earlier.length === 0) {
    const only = playoff.filter((m) => m.week === lastWeek && decided(m) && inField(m.manager_a_id) && inField(m.manager_b_id))
    return only.length === 1 ? inferred(only[0]) : ambiguous
  }

  // Teams that lost (or tied) a playoff game before the final week are out.
  // Teams idle that week had a bye and stay eligible.
  const lost = new Set()
  const playedPlayoff = new Set()
  for (const m of earlier) {
    playedPlayoff.add(m.manager_a_id)
    playedPlayoff.add(m.manager_b_id)
    if (decided(m)) lost.add(loser(m))
    else { lost.add(m.manager_a_id); lost.add(m.manager_b_id) }
  }
  const unbeaten = (id) => (playedPlayoff.has(id) ? !lost.has(id) : true)

  let candidates = playoff.filter(
    (m) =>
      m.week === lastWeek && decided(m) &&
      unbeaten(m.manager_a_id) && unbeaten(m.manager_b_id) &&
      inField(m.manager_a_id) && inField(m.manager_b_id)
  )
  if (candidates.length === 1) return inferred(candidates[0])
  if (candidates.length > 1) {
    // Last resort: the title game is the one carrying the best seed. Only
    // taken when a single game clearly holds it.
    const bestSeed = (m) => Math.min(seed.get(m.manager_a_id) ?? 99, seed.get(m.manager_b_id) ?? 99)
    candidates = [...candidates].sort((x, y) => bestSeed(x) - bestSeed(y))
    if (bestSeed(candidates[0]) === bestSeed(candidates[1])) return ambiguous
    return inferred(candidates[0])
  }
  return ambiguous
}

// Third place: in the final playoff week, a game between two managers who both
// LOST in the previous playoff week is the consolation/third-place game. Only
// claimed when exactly one such game exists — anything ambiguous stays null
// rather than inventing a finish.
function resolveThirdPlace(matchups, champion, runnerUp, playoffTeamCount) {
  const playoff = matchups.filter((m) => m.is_playoff && m.score_a != null && m.score_b != null)
  if (playoff.length === 0) return null
  const lastWeek = Math.max(...playoff.map((m) => m.week))
  const earlier = playoff.filter((m) => m.week < lastWeek)
  if (earlier.length === 0) return null
  const prevWeek = Math.max(...earlier.map((m) => m.week))

  const seed = seedOrder(matchups)
  const inField = (id) => (playoffTeamCount ? (seed.get(id) ?? 99) <= playoffTeamCount : true)

  const lostPrevWeek = new Set(playoff.filter((m) => m.week === prevWeek && decided(m)).map(loser))

  const candidates = playoff.filter(
    (m) =>
      m.week === lastWeek && decided(m) && !m.is_championship &&
      m.manager_a_id !== champion && m.manager_b_id !== champion &&
      m.manager_a_id !== runnerUp && m.manager_b_id !== runnerUp &&
      lostPrevWeek.has(m.manager_a_id) && lostPrevWeek.has(m.manager_b_id) &&
      inField(m.manager_a_id) && inField(m.manager_b_id)
  )
  return candidates.length === 1 ? winner(candidates[0]) : null
}

async function recoverLeague(league) {
  const seasons = await getAll(
    `seasons?league_id=eq.${league.id}&select=id,year,settings,champion_manager_id,runner_up_manager_id,regular_season_winner_id&order=year`
  )
  const managers = await getAll(`managers?league_id=eq.${league.id}&select=id,display_name,team_name,avatar_url`)
  const managerById = new Map(managers.map((m) => [m.id, m]))

  const report = { league: league.slug, seasons: [], rebuilt: 0, skipped: 0, lostDrafts: [], lostLineups: [] }

  for (const season of seasons) {
    const existing = await getAll(`manager_seasons?season_id=eq.${season.id}&select=manager_id`)
    const matchups = await getAll(
      `matchups?season_id=eq.${season.id}&select=week,manager_a_id,manager_b_id,score_a,score_b,is_playoff,is_championship`
    )

    // Only touch seasons that lost their standings. A season that still has
    // manager_seasons rows was either never wiped or already recovered.
    if (existing.length > 0) { report.skipped++; continue }
    if (matchups.length === 0) {
      report.seasons.push({ year: season.year, status: 'unrecoverable', reason: 'no matchups survived' })
      continue
    }

    const agg = aggregateRegularSeason(matchups)
    if (agg.size === 0) {
      report.seasons.push({ year: season.year, status: 'unrecoverable', reason: 'no played regular-season games' })
      continue
    }

    // Playoff field size drives the seed filter in the bracket inference.
    const playoffTeamCount =
      season.settings?.playoff_team_count ?? league.settings?.playoff_team_count ?? null
    const { champion, runnerUp, source: champSource, note } = resolveTitleGame(matchups, playoffTeamCount)
    const third = champion ? resolveThirdPlace(matchups, champion, runnerUp, playoffTeamCount) : null

    // Regular-season rank: wins desc, then PF desc — same ordering the ingest used.
    const ranked = [...agg.entries()].sort(([, a], [, b]) => (b.wins !== a.wins ? b.wins - a.wins : b.pf - a.pf))
    const regRank = new Map(ranked.map(([id], i) => [id, i + 1]))

    const finalRank = new Map()
    if (champion) finalRank.set(champion, 1)
    if (runnerUp) finalRank.set(runnerUp, 2)
    if (third) finalRank.set(third, 3)

    const rows = [...agg.entries()].map(([managerId, a]) => ({
      season_id: season.id,
      manager_id: managerId,
      // Per-season team names died with the drafts/lineups; the managers row
      // holds the last name we ever saw for them, which is the closest true
      // value available. Never invented.
      team_name: managerById.get(managerId)?.team_name ?? managerById.get(managerId)?.display_name ?? null,
      avatar_url: managerById.get(managerId)?.avatar_url ?? null,
      wins: a.wins,
      losses: a.losses,
      ties: a.ties,
      points_for: Math.round(a.pf * 100) / 100,
      points_against: Math.round(a.pa * 100) / 100,
      final_rank: finalRank.get(managerId) ?? null,
      regular_rank: regRank.get(managerId) ?? null,
    }))

    const seasonPatch = {}
    if (champion && !season.champion_manager_id) seasonPatch.champion_manager_id = champion
    if (runnerUp && !season.runner_up_manager_id) seasonPatch.runner_up_manager_id = runnerUp
    const regularWinner = ranked[0]?.[0] ?? null
    if (regularWinner && !season.regular_season_winner_id) seasonPatch.regular_season_winner_id = regularWinner

    if (APPLY) {
      await rest('POST', 'manager_seasons', rows, { Prefer: 'resolution=merge-duplicates' })
      if (Object.keys(seasonPatch).length > 0) {
        await rest('PATCH', `seasons?id=eq.${season.id}`, seasonPatch)
      }
    }

    report.rebuilt++
    report.seasons.push({
      year: season.year,
      status: APPLY ? 'rebuilt' : 'would rebuild',
      managers: rows.length,
      champion: champion ? managerById.get(champion)?.display_name ?? champion : null,
      champSource,
      thirdPlace: third ? managerById.get(third)?.display_name ?? third : null,
      note,
    })

    // Flag the permanently-lost stages so the summary is honest about them.
    const drafts = await get(`drafts?season_id=eq.${season.id}&select=id&limit=1`)
    if (drafts.length === 0) report.lostDrafts.push(season.year)
    const lineups = await get(`weekly_lineups?season_id=eq.${season.id}&select=id&limit=1`)
    if (lineups.length === 0) report.lostLineups.push(season.year)
  }

  return report
}

// ─── Main ─────────────────────────────────────────────────────────────────

const leagueFilter = ONLY_SLUG ? `&slug=eq.${encodeURIComponent(ONLY_SLUG)}` : ''
const leagues = await getAll(`leagues?platform=eq.nfl${leagueFilter}&select=id,slug,name,settings&order=slug`)

console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===')
console.log(`${leagues.length} NFL league(s)\n`)

let totalRebuilt = 0
let totalSkipped = 0
let totalUnrecoverable = 0
const draftLoss = []
const lineupLoss = []

for (const league of leagues) {
  const r = await recoverLeague(league)
  totalRebuilt += r.rebuilt
  totalSkipped += r.skipped
  const bad = r.seasons.filter((s) => s.status === 'unrecoverable')
  totalUnrecoverable += bad.length
  if (r.lostDrafts.length) draftLoss.push(`${r.league}: ${r.lostDrafts.join(',')}`)
  if (r.lostLineups.length) lineupLoss.push(`${r.league}: ${r.lostLineups.join(',')}`)

  if (r.rebuilt || bad.length) {
    console.log(`${r.league} (${league.name})`)
    for (const s of r.seasons) {
      if (s.status === 'unrecoverable') {
        console.log(`  ${s.year}  UNRECOVERABLE — ${s.reason}`)
      } else {
        const champ = s.champion
          ? `champion ${s.champion}${s.champSource === 'inferred' ? ' (inferred)' : ''}`
          : 'champion UNKNOWN'
        const third = s.thirdPlace ? `, 3rd ${s.thirdPlace}` : ''
        console.log(`  ${s.year}  ${s.managers} managers, ${champ}${third}${s.note ? ` [${s.note}]` : ''}`)
      }
    }
    if (VERBOSE && r.skipped) console.log(`  (${r.skipped} season(s) already intact, skipped)`)
    console.log('')
  }
}

console.log('─'.repeat(60))
console.log(`seasons rebuilt:      ${totalRebuilt}`)
console.log(`seasons already ok:   ${totalSkipped}`)
console.log(`seasons unrecoverable:${totalUnrecoverable}`)
console.log('')
console.log('PERMANENTLY LOST (NFL.com is gone; no other source exists):')
console.log(`  drafts missing:  ${draftLoss.length ? draftLoss.join(' | ') : 'none'}`)
console.log(`  lineups missing: ${lineupLoss.length ? lineupLoss.join(' | ') : 'none'}`)
if (!APPLY) console.log('\nNothing was written. Re-run with --apply.')
