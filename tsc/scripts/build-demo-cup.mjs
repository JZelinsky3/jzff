// Builds the demo league's Cup history (/leagues/demo/cup/) from the demo
// almanac's own data, so the Cup reads like the rest of The Lakeside League.
//
//   node scripts/build-demo-cup.mjs
//
// Writes src/lib/cup/demo-cup.json, which lib/cup/demo.ts serves. Nothing
// here touches the database.
//
//   2019-2025  every week's real demo scores, from public/demo/data/
//              visualizer.json (the Chart Room's season files), so the past
//              Cups agree with the Chart Room week for week.
//   2026       the demo almanac is frozen at week 8 of 2026, but it only
//              stores the table (current_form.json) and week 7's scores
//              (pick'ems' last_week_points). The season's games are drawn
//              here to match both: every team's record, its points within a
//              few, its week 7 score exactly, and week 8's slate from
//              pick'ems. Week 8 has no scores: the Cup's semifinal is live.
//
// Bracket-challenge picks are not stored here; demo.ts deals them from a
// seed so they always fit the brackets the loader builds.

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'))
const OUT = path.join(root, 'src', 'lib', 'cup', 'demo-cup.json')

const viz = read('public/demo/data/visualizer.json')
const form = read('public/demo/data/current_form.json')
const pickems = read('public/demo-m/live/pickems/data.json')
const seasonsDir = read('public/demo/data/seasons_directory.json')

// Demo pick'ems' roster ids (p1..p12), so a name chosen on pick'ems, The
// Weekly or the recap is already chosen here (one localStorage key).
const PROFILE = new Map(pickems.profiles.map((p) => [p.name, p.profileId]))

// Every manager the league has had, with a team name per season.
const people = viz.managers.map((m) => {
  const file = read(`public/demo/data/managers/${m.uid}.json`)
  const teams = Object.fromEntries(file.season_ledger.map((s) => [s.year, s.team_name]))
  return { id: String(m.uid), name: m.name, current: !!m.current, profileId: PROFILE.get(m.name) ?? `p-${m.uid}`, teams }
})
// 2026's team names come from the live table (the ledgers stop at 2025).
for (const r of form.rows) {
  const p = people.find((x) => x.id === String(r.user_id))
  if (p) p.teams[2026] = r.team
}
const byIndex = viz.managers.map((m) => String(m.uid))

// ── 2019-2025: straight from the Chart Room's weeks ──
const seasons = viz.seasons.map((s) => {
  const games = []
  const seen = new Set()
  for (const t of s.teams) {
    for (const [week, pf, pa, opp, playoff] of t.g) {
      const a = byIndex[t.m]
      const b = byIndex[opp]
      const key = `${week}|${[a, b].sort().join('|')}`
      if (seen.has(key)) continue
      seen.add(key)
      games.push([week, a, b, pf, pa, playoff ? 1 : 0])
    }
  }
  games.sort((x, y) => x[0] - y[0])
  return { year: s.year, games }
})

// ── 2026: drawn to fit the table the demo's live pages print ──
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (rand) => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand())

const idByName = new Map(people.map((p) => [p.name, p.id]))
const rows = form.rows.map((r) => ({ id: String(r.user_id), wins: r.wins, pts: r.pts }))
const team = new Map(rows.map((r) => [r.id, r]))
const ids = rows.map((r) => r.id)
const pickTeam = (k) => idByName.get(pickems.teams[k].manager)
const week7 = new Map(Object.keys(pickems.teams).map((k) => [pickTeam(k), pickems.teams[k].last_week_points]))
const week8 = pickems.weeks[0].matchups.map((m) => [pickTeam(m.home), pickTeam(m.away)])

