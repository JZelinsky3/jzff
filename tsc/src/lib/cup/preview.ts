// The launch preview: the League Cup as it would be drawn from the
// season so far, for a league that has a live season this year and no Cup
// yet. Same seeding rule as the real draw (ratingSeeds: the Cup Rating, top
// twelve), same bracket builder, so what people see in the preview is
// exactly what the draw will make of the season as it stands.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentWeek } from '@/lib/liveSeason'
import { buildBracket, ratingSeeds, recordStr, standingsPlaces, CUP_MAX_FIELD, type CupBracket } from './bracket'
import { cupNames, cupSeasonSettings, type CupSeasonGame } from './load'
import { CUP_LAUNCH } from './launch'

export type CupPreviewTeam = {
  seed: number
  managerId: string
  name: string
  team: string | null
  record: string
  w: number
  l: number
  t: number
  pf: number
  ppg: number
  // Points against a game, points a game over the last three weeks, and the
  // Cup Rating the seed comes from (50 = league average).
  papg: number
  last3: number
  rating: number
  // Their place in the plain standings, to show what the rating moved.
  place: number
  // Inside the twelve.
  inField: boolean
}

export type CupPreview = {
  year: number
  // Games counted through this week (the latest final one, at most the
  // seeding week).
  throughWeek: number
  // The seeding week has been played: these ARE the seeds, barring a
  // late stat correction.
  final: boolean
  teams: CupPreviewTeam[]
  bracket: CupBracket
  // The first team outside the twelve, and how far back it is (in Cup
  // Rating points).
  firstOut: { name: string; seed: number; gap: number } | null
  // The last team with a bye and the first one without, when a bye is still
  // in reach.
  byeRace: { last: string; next: string; gap: number } | null
}

// A bye race is worth a line while it's within this many rating points.
// Seven weeks in, one more win is worth about 4 (a win is a seventh of a
// win rate whose spread is about .2: 0.7 of a spread, times record's 30%,
// times 20 points a spread), so this is about two wins.
const BYE_RACE_GAP = 8

const gapOf = (a: { rating: number }, b: { rating: number }) => Math.round((a.rating - b.rating) * 10) / 10

// `throughWeek` caps the weeks counted (the recap's week); the seeding week
// caps it either way.
export async function loadCupPreview(leagueId: string, opts?: { throughWeek?: number }): Promise<CupPreview | null> {
  const db = createAdminClient()
  const { data: season } = await db
    .from('seasons')
    .select('id, year, settings, is_live')
    .eq('league_id', leagueId)
    .eq('year', CUP_LAUNCH.year)
    .maybeSingle()
  if (!season || !season.is_live) return null

  const { data: rows } = await db
    .from('matchups')
    .select('week, manager_a_id, manager_b_id, score_a, score_b, is_playoff')
    .eq('season_id', season.id)
  const games: CupSeasonGame[] = (rows ?? [])
    .filter((g) => !g.is_playoff)
    .map((g) => ({
      week: g.week as number,
      a: g.manager_a_id as string,
      b: g.manager_b_id as string,
      sa: g.score_a == null ? null : Number(g.score_a),
      sb: g.score_b == null ? null : Number(g.score_b),
    }))
  const currentWeek = resolveCurrentWeek(cupSeasonSettings((season.settings ?? null) as Record<string, unknown> | null, CUP_LAUNCH.year))
  return buildCupPreview({
    games,
    currentWeek,
    throughWeek: opts?.throughWeek,
    names: (ids) => cupNames(db, leagueId, season.id as string, ids),
  })
}

