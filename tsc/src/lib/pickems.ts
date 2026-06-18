// Pick'ems state for the public weekly pickems page.
//
// Identity model: the picker is a `manager_profiles` row (chosen from a
// dropdown — no login). Matchup participants are `managers` rows.
//
// This returns the full multi-week shape the ported pickems.js renders:
// a `teams` map, a `weeks` array (each with matchups/records/winners/GOTW),
// the picker `profiles`, and every `submissions` row so the page can compute
// vote tallies + records client-side (mirrors the original demo).
// See supabase/migrations/0008_pickems.sql + 0009_pickems_hl.sql.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentWeek } from '@/lib/liveSeason'

export type PickemsTeam = {
  id: string // manager_id
  name: string // fantasy team name (falls back to manager name)
  manager: string // profile canonical name
  logo: string | null
  last_week_points: number | null
  projected_points: number | null // we feed season PPG here (no real projections)
  isChampion: boolean
}

export type PickemsWeek = {
  id: string // String(week)
  week: number
  label: string
  locked: boolean // true for weeks before the current week
  is_current: boolean
  matchups: { id: string; home: string; away: string }[]
  records: Record<string, string> // manager_id -> "W-L" going into this week
  winners: Record<string, string> // matchup_id -> winning manager_id
  gameOfWeek: string | null
  hlWinners: { highest: string[]; lowest: string[] } | null
}

export type PickemsProfile = {
  profileId: string
  name: string
  teamId: string | null // this picker's own manager in the live season
}

export type PickemsSubmission = {
  picks: Record<string, string> // matchup_id -> picked manager_id
  hl: { highest?: string; lowest?: string }
}

export type PickemsState =
  | { status: 'no-live' }
  | { status: 'no-week'; year: number }
  | {
      status: 'ok'
      year: number
      league_id: string
      season_id: string
      currentWeek: number
      currentWeekId: string
      teams: Record<string, PickemsTeam>
      profiles: PickemsProfile[]
      weeks: PickemsWeek[]
      // profileId -> weekId -> submission
      submissions: Record<string, Record<string, PickemsSubmission>>
    }

function winnerOf(scoreA: number | null, scoreB: number | null, aId: string, bId: string): string | null {
  if (scoreA == null || scoreB == null) return null
  if (scoreA > scoreB) return aId
  if (scoreB > scoreA) return bId
  return null // tie
}

