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
const WEEKLY_OUT = path.join(__dirname, '..', 'public', 'demo-m', 'live', 'weekly', 'data.json')
// Demo pick'ems' own roster ids (p1..p12), so a name claimed on the recap,
// The Weekly or pick'ems is recognised on the other two (one localStorage key).
const PICK_IDS = new Map(
  JSON.parse(readFileSync(path.join(__dirname, '..', 'public', 'demo-m', 'live', 'pickems', 'data.json'), 'utf8'))
    .profiles.map((p) => [p.name, p.profileId]),
)

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
const cast = [] // one row per current team, for The Weekly
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
  if (t.profileId) ids.set(t.profileId, PICK_IDS.get(name) ?? `demo-p-${id}`)
  cast.push({ pamsManagerId: t.managerId, pamsProfileId: t.profileId, pamsName: t.name, id, name })
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

// ── The Weekly (/demo-m/live/weekly/) ──
// pams' live payload from production, run through the same name swap. The
// recap above is the paper The Weekly links to, so the two agree. Platform
// usernames (trade sides are Sleeper display names) are mapped through
// managers.profile_id; pick'ems players who don't own a team are dropped.
const live = await fetch('https://thesundaychronicle.app/leagues/pams/live/weekly/data/', { cache: 'no-store' })
const wk = await live.json()
if (wk.status !== 'ok') throw new Error(`pams weekly: ${wk.status}`)

const castByManager = new Map(cast.map((c) => [c.pamsManagerId, c]))
const castByProfile = new Map(cast.map((c) => [c.pamsProfileId, c]))
const userPams = new Map() // platform username -> pams name
for (const m of await db(`managers?select=display_name,profile_id&league_id=eq.${PAMS}`)) {
  const c = castByProfile.get(m.profile_id)
  if (c && m.display_name && !names.has(m.display_name)) userPams.set(m.display_name, c.pamsName)
}
const uids = new Map() // Sleeper user id -> demo manager number (matchup preview's ?m=)
for (const p of wk.profiles ?? []) {
  const c = castByManager.get(p.managerId)
  if (c && p.uid) uids.set(p.uid, String(c.id))
}
const users = [...userPams.keys()].sort((a, b) => b.length - a.length)
const unUser = (s) => users.reduce((out, u) => out.replace(new RegExp(`(?<![\\w])${esc(u)}(?![\\w])`, 'g'), userPams.get(u)), s)

for (const t of wk.trades?.recent ?? []) {
  const sides = t.sides.map((x) => userPams.get(x.manager) ?? x.manager)
  if (t.summary) t.summary = fixShorthand(t.summary, sides)
}
const wkSwap = (v, k) => {
  if (typeof v !== 'string') return v
  if (uids.has(v)) return uids.get(v)
  if (k === 'id' && /^[0-9a-f-]{36}$/.test(v) && !ids.has(v)) return `demo-${v.slice(0, 8)}`
  // Some team names are also the owner's username (tinfoil99), so usernames
  // are only read as people where a field holds a person: trade sides and
  // the "a ⇄ b" headline. Everywhere else the team-name swap wins.
  return swap(k === 'manager' || k === 'headline' ? unUser(v) : v, k)
}
const wkOut = walk({
  ...wk,
  profiles: (wk.profiles ?? []).filter((p) => castByManager.has(p.managerId)),
  picks: wk.picks && {
    ...wk.picks,
    submitted: wk.picks.submitted.filter((id) => castByProfile.has(id)),
    standings: wk.picks.standings.filter((s) => cast.some((c) => c.pamsName === s.name)),
    // A frozen week whose picks are always open: a Thursday 8pm ET far ahead.
    locked: false,
    locksAt: '2030-10-11T00:00:00.000Z',
  },
}, wkSwap)
wkOut.league = { name: 'The Lakeside League', abbr: 'LSL' }
wkOut.profiles.sort((a, b) => a.name.localeCompare(b.name))
wkOut.recap = { year: row.season_year, week: row.week, href: `/leagues/demo/recap/${row.season_year}/${row.week}/` }

const wkBlob = JSON.stringify(walk(wkOut, (v, k) => (PLAYER_KEYS.has(k) ? '' : v)))
const wkLeaks = [
  ...nameList.filter((n) => new RegExp(`(?<![\\w])${esc(n)}(?![\\w])(?! [A-Z][a-z])`).test(wkBlob)),
  ...teamList.filter((t) => wkBlob.includes(t)),
  ...users.filter((u) => wkBlob.includes(u)),
  ...[...uids.keys(), ...ids.keys()].filter((id) => wkBlob.includes(id)),
  ...['PA Milk', 'PAMS', 'sleepercdn'].filter((s) => wkBlob.includes(s)),
]
if (wkLeaks.length) {
  console.error('pams names left in the demo Weekly:', [...new Set(wkLeaks)])
  process.exit(1)
}
writeFileSync(WEEKLY_OUT, JSON.stringify(wkOut) + '\n')
console.log(`demo weekly: ${wkOut.year} week ${wkOut.week}, wrote ${path.relative(process.cwd(), WEEKLY_OUT)}`)
