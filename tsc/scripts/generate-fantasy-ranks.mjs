// Generates public/data/fantasy_ranks/<profile>/<year>.json — the final
// season positional-finish files the Draft History "Value" and "Grader" tabs
// read to pair "where a player was drafted" with "where he finished."
//
// Source: Sleeper's free public season-aggregate stats endpoint
//   https://api.sleeper.app/v1/stats/nfl/regular/<year>
// plus the players dictionary for name/team/position. The four canonical
// scoring profiles carry no per-game bonuses, so scoring the season aggregate
// is exact (no need to sum per-week).
//
// Usage:
//   node scripts/generate-fantasy-ranks.mjs 2025
//   node scripts/generate-fantasy-ranks.mjs 2025 --dry   (writes to /tmp, prints top-5)
//   node scripts/generate-fantasy-ranks.mjs 2024 --check  (compare vs committed file)

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BASE = 'https://api.sleeper.app/v1'
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

// The canonical profiles derive from Sleeper's own precomputed fantasy points
// (pts_ppr / pts_half_ppr, which already bake in standard per-yard/TD/turnover
// scoring at a 4pt passing-TD baseline). The only knob the four profiles turn
// is passing TDs: the 6pt variants add +2 per passing TD on top. This exactly
// reproduces the committed 2015-2024 files (verified via --check).
const PROFILES = {
  ppr_6pt:  { base: 'pts_ppr',      passTd6: true },
  ppr_4pt:  { base: 'pts_ppr',      passTd6: false },
  half_6pt: { base: 'pts_half_ppr', passTd6: true },
  half_4pt: { base: 'pts_half_ppr', passTd6: false },
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}

function score(stats, profile) {
  const base = stats[profile.base]
  if (typeof base !== 'number') return null
  let pts = base
  if (profile.passTd6) pts += 2 * (stats.pass_td || 0)
  return Math.round(pts * 100) / 100
}

async function main() {
  const year = Number(process.argv[2])
  const dry = process.argv.includes('--dry')
  const check = process.argv.includes('--check')
  if (!year) { console.error('usage: node generate-fantasy-ranks.mjs <year> [--dry|--check]'); process.exit(1) }

  console.log(`Fetching players dict + ${year} season aggregate…`)
  const [players, agg] = await Promise.all([
    getJson(`${BASE}/players/nfl`),
    getJson(`${BASE}/stats/nfl/regular/${year}`),
  ])

  for (const [profile, scoring] of Object.entries(PROFILES)) {
    const rows = []
    for (const [pid, stats] of Object.entries(agg)) {
      const p = players[pid]
      if (!p) continue
      const pos = (p.position || '').toUpperCase()
      if (!POSITIONS.has(pos)) continue
      const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ')
      if (!name) continue
      const fpts = score(stats, scoring)
      if (fpts == null || fpts <= 0) continue
      rows.push({ player_id: pid, player_name: name, team: p.team || null, position: pos, fpts })
    }
    rows.sort((a, b) => b.fpts - a.fpts)
    rows.forEach((r, i) => { r.rank = i + 1 })
    const payload = { year, profile, players: rows }

    if (check) {
      const committed = JSON.parse(await fs.readFile(
        path.join(ROOT, 'public/data/fantasy_ranks', profile, `${year}.json`), 'utf8'))
      const c = committed.players
      let mism = 0
      const n = Math.min(10, rows.length, c.length)
      for (let i = 0; i < n; i++) {
        if (c[i].player_name !== rows[i].player_name || Math.abs((c[i].fpts || 0) - rows[i].fpts) > 0.2) {
          mism++
          if (mism <= 5) console.log(`  [${profile}] #${i + 1} committed ${c[i].player_name}/${c[i].fpts} vs gen ${rows[i].player_name}/${rows[i].fpts}`)
        }
      }
      console.log(`${profile}: committed ${c.length} rows, gen ${rows.length} rows, top-${n} mismatches ${mism}`)
      continue
    }

    const outDir = dry ? path.join('/tmp', 'fr', profile) : path.join(ROOT, 'public/data/fantasy_ranks', profile)
    await fs.mkdir(outDir, { recursive: true })
    await fs.writeFile(path.join(outDir, `${year}.json`), JSON.stringify(payload))
    console.log(`${profile}: ${rows.length} players → ${path.join(outDir, `${year}.json`)}`)
    if (dry) console.log('  top5:', rows.slice(0, 5).map((r) => `${r.player_name}(${r.position}) ${r.fpts}`).join(', '))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
