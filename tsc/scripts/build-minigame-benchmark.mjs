#!/usr/bin/env node
// Builds the opponent field for Roster Roulette's record.
//
// The game scores a lineup on points per game, and a PPG only means
// something next to other PPGs. The question is which other PPGs.
//
// The obvious answer — the best lineup each real manager-season could have
// fielded — turns out to be the wrong one, and badly so. A real roster
// carries twenty-five to thirty players once a season of waiver churn is
// counted, so its best seven are cherry-picked from a deep pool. A Roulette
// lineup takes exactly one player from each of seven squads, sight unseen.
// Measured against real rosters, a flawless run on a generous wheel still
// lost most of its games, which makes 17-0 unreachable and the whole record
// meaningless.
//
// So the field is drawn from the game itself: simulate thousands of real
// deals off the real pool, play each one out at a randomly drawn level of
// skill, and keep the resulting PPGs. That gives a distribution of what this
// wheel actually produces at human hands.
//
// Measured against the field this produces (50 wheels, four scripted
// agents): flawless play averages about 14-3 and goes 17-0 on roughly one
// wheel in seven; solid play sits near .500; careless play wins three or
// four; picking almost at random wins one. That gradient is the point — the
// record has to reward playing well without making a bad run meaningless.
//
// Recomputed under all six scoring profiles, because a PPR league's weekly
// scores sit well above a standard league's and grading one against the
// other would be nonsense.
//
// Output: public/data/minigames/benchmark.json — two fixed PPG numbers per
// profile. `target` is what a lineup must be worth to go 17-0; `floor` is
// where the record starts at 0-17; wins scale linearly between them. Both
// are constants the game shows the player up front ("17-0 needs 120.6 PPG"),
// so you are chasing a stated bar rather than a moving field.
//
// The two numbers come from the simulation: `target` is the 90th percentile
// of PERFECT play, so hitting it takes both a good wheel and no mistakes on
// it, and `floor` is the 10th percentile of ordinary play, so only a genuinely
// poor run goes winless. Everything in between lands where you'd want —
// median play comes out near .500.
//
// Run:  node scripts/build-minigame-benchmark.mjs
// Rerun when a lot of new leagues have joined; the shape moves slowly.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const env = Object.fromEntries(
  readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
)
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const PROFILES = ['ppr_6pt', 'ppr_4pt', 'half_6pt', 'half_4pt', 'std_6pt', 'std_4pt']
const SLOTS = [
  ['QB'], ['RB'], ['RB'], ['WR'], ['WR'], ['TE'], ['RB', 'WR', 'TE'],
]
const POSITIONS = ['QB', 'RB', 'WR', 'TE']
const GAMES = 17
const FIRST_YEAR = 2009
const LAST_YEAR = 2025
const SPINS_PER_GAME = 9
const MIN_SQUAD_PLAYERS = 8
/** Simulated deals per profile. A few thousand settles the quantiles. */
const SIMULATIONS = 4000

// Mirrors normPlayerName in src/lib/minigames/ranks.ts.
function normName(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/[.‘’']/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function pageAll(pathAndQuery, label) {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${URL_BASE}/rest/v1/${pathAndQuery}`, {
      headers: { ...H, Range: `${from}-${from + PAGE - 1}` },
    })
    if (!res.ok) throw new Error(`${label}: ${res.status} ${await res.text()}`)
    const rows = await res.json()
    out.push(...rows)
    process.stdout.write(`\r  ${label}: ${out.length}`)
    if (rows.length < PAGE) break
  }
  process.stdout.write('\n')
  return out
}

// ── Rank files ────────────────────────────────────────────────
// profile -> year -> normName -> { ppg, position }
function loadRanks() {
  const ranks = {}
  for (const profile of PROFILES) {
    ranks[profile] = {}
    for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
      const file = path.join(ROOT, 'public', 'data', 'fantasy_ranks', profile, `${year}.json`)
      if (!existsSync(file)) continue
      const players = JSON.parse(readFileSync(file, 'utf8')).players ?? []
      const lookup = new Map()
      for (const p of players) {
        const key = normName(p.player_name)
        if (!key || lookup.has(key)) continue
        const fpts = p.fpts ?? 0
        const gp = p.gp ?? 0
        // Matches ranks.ts: no games logged means no per-game rate, so the
        // player isn't scorable. Leaving them in with ppg = season total
        // made them the best board on any wheel by an order of magnitude.
        if (fpts <= 0 || gp <= 0) continue
        lookup.set(key, {
          ppg: fpts / gp,
          position: (p.position ?? '').toUpperCase(),
        })
      }
      ranks[profile][year] = lookup
    }
  }
  return ranks
}

