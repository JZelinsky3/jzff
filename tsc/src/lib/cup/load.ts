// Loads a league's Cup: the frozen draw from league_cups, the season's
// scores from matchups, and the names the rest of the site prints. Shared by
// the page and both image routes so they can't disagree.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentWeek, resolveWeekLockAt } from '@/lib/liveSeason'
import { week1TuesdayUtc } from '@/lib/nflClock'
import { leagueName } from '@/lib/pamsNames'
import { buildBracket, cupWeekLabel, roundNames, type CupBracket, type CupSeedRow } from './bracket'
import { CUP_LAUNCH, drawDayShort, launchPhase } from './launch'

export type CupRow = {
  id: string
  league_id: string
  season_year: number
  name: string
  start_week: number
  seeded_through: number
  seeds: CupSeedRow[]
}

export type CupSeasonGame = { week: number; a: string; b: string; sa: number | null; sb: number | null }

export type CupView = {
  cup: CupRow
  bracket: CupBracket
  currentWeek: number | null
  season: { id: string; settings: Record<string, unknown> | null }
  // Every game of the Cup's season, for the extras (form, win odds).
  games: CupSeasonGame[]
  weekFinal: (week: number) => boolean
}

type Db = ReturnType<typeof createAdminClient>

// The league's newest Cup (or the newest in `year`). Null when it has none,
// or before migration 0078 is applied (the select errors and we treat that
// as "no Cup").
export async function latestCup(db: Db, leagueId: string, year?: number | null): Promise<CupRow | null> {
  let q = db
    .from('league_cups')
    .select('id, league_id, season_year, name, start_week, seeded_through, seeds')
    .eq('league_id', leagueId)
  if (year) q = q.eq('season_year', year)
  const { data, error } = await q
    .order('season_year', { ascending: false })
    .order('start_week', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return { ...(data as CupRow), seeds: Array.isArray(data.seeds) ? (data.seeds as CupSeedRow[]) : [] }
}

// A season with no calendar of its own (no season_start_date in its
// settings) runs on the NFL's: week 1 opens the Tuesday after Labor Day.
// 12 of the 29 published live leagues had none on 2026-10-14, which left
// the Cup no current week: no banner, and picks that never opened. Scoped
// to the Cup; the rest of the site reads the season's settings as stored.
export function cupSeasonSettings(settings: Record<string, unknown> | null, year: number): Record<string, unknown> {
  const s = settings ?? {}
  if (typeof s.season_start_date === 'string' && !Number.isNaN(Date.parse(s.season_start_date))) return s
  return { ...s, season_start_date: new Date(week1TuesdayUtc(year)).toISOString().slice(0, 10) }
}

// Same names as the recap: the person's profile first, then the league's own
// name for the account, then whatever the platform calls them. Team names
// from that season.
export async function cupNames(db: Db, leagueId: string, seasonId: string, ids: string[]): Promise<(id: string) => { name: string; team: string | null }> {
  const [{ data: managerRows }, { data: profileRows }, { data: teamRows }] = await Promise.all([
    db.from('managers').select('id, display_name, profile_id').in('id', ids),
    db.from('manager_profiles').select('id, canonical_name').eq('league_id', leagueId),
    db.from('manager_seasons').select('manager_id, team_name').eq('season_id', seasonId),
  ])
  const profileName = new Map((profileRows ?? []).map((p) => [p.id as string, p.canonical_name as string]))
  const names = new Map<string, string>()
  for (const m of managerRows ?? []) {
    const profile = m.profile_id ? profileName.get(m.profile_id as string) : undefined
    names.set(m.id as string, profile || leagueName(m.id as string, (m.display_name as string) ?? 'Unknown'))
  }
  const teams = new Map((teamRows ?? []).map((t) => [t.manager_id as string, (t.team_name as string | null) ?? null]))
  return (id) => ({ name: names.get(id) ?? 'Unknown', team: teams.get(id) ?? null })
}

// `asOfWeek` treats the season as being at least that week, so a round can
// read as decided before the platform's calendar has rolled over (the recap
// goes out the Tuesday after a week, sometimes before the week advances).
export async function loadCup(leagueId: string, year?: number | null, opts?: { asOfWeek?: number }): Promise<CupView | null> {
  const db = createAdminClient()
  const cup = await latestCup(db, leagueId, year)
  if (!cup || cup.seeds.length < 2) return null

  const { data: season } = await db
    .from('seasons')
    .select('id, settings')
    .eq('league_id', leagueId)
    .eq('year', cup.season_year)
    .maybeSingle()
  if (!season) return null

  const ids = cup.seeds.map((s) => s.manager_id)
  const [nameOf, { data: games }] = await Promise.all([
    cupNames(db, leagueId, season.id as string, ids),
    db
      .from('matchups')
      .select('week, manager_a_id, manager_b_id, score_a, score_b')
      .eq('season_id', season.id),
  ])

  const settings = cupSeasonSettings((season.settings ?? null) as Record<string, unknown> | null, cup.season_year)
  const resolved = resolveCurrentWeek(settings)
  const currentWeek = opts?.asOfWeek != null && resolved != null ? Math.max(resolved, opts.asOfWeek) : resolved
  return buildCupView({
    cup,
    season: { id: season.id as string, settings },
    currentWeek,
    nameOf,
    games: (games ?? []).map((g) => ({
      week: g.week as number,
      a: g.manager_a_id as string,
      b: g.manager_b_id as string,
      sa: g.score_a == null ? null : Number(g.score_a),
      sb: g.score_b == null ? null : Number(g.score_b),
    })),
  })
}

// The bracket from rows already in hand: the database's (loadCup above) or
// the demo league's (demo.ts), which has no rows to read.
export function buildCupView(args: {
  cup: CupRow
  season: CupView['season']
  currentWeek: number | null
  nameOf: (id: string) => { name: string; team: string | null }
  games: CupSeasonGame[]
}): CupView {
  const { cup, season, currentWeek, nameOf, games } = args
  const score = new Map<string, number | null>()
  const opponent = new Map<string, string>()
  const byWeek = new Map<number, { a: number | null; b: number | null }[]>()
  for (const g of games) {
    score.set(`${g.week}:${g.a}`, g.sa)
    score.set(`${g.week}:${g.b}`, g.sb)
    opponent.set(`${g.week}:${g.a}`, g.b)
    opponent.set(`${g.week}:${g.b}`, g.a)
    byWeek.set(g.week, [...(byWeek.get(g.week) ?? []), { a: g.sa, b: g.sb }])
  }

  // Same test the recap uses for a settled week: every game has two real
  // scores. A zero almost always means the platform hasn't finalised.
  const weekFinal = (w: number) => {
    const rows = byWeek.get(w) ?? []
    return rows.length > 0 && rows.every((r) => r.a != null && r.b != null && r.a > 0 && r.b > 0)
  }
  const bracket = buildBracket({
    seeds: cup.seeds,
    nameOf,
    startWeek: cup.start_week,
    currentWeek,
    scoreOf: (id, w) => score.get(`${w}:${id}`) ?? null,
    weekFinal,
    opponentOf: (id, w) => opponent.get(`${w}:${id}`) ?? null,
  })
  return {
    cup,
    bracket,
    currentWeek,
    // With the NFL calendar filled in, so lock times resolve everywhere the
    // Cup reads them (the page, the pick route).
    season,
    games,
    weekFinal,
  }
}

export type CupBadge = {
  id: string
  name: string
  href: string
  label: string
  key: string
  // Bracket-challenge picks can be made right now: the week before round
  // one, and every Cup week until Thursday kickoff. The strip says "Pick
  // now" then, "Bracket" otherwise.
  picksOpen: boolean
  // No Cup yet: the launch banner, pointing at the countdown preview.
  preview: boolean
}

// The Cup's permanent place in the almanac's nav (the History list on a
// phone), all year round, unlike the strip: the league's newest real Cup,
// or the launch preview while there's no Cup yet. Cups before the launch
// year are test draws (see history.ts) and don't count.
export type CupLink = { name: string; href: string; preview: boolean }

export function cupLink(slug: string, latest: CupRow | null, badge: CupBadge | null): CupLink | null {
  if (latest && latest.season_year >= CUP_LAUNCH.year) return { name: latest.name, href: `/leagues/${slug}/cup/`, preview: false }
  if (badge?.preview) return { name: badge.name, href: badge.href, preview: true }
  return null
}

// What the almanac's top strip and the Live hub card need, from the cup row
// and the week alone: cheap enough to run on every almanac page load.
export async function cupBadge(
  db: Db,
  league: { id: string; slug: string },
  live: { year: number | null; week: number | null; settings?: Record<string, unknown> | null },
  // The league's newest Cup, when the caller has already read it.
  preloaded?: CupRow | null,
): Promise<CupBadge | null> {
  if (live.year == null) return null
  const settings = cupSeasonSettings(live.settings ?? null, live.year)
  const liveWeek = live.week ?? resolveCurrentWeek(settings)
  if (liveWeek == null) return null
  const cup = preloaded !== undefined ? preloaded : await latestCup(db, league.id)
  if (!cup || cup.season_year !== live.year) {
    // The launch: every league with a live season this year, until the
    // draw. A league whose Cup exists by then gets its own strip above.
    if (live.year !== CUP_LAUNCH.year || liveWeek > CUP_LAUNCH.startWeek) return null
    const phase = launchPhase()
    if (phase === 'after') return null
    return {
      id: `launch-${CUP_LAUNCH.year}`,
      name: CUP_LAUNCH.name,
      href: `/leagues/${league.slug}/cup/`,
      label: phase === 'today' ? 'The draw is today' : `Starts ${drawDayShort()}`,
      key: `launch-${CUP_LAUNCH.year}:${liveWeek}`,
      picksOpen: false,
      preview: true,
    }
  }
  const label = cupWeekLabel({ field: cup.seeds.length, startWeek: cup.start_week, currentWeek: liveWeek })
  if (!label) return null
  const rounds = roundNames(cup.seeds.length).length
  // The round whose picks are on the table: this week's, or round one in
  // the week before the Cup starts.
  const pickWeek = Math.max(liveWeek, cup.start_week)
  const lockAt = pickWeek <= cup.start_week + rounds - 1 ? resolveWeekLockAt(settings, pickWeek) : null
  return {
    id: cup.id,
    name: cup.name,
    href: `/leagues/${league.slug}/cup/`,
    label,
    // Dismissing the strip hides it for this week only; next round it's back.
    key: `${cup.id}:${liveWeek}`,
    picksOpen: lockAt != null && Date.now() < Date.parse(lockAt),
    preview: false,
  }
}