function draw2026(seed) {
  const rand = mulberry32(seed)
  const pair = (a, b) => [a, b].sort().join('|')
  const used = new Set(week8.map(([a, b]) => pair(a, b)))
  // Seven weeks of pairings, no rematches, none of week 8's games.
  const weeks = []
  for (let w = 0; w < 7; w++) {
    let tries = 0
    for (;;) {
      if (++tries > 500) return null
      const pool = [...ids].sort(() => rand() - 0.5)
      const games = []
      let ok = true
      while (pool.length) {
        const a = pool.shift()
        const j = pool.findIndex((b) => !used.has(pair(a, b)))
        if (j < 0) {
          ok = false
          break
        }
        games.push([a, pool.splice(j, 1)[0]])
      }
      if (!ok) continue
      for (const [a, b] of games) used.add(pair(a, b))
      weeks.push(games)
      break
    }
  }
  // Who won each game: week 7 by its real scores, the rest searched until
  // every record matches the table.
  const win = weeks.map((g) => g.map(() => (rand() < 0.5 ? 0 : 1)))
  win[6] = weeks[6].map(([a, b]) => (week7.get(a) >= week7.get(b) ? 0 : 1))
  const wins = () => {
    const n = new Map(ids.map((id) => [id, 0]))
    weeks.forEach((g, w) => g.forEach((p, i) => n.set(p[win[w][i]], n.get(p[win[w][i]]) + 1)))
    return n
  }
  const off = () => {
    const n = wins()
    return ids.reduce((s, id) => s + Math.abs(n.get(id) - team.get(id).wins), 0)
  }
  let cost = off()
  for (let step = 0; step < 20000 && cost > 0; step++) {
    const w = Math.floor(rand() * 6)
    const i = Math.floor(rand() * 6)
    win[w][i] ^= 1
    const next = off()
    if (next <= cost || rand() < 0.02) cost = next
    else win[w][i] ^= 1
  }
  if (cost > 0) return null
  // Scores around each team's rate, the winner always ahead, then nudged
  // so each team's six weeks plus week 7 land on its points total.
  const rate = new Map(ids.map((id) => [id, (team.get(id).pts - week7.get(id)) / 6]))
  const score = weeks.map((g) => g.map(([a, b]) => [rate.get(a) + 17 * gauss(rand), rate.get(b) + 17 * gauss(rand)]))
  score[6] = weeks[6].map(([a, b]) => [week7.get(a), week7.get(b)])
  const fix = () => {
    for (let w = 0; w < 6; w++) {
      weeks[w].forEach((_, i) => {
        const s = score[w][i]
        const k = win[w][i]
        if (s[k] <= s[1 - k]) {
          const mid = (s[0] + s[1]) / 2
          s[k] = mid + 1 + rand() * 9
          s[1 - k] = mid - 1 - rand() * 9
        }
      })
    }
  }
  for (let pass = 0; pass < 40; pass++) {
    fix()
    const total = new Map(ids.map((id) => [id, week7.get(id)]))
    weeks.forEach((g, w) => w < 6 && g.forEach(([a, b], i) => (total.set(a, total.get(a) + score[w][i][0]), total.set(b, total.get(b) + score[w][i][1]))))
    for (let w = 0; w < 6; w++) {
      weeks[w].forEach(([a, b], i) => {
        score[w][i][0] += (team.get(a).pts - total.get(a)) / 6
        score[w][i][1] += (team.get(b).pts - total.get(b)) / 6
      })
    }
  }
  fix()
  const games = []
  weeks.forEach((g, w) => g.forEach(([a, b], i) => games.push([w + 1, a, b, Math.round(score[w][i][0] * 100) / 100, Math.round(score[w][i][1] * 100) / 100, 0])))
  for (const [a, b] of week8) games.push([8, a, b, null, null, 0])
  return games
}

// The Cup's own rule over the drawn season, to choose a draw with a story:
// an upset somewhere in the first two rounds and the top seed still alive,
// so the bracket has both a shock and a favourite.
function standings(games, upTo) {
  const t = new Map()
  const row = (id) => t.get(id) ?? (t.set(id, { id, w: 0, l: 0, pf: 0 }), t.get(id))
  for (const [w, a, b, sa, sb] of games) {
    if (w > upTo || sa == null) continue
    row(a).pf += sa
    row(b).pf += sb
    if (sa > sb) (row(a).w++, row(b).l++)
    else (row(b).w++, row(a).l++)
  }
  return [...t.values()].sort((x, y) => y.w / (y.w + y.l) - x.w / (x.w + x.l) || y.pf - x.pf || x.id.localeCompare(y.id))
}
function story(games) {
  const seeds = standings(games, 5)
  const seedOf = new Map(seeds.map((s, i) => [s.id, i + 1]))
  const at = (id, w) => {
    const g = games.find((x) => x[0] === w && (x[1] === id || x[2] === id))
    return g[1] === id ? g[3] : g[4]
  }
  const by = (s) => seeds[s - 1].id
  const r1 = [[8, 9], [5, 12], [7, 10], [6, 11]].map(([x, y]) => (at(by(x), 6) >= at(by(y), 6) ? x : y))
  const qf = [[1, r1[0]], [4, r1[1]], [2, r1[2]], [3, r1[3]]].map(([x, y]) => (at(by(x), 7) >= at(by(y), 7) ? [x, y] : [y, x]))
  const upsets = [[8, 9], [5, 12], [7, 10], [6, 11]].map(([x, y], i) => r1[i] - Math.min(x, y)).concat(qf.map(([w, l]) => w - l))
  return { seeds: seeds.map((s) => s.id), r1, qf, bigUpset: Math.max(...upsets), topAlive: qf[0][0] === 1 }
}

let chosen = null
for (let seed = 1; seed < 4000 && !chosen; seed++) {
  const games = draw2026(seed)
  if (!games) continue
  const s = story(games)
  if (s.bigUpset >= 4 && s.bigUpset < 8 && s.topAlive) chosen = { seed, games, s }
}
if (!chosen) throw new Error('no 2026 draw fits')
seasons.push({ year: 2026, games: chosen.games })

const champions = Object.fromEntries(seasonsDir.seasons.map((s) => [s.year, String(s.champion_user_id)]))

writeFileSync(
  OUT,
  JSON.stringify(
    {
      league: { name: 'The Lakeside League', slug: 'demo' },
      // The Cup's frozen week, the same week the demo's live pages show.
      currentWeek: 8,
      cupYears: [2021, 2022, 2023, 2024, 2025, 2026],
      people,
      champions,
      seasons,
    },
    null,
    0,
  ),
)
console.log(`wrote ${path.relative(root, OUT)}: 2026 draw seed ${chosen.seed}`, JSON.stringify(chosen.s))