/**
 * Plays one dealt wheel and returns the lineup's total PPG (0 if the wheel
 * couldn't be filled). Slot assignment mirrors the client's: a dedicated
 * slot before the FLEX, always.
 *
 * `skill` in [0,1] sets how hard each pick is biased toward the best legal
 * man on the board. At 1 the best is taken every time; lower values reach
 * further down the roster, but always with a bias toward the top, because
 * that is what weak play actually looks like. Nobody picks uniformly at
 * random off a board where the numbers are printed on every card, so
 * modelling it that way would put a floor under the field that no real
 * player could fall through.
 *
 * The field spans the whole skill range rather than perfect play alone. A
 * field built only from best-play runs bunches so tightly that anyone
 * misjudging a couple of picks finishes below every opponent and goes 0-17,
 * which tells a struggling player nothing. Spanning it keeps competent play
 * near .500, leaves a real tail underneath, and keeps 17-0 rare.
 */
function playWheel(spins, skill) {
  const filled = new Array(SLOTS.length).fill(null)
  let rerolls = SPINS_PER_GAME - SLOTS.length
  let placed = 0
  for (const squad of spins) {
    if (placed === SLOTS.length) break
    const openIdx = SLOTS.map((_, i) => i).filter((i) => filled[i] === null)
    const okPos = new Set(openIdx.flatMap((i) => SLOTS[i]))
    const legal = squad.filter((p) => okPos.has(p.pos)).sort((a, b) => b.ppg - a.ppg)
    if (legal.length === 0) {
      if (rerolls > 0) rerolls--
      continue
    }
    // Rank-biased draw: exponent 1 is uniform over the board, and climbs
    // with skill until the top card is all but certain. skill 1 is special
    // cased to be exactly the best card — the 17-0 bar is set off this
    // branch, and a "perfect" agent that still slipped to the second-best
    // now and then measured a ceiling well under what a real player who
    // always takes the top number reaches, which made 17-0 far too cheap.
    const choice =
      skill >= 1
        ? legal[0]
        : legal[Math.floor(Math.random() ** (1 + skill * 7) * legal.length)]
    const target =
      openIdx.find((i) => SLOTS[i].length === 1 && SLOTS[i].includes(choice.pos)) ??
      openIdx.find((i) => SLOTS[i].includes(choice.pos))
    filled[target] = choice
    placed++
  }
  if (placed < SLOTS.length) return 0
  return filled.reduce((sum, p) => sum + p.ppg, 0)
}

