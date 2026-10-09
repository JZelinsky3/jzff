// Builds the demo league's recap (/leagues/demo/recap/) from a real pams
// edition with every pams name swapped for a Lakeside League one.
//
//   node scripts/build-demo-recap.mjs            latest stored pams week
//   node scripts/build-demo-recap.mjs 2026 4     a given week
//
// Writes src/lib/recap/demo-recap.json, which lib/recap/demo.ts serves. The
// facts are stored ones (run.ts wrote them), so the paper reads exactly like
// pams' did that week. Managers, team names, avatars, divisions, ids and the
// league are replaced; player names are left alone (pams has a Kyle, the NFL
// has Kyle Monangai). The script fails if a pams name survives anywhere.

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const PAMS = '1f7ccf54-d49d-4050-af1c-55ac27e73abf'
const OUT = path.join(__dirname, '..', 'src', 'lib', 'recap', 'demo-recap.json')

// The Lakeside League's twelve (public/demo/data/seasons/2025.json), by
// division, plus a former member for anyone in the history who has left.
const NORTH = [
  [1001, 'Marcus', 'Stoneridge Hammers'], [1003, 'Jordan', 'Highland Hawks'], [1006, 'Devin', 'Den of Thieves'],
  [1007, 'Cole', 'Cold Front'], [1010, 'Noah', 'Northern Lights'], [1012, 'Owen', 'Old Glory'],
]
const SOUTH = [
  [1002, 'Tyler', 'Crosstown Comets'], [1004, 'Ethan', 'Eastside Express'], [1005, 'Brandon', 'Brimstone FC'],
  [1008, 'Trevor', 'Trojan Horse'], [1009, 'Adam', 'Avalanche'], [1011, 'Ryan', 'Riverside Reign'],
]
const FORMER = ['Pete', 'Dave', 'Greg', 'Sam', 'Nathan']

