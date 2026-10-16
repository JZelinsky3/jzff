// Builds the demo league's rivalries (public/demo/data/rivalries.json and the
// /demo-m/ copy), in the shape lib/export/pams.ts buildRivalries writes for a
// real league, so the rivalry pages and the home page's rivalry cards have
// something to show. The demo shipped with an empty list.
//
//   node scripts/build-demo-rivalries.mjs
//
// The six feuds are named here, the way a commissioner names them. Every
// number comes from the Chart Room's weeks (data/visualizer.json), the
// demo's only game log, so each rivalry agrees with itself: the record, the
// last five and the last meeting are the same games. (The Manager Files'
// head-to-head ledgers came from a different source and only agree with the
// game log for three pairs, so they can't be mixed in.)

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'))

const FEUDS = [
  ['demo-lake-effect', 'THE LAKE EFFECT', 1010, 1007],
  ['demo-crosstown', 'THE CROSSTOWN CLASSIC', 1002, 1004],
  ['demo-hammer-hawk', 'THE HAMMER AND THE HAWK', 1001, 1003],
  ['demo-inside-job', 'THE INSIDE JOB', 1006, 1008],
  ['demo-fire-ice', 'FIRE AND ICE', 1005, 1009],
  ['demo-river-wars', 'THE RIVER WARS', 1011, 1012],
]

const viz = read('public/demo/data/visualizer.json')
const uidOf = viz.managers.map((m) => m.uid)
const round2 = (n) => Math.round(n * 100) / 100

// Every meeting between two managers, oldest first, from a's side. Playoff
// games count only in the championship bracket (either side finished top
// four), the exporter's rule.
function meetings(a, b) {
  const out = []
  for (const s of viz.seasons) {
    const final = new Map(s.teams.map((t) => [uidOf[t.m], t.final]))
    for (const t of s.teams) {
      if (uidOf[t.m] !== a) continue
      for (const [week, pf, pa, opp, playoff] of t.g) {
        if (uidOf[opp] !== b) continue
        if (playoff && !((final.get(a) ?? 99) <= 4 || (final.get(b) ?? 99) <= 4)) continue
        out.push({ year: s.year, week, is_playoff: !!playoff, a: pf, b: pa })
      }
    }
  }
  return out.sort((x, y) => x.year - y.year || x.week - y.week)
}

function side(file, games, mine) {
  const other = mine === 'a' ? 'b' : 'a'
  const rec = (list) => {
    const w = list.filter((g) => g[mine] > g[other]).length
    const l = list.filter((g) => g[mine] < g[other]).length
    return [w, l, list.length - w - l]
  }
  const [w] = rec(games)
  const reg = rec(games.filter((g) => !g.is_playoff))
  const post = rec(games.filter((g) => g.is_playoff))
  const high = games.reduce((best, g) => (!best || g[mine] > best[mine] ? g : best), null)
  return {
    name: file.name,
    user_id: file.user_id,
    wins: w,
    avg_ppg: games.length ? round2(games.reduce((s, g) => s + g[mine], 0) / games.length) : 0,
    reg_record: reg.join('-'),
    playoff_record: post.join('-'),
    high_score: high ? { score: round2(high[mine]), year: high.year, week: high.week, is_playoff: high.is_playoff } : null,
    last5: games.slice(-5).map((g) => {
      const m = round2(g[mine] - g[other])
      return { year: g.year, week: g.week, is_playoff: g.is_playoff, result: m > 0 ? 'W' : m < 0 ? 'L' : 'T', margin: Math.abs(m) }
    }),
  }
}

const rivalries = FEUDS.map(([id, name, a, b]) => {
  const fa = read(`public/demo/data/managers/${a}.json`)
  const fb = read(`public/demo/data/managers/${b}.json`)
  const games = meetings(a, b)
  const A = side(fa, games, 'a')
  const B = side(fb, games, 'b')
  const ties = games.length - A.wins - B.wins
  const last = games[games.length - 1]
  const leader = A.wins > B.wins ? A.name : B.wins > A.wins ? B.name : null
  return {
    id,
    name,
    total_meetings: games.length,
    first_meeting_year: games[0]?.year ?? null,
    last_meeting: last ? { year: last.year, week: last.week, is_playoff: last.is_playoff, a_score: round2(last.a), b_score: round2(last.b) } : null,
    leader_name: leader,
    leader_record: leader === null ? `${A.wins}–${B.wins}` : leader === A.name ? `${A.wins}–${B.wins}` : `${B.wins}–${A.wins}`,
    is_deadlocked: A.wins === B.wins,
    manager_a: A,
    manager_b: B,
    ties_count: ties,
  }
})

let leaders = 0
let deadlocked = 0
for (const r of rivalries) {
  if (r.is_deadlocked && r.total_meetings > 0) deadlocked++
  else if (r.leader_name) leaders++
}
const out = {
  rivalries,
  summary: { active_feuds: rivalries.length, total_meetings: rivalries.reduce((s, r) => s + r.total_meetings, 0), leaders, deadlocked },
}
for (const tree of ['demo', 'demo-m']) writeFileSync(path.join(root, 'public', tree, 'data', 'rivalries.json'), JSON.stringify(out, null, 1))
for (const r of rivalries) console.log(r.name, `${r.manager_a.name} ${r.manager_a.wins}-${r.manager_b.wins} ${r.manager_b.name}`, `${r.total_meetings} met`, r.manager_a.last5.map((g) => g.result).join(''))