async function main() {
  if (!URL_BASE || !KEY) throw new Error('Missing Supabase env in .env.local')

  console.log('Reading rank files…')
  const ranks = loadRanks()

  console.log('Reading the pool…')
  const leagues = await pageAll(
    'leagues?select=id,slug&manager_view=eq.false&published_at=not.is.null&grace_period_ends_at=is.null&order=id',
    'leagues'
  )
  const leagueIds = leagues.map((l) => l.id)
  const seasons = await pageAll(
    `seasons?select=id,league_id,year&league_id=in.(${leagueIds.join(',')})` +
      `&champion_manager_id=not.is.null&year=gte.${FIRST_YEAR}&year=lte.${LAST_YEAR}&order=id`,
    'seasons'
  )
  const seasonById = new Map(seasons.map((s) => [s.id, s]))
  const seasonIds = seasons.map((s) => s.id)

  const drafts = await pageAll(`drafts?select=id,season_id&season_id=in.(${seasonIds.join(',')})&order=id`, 'drafts')
  const seasonOfDraft = new Map(drafts.map((d) => [d.id, d.season_id]))

  const picks = await pageAll(
    `draft_picks?select=draft_id,manager_id,player_name,position` +
      `&draft_id=in.(${drafts.map((d) => d.id).join(',')})&position=in.(${POSITIONS.join(',')})&order=id`,
    'draft_picks'
  )
  const lineups = await pageAll(
    `weekly_lineups?select=season_id,manager_id,player_name,position` +
      `&season_id=in.(${seasonIds.join(',')})&is_starter=is.true&position=in.(${POSITIONS.join(',')})&order=id`,
    'weekly_lineups'
  )

  // Fold into squads: pair key -> set of normalized player names.
  const squads = new Map()
  const add = (seasonId, managerId, name) => {
    if (!seasonId || !managerId || !name) return
    const key = `${seasonId}|${managerId}`
    let set = squads.get(key)
    if (!set) squads.set(key, (set = new Set()))
    set.add(normName(name))
  }
  for (const p of picks) add(seasonOfDraft.get(p.draft_id), p.manager_id, p.player_name)
  for (const r of lineups) add(r.season_id, r.manager_id, r.player_name)
  console.log(`  squads: ${squads.size}`)

  const out = { generatedAt: new Date().toISOString(), games: GAMES, profiles: {} }

  for (const profile of PROFILES) {
    // Resolve every squad's roster under this profile, keeping only the
    // ones the wheel would actually deal.
    const playable = []
    for (const [key, names] of squads) {
      const seasonId = key.slice(0, key.indexOf('|'))
      const managerId = key.slice(key.indexOf('|') + 1)
      const season = seasonById.get(seasonId)
      if (!season) continue
      const lookup = ranks[profile][season.year]
      if (!lookup) continue
      const players = []
      for (const n of names) {
        const hit = lookup.get(n)
        if (hit && POSITIONS.includes(hit.position)) {
          players.push({ pos: hit.position, ppg: hit.ppg })
        }
      }
      // Same playability bar the wheel uses, so the field is drawn from the
      // squads the game can actually deal.
      if (players.length < MIN_SQUAD_PLAYERS) continue
      if (!POSITIONS.every((p) => players.some((x) => x.pos === p))) continue
      playable.push({ managerId, players })
    }

    // Simulate deals. Each one draws nine squads with no manager repeated,
    // exactly as dealRefs does, then plays them out.
    const samples = []
    const pars = []
    for (let n = 0; n < SIMULATIONS; n++) {
      const spins = []
      const seenManagers = new Set()
      let guard = 0
      while (spins.length < SPINS_PER_GAME && guard < 400) {
        guard++
        const cand = playable[(Math.random() * playable.length) | 0]
        if (!cand || seenManagers.has(cand.managerId)) continue
        seenManagers.add(cand.managerId)
        spins.push(cand.players)
      }
      if (spins.length < SPINS_PER_GAME) continue
      // Skill skewed toward the top: most opponents play reasonably well,
      // with a real tail of poor runs underneath them.
      const skill = Math.random() ** 0.4
      const ppg = playWheel(spins, skill)
      if (ppg > 0) samples.push(ppg)
      // Also record the ceiling for this wheel — perfect play, seeing all
      // nine squads at once. The 17-0 bar is set off this distribution.
      const best = playWheel(spins, 1)
      if (best > 0) pars.push(best)
    }
    samples.sort((a, b) => a - b)
    pars.sort((a, b) => a - b)

    const at = (q) => samples[Math.min(samples.length - 1, Math.round(q * (samples.length - 1)))]
    const parAt = (q) => pars[Math.min(pars.length - 1, Math.round(q * (pars.length - 1)))]
    const floor = Math.round(at(0.1) * 10) / 10
    const target = Math.round(parAt(0.9) * 10) / 10

    out.profiles[profile] = {
      sampleSize: samples.length,
      squadsAvailable: playable.length,
      floor,
      target,
      medianPlay: Math.round(at(0.5) * 10) / 10,
    }
    const winsAt = (ppg) =>
      Math.max(0, Math.min(GAMES, Math.round(((ppg - floor) / (target - floor)) * GAMES)))
    console.log(
      `  ${profile.padEnd(9)} floor=${floor.toFixed(1)}  target=${target.toFixed(1)}  ` +
        `median play ${at(0.5).toFixed(1)} -> ${winsAt(at(0.5))}-${GAMES - winsAt(at(0.5))}  ` +
        `perfect median ${parAt(0.5).toFixed(1)} -> ${winsAt(parAt(0.5))}-${GAMES - winsAt(parAt(0.5))}`
    )
  }

  const dir = path.join(ROOT, 'public', 'data', 'minigames')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'benchmark.json')
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
  console.log(`\nWrote ${path.relative(ROOT, file)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
