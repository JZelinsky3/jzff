// The launch preview: the League Cup as it would be drawn from the
// standings right now, for a league that has a live season this year and
// no Cup yet. Same seeding rule as the real draw (standingsSeeds: win rate,
// then points for, top twelve), same bracket builder, so what people see in
// the preview is exactly what the draw will make of the table as it stands.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentWeek } from '@/lib/liveSeason'
import { buildBracket, recordStr, standingsSeeds, CUP_MAX_FIELD, type CupBracket } from './bracket'
import { cupNames } from './load'
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
  // Inside the twelve.
  inField: boolean
}

export type CupPreview = {
  year: number
  // Standings counted through this week (the latest final one, at most the
  // seeding week).
  throughWeek: number
  // The seeding week has been played: these ARE the seeds, barring a
  // late stat correction.
  final: boolean
  teams: CupPreviewTeam[]
  bracket: CupBracket
  // The first team outside the twelve, and how far back it is.
  firstOut: { name: string; seed: number; gb: number } | null
  // The last team with a bye and the first one without, when a bye is still
  // in reach.
  byeRace: { last: string; next: string; gb: number } | null
}

// Games behind, the standings way: half the difference in wins plus half
// the difference in losses.
function gamesBack(a: { w: number; l: number }, b: { w: number; l: number }): number {
  return (a.w - b.w + (b.l - a.l)) / 2
}

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
  const games = (rows ?? []).filter((g) => !g.is_playoff)

  // A settled week: every game has two real scores (the recap's test).
  const byWeek = new Map<number, typeof games>()
  for (const g of games) byWeek.set(g.week as number, [...(byWeek.get(g.week as number) ?? []), g])
  const settled = (w: number) => {
    const list = byWeek.get(w) ?? []
    return list.length > 0 && list.every((g) => g.score_a != null && g.score_b != null && Number(g.score_a) > 0 && Number(g.score_b) > 0)
  }
  const cap = Math.min(CUP_LAUNCH.seededThrough, opts?.throughWeek ?? CUP_LAUNCH.seededThrough)
  const weeks = [...byWeek.keys()].filter((w) => w <= cap && settled(w)).sort((a, b) => a - b)
  if (!weeks.length) return null
  const counted = games
    .filter((g) => weeks.includes(g.week as number))
    .map((g) => ({ a: g.manager_a_id as string, b: g.manager_b_id as string, sa: Number(g.score_a), sb: Number(g.score_b) }))

  // Everyone, not just the twelve: the bubble needs the teams outside it.
  const all = standingsSeeds(counted, Infinity)
  if (all.length < 4) return null
  const seeds = all.slice(0, CUP_MAX_FIELD)
  const nameOf = await cupNames(db, leagueId, season.id as string, all.map((s) => s.manager_id))
  const games8 = new Map<string, string>()
  for (const g of games) {
    if (g.week !== CUP_LAUNCH.startWeek) continue
    games8.set(g.manager_a_id as string, g.manager_b_id as string)
    games8.set(g.manager_b_id as string, g.manager_a_id as string)
  }
  const currentWeek = resolveCurrentWeek((season.settings ?? null) as Record<string, unknown> | null)
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
      inField: i < CUP_MAX_FIELD,
    }
  })

  const out = teams[CUP_MAX_FIELD]
  const lastIn = teams[CUP_MAX_FIELD - 1]
  const firstOut = out && lastIn ? { name: out.name, seed: out.seed, gb: gamesBack(lastIn, out) } : null
  const byes = bracket.rounds[0]?.byes.length ?? 0
  const lastBye = byes ? teams[byes - 1] : null
  const nextUp = byes ? teams[byes] : null
  // Only worth a line while it's within two games.
  const byeRace = lastBye && nextUp && gamesBack(lastBye, nextUp) <= 2 ? { last: lastBye.name, next: nextUp.name, gb: gamesBack(lastBye, nextUp) } : null

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