export async function getPickemsState(slug: string): Promise<PickemsState | null> {
  const db = createAdminClient()

  const { data: league } = await db
    .from('leagues')
    .select('id, is_udfa')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) return null
  // Pick'ems is a paid-tier feature — UDFA (free) leagues never get it.
  if (league.is_udfa) return null

  const { data: liveSeason } = await db
    .from('seasons')
    .select('id, year, settings, champion_manager_id')
    .eq('league_id', league.id)
    .eq('is_live', true)
    .maybeSingle()
  if (!liveSeason) return { status: 'no-live' }

  const settings = (liveSeason.settings ?? {}) as Record<string, unknown>
  const currentWeek = resolveCurrentWeek(settings)
  if (currentWeek == null) return { status: 'no-week', year: liveSeason.year }
  const gotwMap = (settings.gotw ?? {}) as Record<string, string>

  // All matchups for the live season — drives every week up to the current one.
  const { data: allMatchups } = await db
    .from('matchups')
    .select('id, week, manager_a_id, manager_b_id, score_a, score_b')
    .eq('season_id', liveSeason.id)

  const { data: managers } = await db
    .from('managers')
    .select('id, display_name, team_name, avatar_url, profile_id')
    .eq('league_id', league.id)

  const { data: profiles } = await db
    .from('manager_profiles')
    .select('id, canonical_name, is_hidden')
    .eq('league_id', league.id)

  const { data: pickRows } = await db
    .from('pickems_picks')
    .select('profile_id, week, matchup_id, picked_manager_id')
    .eq('league_id', league.id)
    .eq('season_id', liveSeason.id)

  const { data: hlRows } = await db
    .from('pickems_hl_picks')
    .select('profile_id, week, highest_manager_id, lowest_manager_id')
    .eq('league_id', league.id)
    .eq('season_id', liveSeason.id)

  // Defending champion: prior season's champion, mapped to the same profile's
  // manager in the live season.
  let championManagerId: string | null = null
  {
    const { data: prevSeason } = await db
      .from('seasons')
      .select('champion_manager_id')
      .eq('league_id', league.id)
      .eq('year', liveSeason.year - 1)
      .maybeSingle()
    const prevChampMgr = prevSeason?.champion_manager_id ?? null
    const prevChampProfile = (managers ?? []).find((m) => m.id === prevChampMgr)?.profile_id ?? null
    if (prevChampProfile) {
      // live participants
      const liveMgrIds = new Set<string>()
      for (const m of allMatchups ?? []) {
        liveMgrIds.add(m.manager_a_id)
        liveMgrIds.add(m.manager_b_id)
      }
      championManagerId =
        (managers ?? []).find((m) => m.profile_id === prevChampProfile && liveMgrIds.has(m.id))?.id ?? null
    }
  }

  const profileName = new Map<string, string>()
  for (const p of profiles ?? []) profileName.set(p.id, p.canonical_name)

  // Season stats from completed matchups BEFORE the current week.
  type Stat = { pf: number; games: number; lastWeek: number | null }
  const stats = new Map<string, Stat>()
  const ensureStat = (id: string): Stat => {
    let s = stats.get(id)
    if (!s) { s = { pf: 0, games: 0, lastWeek: null }; stats.set(id, s) }
    return s
  }
  for (const m of allMatchups ?? []) {
    if (m.week >= currentWeek) continue
    if (m.score_a == null || m.score_b == null) continue
    const sa = Number(m.score_a)
    const sb = Number(m.score_b)
    const a = ensureStat(m.manager_a_id)
    const b = ensureStat(m.manager_b_id)
    a.pf += sa; a.games++
    b.pf += sb; b.games++
    if (m.week === currentWeek - 1) { a.lastWeek = sa; b.lastWeek = sb }
  }

  // teams map
  const teams: Record<string, PickemsTeam> = {}
  for (const m of managers ?? []) {
    const s = stats.get(m.id)
    teams[m.id] = {
      id: m.id,
      name: m.team_name || (m.profile_id && profileName.get(m.profile_id)) || m.display_name,
      manager: (m.profile_id && profileName.get(m.profile_id)) || m.display_name,
      logo: m.avatar_url ?? null,
      last_week_points: s?.lastWeek ?? null,
      projected_points: s && s.games > 0 ? Math.round((s.pf / s.games) * 10) / 10 : null,
      isChampion: m.id === championManagerId,
    }
  }

  // Build weeks 1..currentWeek that have matchups. Records are cumulative
  // (going into each week); winners come from scored games.
  const weeksWithMatchups = new Set<number>()
  for (const m of allMatchups ?? []) {
    if (m.week >= 1 && m.week <= currentWeek) weeksWithMatchups.add(m.week)
  }
  const weekNums = [...weeksWithMatchups].sort((a, b) => a - b)

  const cum = new Map<string, { w: number; l: number; t: number }>()
  const ensureRec = (id: string) => {
    let r = cum.get(id)
    if (!r) { r = { w: 0, l: 0, t: 0 }; cum.set(id, r) }
    return r
  }

  const weeks: PickemsWeek[] = []
  for (const wk of weekNums) {
    const wkMatchups = (allMatchups ?? []).filter((m) => m.week === wk)

    // Record snapshot BEFORE this week.
    const records: Record<string, string> = {}
    for (const m of wkMatchups) {
      for (const id of [m.manager_a_id, m.manager_b_id]) {
        const r = cum.get(id) ?? { w: 0, l: 0, t: 0 }
        records[id] = `${r.w}-${r.l}${r.t > 0 ? `-${r.t}` : ''}`
      }
    }

    // Winners + advance cumulative record + collect week scores for high/low.
    const winners: Record<string, string> = {}
    const weekScores: Array<{ id: string; score: number }> = []
    let allScored = wkMatchups.length > 0
    for (const m of wkMatchups) {
      const sa = m.score_a != null ? Number(m.score_a) : null
      const sb = m.score_b != null ? Number(m.score_b) : null
      const win = winnerOf(sa, sb, m.manager_a_id, m.manager_b_id)
      if (sa != null && sb != null) {
        if (win) winners[m.id] = win
        const ra = ensureRec(m.manager_a_id)
        const rb = ensureRec(m.manager_b_id)
        if (sa > sb) { ra.w++; rb.l++ }
        else if (sb > sa) { rb.w++; ra.l++ }
        else { ra.t++; rb.t++ }
        weekScores.push({ id: m.manager_a_id, score: sa }, { id: m.manager_b_id, score: sb })
      } else {
        allScored = false
      }
    }

    let hlWinners: { highest: string[]; lowest: string[] } | null = null
    if (allScored && weekScores.length > 0) {
      const max = Math.max(...weekScores.map((x) => x.score))
      const min = Math.min(...weekScores.map((x) => x.score))
      hlWinners = {
        highest: weekScores.filter((x) => x.score === max).map((x) => x.id),
        lowest: weekScores.filter((x) => x.score === min).map((x) => x.id),
      }
    }

    // The current (open) week is undecided by definition — even when testing
    // against an old season whose scores already exist, don't surface winners
    // or high/low results until the week locks.
    const isCurrent = wk === currentWeek
    weeks.push({
      id: String(wk),
      week: wk,
      label: `Week ${wk}`,
      locked: wk < currentWeek,
      is_current: isCurrent,
      matchups: wkMatchups.map((m) => ({ id: m.id, home: m.manager_a_id, away: m.manager_b_id })),
      records,
      winners: isCurrent ? {} : winners,
      gameOfWeek: gotwMap[String(wk)] ?? null,
      hlWinners: isCurrent ? null : hlWinners,
    })
  }

  // Picker profiles + their own team in the live season.
  const liveMgrIds = new Set<string>()
  for (const m of allMatchups ?? []) {
    liveMgrIds.add(m.manager_a_id)
    liveMgrIds.add(m.manager_b_id)
  }
  const teamIdByProfile = new Map<string, string>()
  for (const m of managers ?? []) {
    if (m.profile_id && liveMgrIds.has(m.id)) teamIdByProfile.set(m.profile_id, m.id)
  }
  const pickerProfiles: PickemsProfile[] = (profiles ?? [])
    .filter((p) => !p.is_hidden)
    .map((p) => ({ profileId: p.id, name: p.canonical_name, teamId: teamIdByProfile.get(p.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Submissions: profileId -> weekId -> { picks, hl }
  const submissions: Record<string, Record<string, PickemsSubmission>> = {}
  const ensureSub = (profileId: string, weekId: string): PickemsSubmission => {
    const byWeek = (submissions[profileId] ??= {})
    return (byWeek[weekId] ??= { picks: {}, hl: {} })
  }
  for (const row of pickRows ?? []) {
    ensureSub(row.profile_id, String(row.week)).picks[row.matchup_id] = row.picked_manager_id
  }
  for (const row of hlRows ?? []) {
    ensureSub(row.profile_id, String(row.week)).hl = {
      highest: row.highest_manager_id,
      lowest: row.lowest_manager_id,
    }
  }

  return {
    status: 'ok',
    year: liveSeason.year,
    league_id: league.id,
    season_id: liveSeason.id,
    currentWeek,
    currentWeekId: String(currentWeek),
    teams,
    profiles: pickerProfiles,
    weeks,
    submissions,
  }
}