// The preview from a season's regular-season games already in hand: the
// database's (above) or the demo league's (demo.ts).
export async function buildCupPreview(args: {
  games: CupSeasonGame[]
  currentWeek: number | null
  throughWeek?: number
  names: (ids: string[]) => Promise<(id: string) => { name: string; team: string | null }> | ((id: string) => { name: string; team: string | null })
}): Promise<CupPreview | null> {
  const { games, currentWeek } = args

  // A settled week: every game has two real scores (the recap's test).
  const byWeek = new Map<number, CupSeasonGame[]>()
  for (const g of games) byWeek.set(g.week, [...(byWeek.get(g.week) ?? []), g])
  const settled = (w: number) => {
    const list = byWeek.get(w) ?? []
    return list.length > 0 && list.every((g) => g.sa != null && g.sb != null && g.sa > 0 && g.sb > 0)
  }
  const cap = Math.min(CUP_LAUNCH.seededThrough, args.throughWeek ?? CUP_LAUNCH.seededThrough)
  const weeks = [...byWeek.keys()].filter((w) => w <= cap && settled(w)).sort((a, b) => a - b)
  if (!weeks.length) return null
  const counted = games
    .filter((g) => weeks.includes(g.week))
    .map((g) => ({ week: g.week, a: g.a, b: g.b, sa: Number(g.sa), sb: Number(g.sb) }))

  // Everyone, not just the twelve: the bubble needs the teams outside it.
  const all = ratingSeeds(counted, Infinity)
  const places = standingsPlaces(counted)
  if (all.length < 4) return null
  const seeds = all.slice(0, CUP_MAX_FIELD)
  const nameOf = await args.names(all.map((s) => s.manager_id))
  const games8 = new Map<string, string>()
  for (const g of games) {
    if (g.week !== CUP_LAUNCH.startWeek) continue
    games8.set(g.a, g.b)
    games8.set(g.b, g.a)
  }
  const bracket = buildBracket({
    seeds,
    nameOf,
    startWeek: CUP_LAUNCH.startWeek,
    // Nothing in the preview has been played.
    currentWeek: Math.min(currentWeek ?? 1, CUP_LAUNCH.startWeek - 1),
    scoreOf: () => null,
    weekFinal: () => false,
    // When the platform already has week 8's schedule, a projected Cup game
    // that's also the two teams' league game says so.
    opponentOf: (id, w) => (w === CUP_LAUNCH.startWeek ? (games8.get(id) ?? null) : null),
  })

  const teams: CupPreviewTeam[] = all.map((s, i) => {
    const who = nameOf(s.manager_id)
    const n = s.w + s.l + s.t
    return {
      seed: s.seed,
      managerId: s.manager_id,
      name: who.name,
      team: who.team,
      record: recordStr(s.w, s.l, s.t),
      w: s.w,
      l: s.l,
      t: s.t,
      pf: s.pf,
      ppg: n ? Math.round((s.pf / n) * 10) / 10 : 0,
      papg: n ? Math.round(((s.pa ?? 0) / n) * 10) / 10 : 0,
      last3: Math.round((s.form ?? 0) * 10) / 10,
      rating: s.rating ?? 0,
      place: places.get(s.manager_id) ?? s.seed,
      inField: i < CUP_MAX_FIELD,
    }
  })

  const out = teams[CUP_MAX_FIELD]
  const lastIn = teams[CUP_MAX_FIELD - 1]
  const firstOut = out && lastIn ? { name: out.name, seed: out.seed, gap: gapOf(lastIn, out) } : null
  const byes = bracket.rounds[0]?.byes.length ?? 0
  const lastBye = byes ? teams[byes - 1] : null
  const nextUp = byes ? teams[byes] : null
  const byeRace = lastBye && nextUp && gapOf(lastBye, nextUp) <= BYE_RACE_GAP ? { last: lastBye.name, next: nextUp.name, gap: gapOf(lastBye, nextUp) } : null

  return {
    year: CUP_LAUNCH.year,
    throughWeek: weeks[weeks.length - 1]!,
    final: weeks[weeks.length - 1]! >= CUP_LAUNCH.seededThrough,
    teams,
    bracket,
    firstOut,
    byeRace,
  }
}