const db = async (q) => {
  const res = await fetch(`${URL_}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`${q}: ${res.status} ${await res.text()}`)
  return res.json()
}

const [yArg, wArg] = process.argv.slice(2).map(Number)
const filter = yArg && wArg ? `&season_year=eq.${yArg}&week=eq.${wArg}` : ''
const [row] = await db(`weekly_recaps?select=season_year,week,facts,intro,subject&league_id=eq.${PAMS}${filter}&order=season_year.desc,week.desc&limit=1`)
if (!row) throw new Error('no stored pams recap')
const f = row.facts

// ── Who becomes whom ──
const names = new Map() // pams manager name -> demo name
const teams = new Map() // pams team name -> demo team name
const avatars = new Map() // pams avatar url -> demo svg
const ids = new Map() // pams uuid -> demo id
const north = [...NORTH]
const south = [...SOUTH]
const byDiv = [north, south]
for (const t of f.teams) {
  const s = f.standings?.find((x) => x.managerId === t.managerId)
  const pool = byDiv[s?.div ?? 0]?.length ? byDiv[s?.div ?? 0] : (north.length ? north : south)
  const [id, name, team] = pool.shift()
  names.set(t.name, name)
  if (t.team) teams.set(t.team, team)
  if (t.avatar) avatars.set(t.avatar, `/demo/assets/avatars/${id}.svg`)
  ids.set(t.managerId, `demo-m-${id}`)
  if (t.profileId) ids.set(t.profileId, `demo-p-${id}`)
}
ids.set(f.league.id, 'demo')

// Team names from every other place a team appears (standings, power), in
// case one differs from the card's.
const walk = (x, fn, key = '') => {
  if (Array.isArray(x)) return x.map((v) => walk(v, fn, key))
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v, fn, k)]))
  return fn(x, key)
}
walk(f, (v, k) => {
  // Trade assets carry NFL team codes under the same key ("LAC").
  if (k === 'team' && typeof v === 'string' && !/^[A-Z]{2,3}$/.test(v) && !teams.has(v) && !names.has(v)) teams.set(v, `Lakeside ${teams.size + 1}`)
  return v
})

// Anyone named in the history who isn't on this year's twelve (a former
// member holding a record): the fields that only ever hold a manager.
const PERSON_KEYS = new Set(['who', 'vs', 'winner', 'loser', 'manager', 'name', 'opponent'])
walk({ ...f, league: null }, (v, k) => {
  if (PERSON_KEYS.has(k) && typeof v === 'string' && /^[A-Za-z][\w.' -]{0,30}$/.test(v) && !names.has(v) && !['a', 'b'].includes(v)) {
    names.set(v, FORMER[names.size - f.teams.length] ?? `Former ${names.size}`)
  }
  return v
})

// Strings that are player names, never touched.
const PLAYER_KEYS = new Set(['player', 'label', 'gets'])
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const teamList = [...teams.keys()].sort((a, b) => b.length - a.length)
const nameList = [...names.keys()].sort((a, b) => b.length - a.length)
const swapText = (s) => {
  let out = s
  for (const t of teamList) {
    // Possessives come in both apostrophes ("Kyle's Foreskin", "Kyle’s Foreskin").
    const pat = esc(t).replace(/'|’/g, "['’]")
    out = out.replace(new RegExp(pat, 'g'), teams.get(t))
  }
  for (const n of nameList) {
    // A manager's name, but not a player's first name ("Kyle Monangai",
    // "Mason Taylor"): skip it when a capitalised word follows.
    out = out.replace(new RegExp(`(?<![\\w])${esc(n)}(?![\\w])(?! [A-Z][a-z])`, 'g'), names.get(n))
  }
  return out
    .replaceAll('PA Milk Society', 'The Lakeside League')
    .replace(/\bPAMS\b/g, 'LSL')
}

const swap = (v, k) => {
  if (typeof v !== 'string') return v
  if (ids.has(v)) return ids.get(v)
  if (avatars.has(v)) return avatars.get(v)
  if (/^https?:\/\//.test(v) && k === 'avatar') return null
  if (PLAYER_KEYS.has(k)) return v
  if (names.has(v)) return names.get(v)
  if (teams.has(v)) return teams.get(v)
  return swapText(v)
}

// Trade write-ups sometimes shorten a team to its first word ("Kyle wins
// this trade" for Kyle's Foreskin, which isn't Kyle's team). A manager name
// that isn't on either side of the deal but starts a side's team name is
// that team.
const teamOf = new Map(f.teams.map((t) => [t.name, t.team]))
const fixShorthand = (summary, sides) => {
  let out = summary
  for (const n of nameList) {
    if (sides.includes(n)) continue
    const team = sides.map((m) => teamOf.get(m)).find((t) => t && t.split(/['’ ]/)[0] === n)
    if (!team) continue
    // The full name first, so "Kyle’s Foreskin" isn't read as the shorthand.
    out = out.replace(new RegExp(esc(team).replace(/'|’/g, "['’]"), 'g'), teams.get(team))
    out = out.replace(new RegExp(`(?<![\\w])${esc(n)}(?![\\w])`, 'g'), teams.get(team))
  }
  return out
}
for (const t of f.trades ?? []) if (t.summary) t.summary = fixShorthand(t.summary, t.sides.map((x) => x.manager))
for (const v of f.verdicts ?? []) if (v.summary) v.summary = fixShorthand(v.summary, v.headline.split(' and '))

const out = walk(f, swap)
out.league = { id: 'demo', abbr: 'LSL', name: 'The Lakeside League', slug: 'demo' }
if (out.divisions) out.divisions = f.divisions.map((_, i) => ['North', 'South'][i] ?? `Division ${i + 1}`)
// The page has no pick'ems board to link to.
if (out.next) delete out.next.picksLockAt

const intro = swapText(row.intro ?? '')
const subject = swapText(row.subject ?? '')

// ── Nothing from pams survives ──
const blob = JSON.stringify({ out, intro, subject })
const leaks = [
  ...[...names.keys()].filter((n) => new RegExp(`(?<![\\w])${esc(n)}(?![\\w])(?! [A-Z][a-z])`).test(JSON.stringify(walk(out, (v, k) => (PLAYER_KEYS.has(k) ? '' : v))) + intro + subject)),
  ...[...teams.keys()].filter((t) => blob.includes(t)),
  ...['PA Milk', 'pams', 'sleepercdn', PAMS].filter((s) => blob.includes(s)),
  ...[...ids.keys()].filter((id) => blob.includes(id)),
]
// A demo name can equal a pams one only by accident; none do today.
if (leaks.length) {
  console.error('pams names left in the demo recap:', [...new Set(leaks)])
  process.exit(1)
}

writeFileSync(OUT, JSON.stringify({ year: row.season_year, week: row.week, intro, subject, facts: out }, null, 1) + '\n')
console.log(`demo recap: ${row.season_year} week ${row.week}`)
console.log('managers', Object.fromEntries(names))
console.log('teams', Object.fromEntries(teams))
console.log(`wrote ${path.relative(process.cwd(), OUT)}`)
