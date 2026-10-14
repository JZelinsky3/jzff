// The Cup's block in the Tuesday recap (email and page), on the weeks the
// Cup is running, so the league doesn't forget it between visits:
//   the week before round one   the draw, next week's games, "make your picks"
//   a Cup week                  this week's results, then next week's games
//   the final's week            the champion
//
// Everything is told as of the recap's week: the round decided that week,
// the round after it with the odds it had going in, and the bracket
// challenge's points from rounds up to that week. So an old recap reads the
// same in December as it did on its Tuesday.
//
// Built once per league and week and shared by every recipient of a send.
// Anything going wrong returns null and the recap goes out without it.

import { SITE_URL } from '@/lib/recap/links'
import { loadCup } from './load'
import { loadCupExtras, CHAMPION_BONUS } from './extras'
import type { CupMatch } from './bracket'
import { loadCupPreview } from './preview'
import { CUP_LAUNCH, drawDayText } from './launch'

// `record`: the launch preview has no odds, so it shows the record instead.
export type CupTeaserSide = { name: string; seed: number; score: number | null; prob: number | null; record?: string }

export type CupTeaserGame = {
  a: CupTeaserSide
  b: CupTeaserSide
  // Results only.
  winner: 'a' | 'b' | null
  upset: boolean
  tiebreak: boolean
}

export type CupTeaser = {
  url: string
  name: string
  week: number
  startWeek: number
  finalWeek: number
  field: number
  // The round decided in the recap's week.
  results: { round: string; games: CupTeaserGame[] } | null
  champion: { name: string; seed: number; over: string; score: number; theirs: number } | null
  // The round played next week, with each side's chance going in.
  // `open`: picks for it can still be made (checked when the teaser is
  // built), so an old paper read after the lock points at the bracket.
  next: { round: string; week: number; games: CupTeaserGame[]; byes: { name: string; seed: number }[]; lockAt: string | null; open: boolean } | null
  // The bracket challenge, best three with points (empty before any).
  leaders: { name: string; points: number }[]
  pickers: number
  inPicks: number
  // Before a league's Cup exists: the launch, in the two or three recaps
  // before the draw. `next` then holds round one as today's standings
  // would draw it.
  preview?: {
    drawDay: string
    // The seeding week has been played: these are the seeds.
    final: boolean
    throughWeek: number
    firstOut: { name: string; seed: number; gb: number } | null
    byeRace: { last: string; next: string; gb: number } | null
  } | null
}

const memo = new Map<string, Promise<CupTeaser | null>>()

export function cupTeaser(league: { id: string; slug: string }, year: number, week: number): Promise<CupTeaser | null> {
  const key = `${league.id}:${year}:${week}`
  let p = memo.get(key)
  if (!p) {
    p = build(league, year, week).catch(() => null)
    memo.set(key, p)
    // A long-lived server shouldn't keep these forever, and a page view
    // should pick up new picks within a few minutes.
    setTimeout(() => memo.delete(key), 5 * 60 * 1000).unref?.()
  }
  return p
}

// An 8 beating a 9 is a coin flip, not an upset (same as the Cup page).
const UPSET_GAP = 2

