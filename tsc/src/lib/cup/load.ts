// Loads a league's Cup: the frozen draw from league_cups, the season's
// scores from matchups, and the names the rest of the site prints. Shared by
// the page and both image routes so they can't disagree.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentWeek } from '@/lib/liveSeason'
import { leagueName } from '@/lib/pamsNames'
import { buildBracket, cupWeekLabel, type CupBracket, type CupSeedRow } from './bracket'

export type CupRow = {
  id: string
  league_id: string
  season_year: number
  name: string
  start_week: number
  seeded_through: number
  seeds: CupSeedRow[]
}

export type CupView = {
  cup: CupRow
  bracket: CupBracket
  currentWeek: number | null
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

export async function loadCup(leagueId: string, year?: number | null): Promise<CupView | null> {
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
  const [{ data: managerRows }, { data: profileRows }, { data: teamRows }, { data: games }] = await Promise.all([
    db.from('managers').select('id, display_name, profile_id').in('id', ids),
    db.from('manager_profiles').select('id, canonical_name').eq('league_id', leagueId),
    db.from('manager_seasons').select('manager_id, team_name').eq('season_id', season.id),
    db
      .from('matchups')
      .select('week, manager_a_id, manager_b_id, score_a, score_b')
      .eq('season_id', season.id)
      .gte('week', cup.start_week),
  ])

  // Same names as the recap: the person's profile first, then the league's
  // own name for the account, then whatever the platform calls them.
  const profileName = new Map((profileRows ?? []).map((p) => [p.id as string, p.canonical_name as string]))
  const names = new Map<string, string>()
  for (const m of managerRows ?? []) {
    const profile = m.profile_id ? profileName.get(m.profile_id as string) : undefined
    names.set(m.id as string, profile || leagueName(m.id as string, (m.display_name as string) ?? 'Unknown'))
  }
  const teams = new Map((teamRows ?? []).map((t) => [t.manager_id as string, (t.team_name as string | null) ?? null]))

  const score = new Map<string, number | null>()
  const opponent = new Map<string, string>()
  const byWeek = new Map<number, { a: number | null; b: number | null }[]>()
  for (const g of games ?? []) {
    const w = g.week as number
    const sa = g.score_a == null ? null : Number(g.score_a)
    const sb = g.score_b == null ? null : Number(g.score_b)
    score.set(`${w}:${g.manager_a_id}`, sa)
    score.set(`${w}:${g.manager_b_id}`, sb)
    opponent.set(`${w}:${g.manager_a_id}`, g.manager_b_id as string)
    opponent.set(`${w}:${g.manager_b_id}`, g.manager_a_id as string)
    byWeek.set(w, [...(byWeek.get(w) ?? []), { a: sa, b: sb }])
  }

  const currentWeek = resolveCurrentWeek((season.settings ?? null) as Record<string, unknown> | null)
  const bracket = buildBracket({
    seeds: cup.seeds,
    nameOf: (id) => ({ name: names.get(id) ?? 'Unknown', team: teams.get(id) ?? null }),
    startWeek: cup.start_week,
    currentWeek,
    scoreOf: (id, w) => score.get(`${w}:${id}`) ?? null,
    // Same test the recap uses for a settled week: every game has two real
    // scores. A zero almost always means the platform hasn't finalised.
    weekFinal: (w) => {
      const rows = byWeek.get(w) ?? []
      return rows.length > 0 && rows.every((r) => r.a != null && r.b != null && r.a > 0 && r.b > 0)
    },
    opponentOf: (id, w) => opponent.get(`${w}:${id}`) ?? null,
  })
  return { cup, bracket, currentWeek }
}

export type CupBadge = { id: string; name: string; href: string; label: string; key: string }

// What the almanac's top strip and the Live hub card need, from the cup row
// and the week alone: cheap enough to run on every almanac page load.
export async function cupBadge(
  db: Db,
  league: { id: string; slug: string },
  live: { year: number | null; week: number | null },
): Promise<CupBadge | null> {
  const liveWeek = live.week
  if (liveWeek == null || live.year == null) return null
  const cup = await latestCup(db, league.id)
  if (!cup || cup.season_year !== live.year) return null
  const label = cupWeekLabel({ field: cup.seeds.length, startWeek: cup.start_week, currentWeek: liveWeek })
  if (!label) return null
  return {
    id: cup.id,
    name: cup.name,
    href: `/leagues/${league.slug}/cup/`,
    label,
    // Dismissing the strip hides it for this week only; next round it's back.
    key: `${cup.id}:${liveWeek}`,
  }
}