async function build(league: { id: string; slug: string }, year: number, week: number): Promise<CupTeaser | null> {
  // Treat the recap's week as over: the recap only exists once it's final.
  const view = await loadCup(league.id, year, { asOfWeek: week + 1 })
  if (!view) return launchTeaser(league, year, week)
  const { bracket, cup } = view
  if (week < bracket.startWeek - 1 || week > bracket.finalWeek) return null
  const extras = await loadCupExtras(league.id, view)

  const side = (s: CupMatch['a'], prob: number | null, withScore: boolean): CupTeaserSide | null =>
    s.kind === 'team' ? { name: s.entrant.name, seed: s.entrant.seed, score: withScore ? s.score : null, prob } : null

  const decided = bracket.rounds.find((r) => r.week === week) ?? null
  let results: CupTeaser['results'] = null
  if (decided) {
    const games: CupTeaserGame[] = []
    for (const m of decided.matches) {
      if (m.state !== 'final' || !m.winner) continue
      const a = side(m.a, null, true)
      const b = side(m.b, null, true)
      if (a && b) games.push({ a, b, winner: m.winner, upset: m.upsetBy >= UPSET_GAP, tiebreak: m.tiebreak })
    }
    if (games.length) results = { round: decided.name, games }
  }

  let champion: CupTeaser['champion'] = null
  if (week === bracket.finalWeek && bracket.champion && bracket.runnerUp) {
    const f = bracket.rounds[bracket.rounds.length - 1]!.matches[0]!
    const w = f[f.winner!]
    const l = f[f.winner === 'a' ? 'b' : 'a']
    champion = {
      name: bracket.champion.name,
      seed: bracket.champion.seed,
      over: bracket.runnerUp.name,
      score: w.kind === 'team' ? (w.score ?? 0) : 0,
      theirs: l.kind === 'team' ? (l.score ?? 0) : 0,
    }
  }

  const upcoming = bracket.rounds.find((r) => r.week === week + 1) ?? null
  let next: CupTeaser['next'] = null
  if (upcoming) {
    const games: CupTeaserGame[] = []
    for (const m of upcoming.matches) {
      const p = extras.details[m.id]?.probA ?? null
      const a = side(m.a, p, false)
      const b = side(m.b, p == null ? null : 1 - p, false)
      if (a && b) games.push({ a, b, winner: null, upset: false, tiebreak: false })
    }
    if (games.length) {
      const lockAt = upcoming.matches.map((m) => extras.details[m.id]?.lockAt).find(Boolean) ?? null
      next = {
        round: upcoming.name,
        week: upcoming.week,
        games,
        byes: upcoming.byes.map((e) => ({ name: e.name, seed: e.seed })).sort((x, y) => x.seed - y.seed),
        lockAt,
        open: extras.hasPickTable && lockAt != null && Date.now() < Date.parse(lockAt),
      }
    }
  }

  // The bracket challenge as of this week: rounds decided by now only.
  const points = new Map<string, number>()
  const matchAt = new Map<string, CupMatch>()
  for (const r of bracket.rounds) for (const m of r.matches) matchAt.set(`${r.round}:${m.slot}`, m)
  for (const p of extras.picks) {
    if (p.round === -1) {
      if (week === bracket.finalWeek && bracket.champion?.managerId === p.picked) points.set(p.profileId, (points.get(p.profileId) ?? 0) + CHAMPION_BONUS)
      continue
    }
    const m = matchAt.get(`${p.round}:${p.slot}`)
    if (!m || m.week > week || m.state !== 'final' || !m.winner) continue
    const w = m[m.winner]
    if (w.kind === 'team' && w.entrant.managerId === p.picked) points.set(p.profileId, (points.get(p.profileId) ?? 0) + (extras.points[p.round] ?? 1))
  }
  const nameOf = new Map(extras.pickers.map((p) => [p.profileId, p.name]))
  const leaders = [...points.entries()]
    .filter(([id, n]) => n > 0 && nameOf.has(id))
    .map(([id, n]) => ({ name: nameOf.get(id)!, points: n }))
    .sort((x, y) => y.points - x.points || x.name.localeCompare(y.name))
    .slice(0, 3)

  if (!results && !next && !champion) return null
  return {
    url: `${SITE_URL}/leagues/${league.slug}/cup/`,
    name: cup.name,
    week,
    startWeek: bracket.startWeek,
    finalWeek: bracket.finalWeek,
    field: bracket.field,
    results,
    champion,
    next,
    leaders,
    pickers: extras.pickers.length,
    inPicks: new Set(extras.picks.map((p) => p.profileId)).size,
  }
}

// The launch, for a league with no Cup yet: the three recaps before round
// one (weeks 5 to 7 when the Cup starts in week 8). The week 7 paper has
// the real seeds.
async function launchTeaser(league: { id: string; slug: string }, year: number, week: number): Promise<CupTeaser | null> {
  if (year !== CUP_LAUNCH.year || week < CUP_LAUNCH.startWeek - 3 || week > CUP_LAUNCH.startWeek - 1) return null
  const p = await loadCupPreview(league.id, { throughWeek: week })
  if (!p) return null
  const b = p.bracket
  const r1 = b.rounds[0]
  if (!r1) return null
  const byId = new Map(p.teams.map((t) => [t.managerId, t]))
  const side = (s: CupMatch['a']): CupTeaserSide | null =>
    s.kind === 'team' ? { name: s.entrant.name, seed: s.entrant.seed, score: null, prob: null, record: byId.get(s.entrant.managerId)?.record } : null
  const games: CupTeaserGame[] = []
  for (const m of r1.matches) {
    const a = side(m.a)
    const c = side(m.b)
    if (a && c) games.push({ a, b: c, winner: null, upset: false, tiebreak: false })
  }
  if (!games.length) return null
  return {
    url: `${SITE_URL}/leagues/${league.slug}/cup/`,
    name: CUP_LAUNCH.name,
    week,
    startWeek: b.startWeek,
    finalWeek: b.finalWeek,
    field: b.field,
    results: null,
    champion: null,
    next: {
      round: r1.name,
      week: r1.week,
      games,
      byes: r1.byes.map((e) => ({ name: e.name, seed: e.seed })).sort((x, y) => x.seed - y.seed),
      lockAt: null,
      open: false,
    },
    leaders: [],
    pickers: 0,
    inPicks: 0,
    preview: { drawDay: drawDayText(), final: p.final, throughWeek: p.throughWeek, firstOut: p.firstOut, byeRace: p.byeRace },
  }
}
