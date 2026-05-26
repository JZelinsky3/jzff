// Server-only: fetches the full data bundle the presentation catalog needs.
// One read pass on the present + run routes; the result is passed down to
// client components as a serializable prop, then stitched into each block's
// render context. Sizes are bounded by league scale (typical: 10 seasons ×
// 12 managers × 14 weeks ≈ 1000 matchups), so a single bundle is fine.
//
// Aggregation rule: "all-time" leaderboards roll up to *profile* (one row
// per real person — managers.profile_id), not to the per-platform manager
// row. This makes someone who shows up on both Sleeper + NFL count once.

import { createAdminClient } from '@/lib/supabase/admin'

export type ManagerLite = {
  id: string                 // manager row id (per-platform identity)
  profileId: string | null
  displayName: string
  avatarUrl: string | null
}

export type ProfileLite = {
  id: string
  canonicalName: string
  isHidden: boolean
  avatarUrl: string | null   // most recent non-null avatar across managers
}

export type SeasonLite = {
  id: string
  year: number
  championManagerId: string | null
  runnerUpManagerId: string | null
  regularSeasonWinnerId: string | null
}

export type StandingRow = {
  seasonId: string
  managerId: string
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  finalRank: number | null
}

export type MatchupLite = {
  seasonId: string
  week: number
  managerAId: string
  managerBId: string
  scoreA: number | null
  scoreB: number | null
  isPlayoff: boolean
  isChampionship: boolean
}

export type RivalryLite = {
  id: string
  name: string
  managerAId: string
  managerBId: string
}

export type LeaguePresentationData = {
  leagueId: string
  leagueName: string
  managers: ManagerLite[]
  profiles: ProfileLite[]
  seasons: SeasonLite[]
  standings: StandingRow[]
  matchups: MatchupLite[]
  rivalries: RivalryLite[]
}

export async function getLeaguePresentationData(leagueId: string, leagueName: string): Promise<LeaguePresentationData> {
  const db = createAdminClient()

  const [
    { data: managersRaw },
    { data: profilesRaw },
    { data: seasonsRaw },
    { data: rivalriesRaw },
  ] = await Promise.all([
    db.from('managers')
      .select('id, profile_id, display_name, avatar_url, created_at')
      .eq('league_id', leagueId),
    db.from('manager_profiles')
      .select('id, canonical_name, is_hidden')
      .eq('league_id', leagueId),
    db.from('seasons')
      .select('id, year, champion_manager_id, runner_up_manager_id, regular_season_winner_id')
      .eq('league_id', leagueId)
      .order('year', { ascending: true }),
    db.from('rivalries')
      .select('id, name, manager_a_id, manager_b_id')
      .eq('league_id', leagueId),
  ])

  const seasonIds = (seasonsRaw ?? []).map((s) => s.id)
  // Empty-IN crashes the postgrest builder; substitute a never-matches uuid.
  const inIds = seasonIds.length > 0 ? seasonIds : ['00000000-0000-0000-0000-000000000000']

  const [{ data: standingsRaw }, { data: matchupsRaw }] = await Promise.all([
    db.from('manager_seasons')
      .select('season_id, manager_id, wins, losses, ties, points_for, points_against, final_rank')
      .in('season_id', inIds),
    db.from('matchups')
      .select('season_id, week, manager_a_id, manager_b_id, score_a, score_b, is_playoff, is_championship')
      .in('season_id', inIds),
  ])

  const managers: ManagerLite[] = (managersRaw ?? []).map((m) => ({
    id: m.id,
    profileId: m.profile_id ?? null,
    displayName: m.display_name ?? '',
    avatarUrl: m.avatar_url ?? null,
  }))

  // Per-profile avatar: prefer the latest manager.avatar_url for that profile.
  // managersRaw is fetched with created_at; we walk in descending order so the
  // first non-null wins.
  const profileAvatar = new Map<string, string>()
  const sortedManagers = (managersRaw ?? []).slice().sort((a, b) => {
    const at = new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    return at
  })
  for (const m of sortedManagers) {
    if (m.profile_id && m.avatar_url && !profileAvatar.has(m.profile_id)) {
      profileAvatar.set(m.profile_id, m.avatar_url)
    }
  }

  const profiles: ProfileLite[] = (profilesRaw ?? []).map((p) => ({
    id: p.id,
    canonicalName: p.canonical_name,
    isHidden: !!p.is_hidden,
    avatarUrl: profileAvatar.get(p.id) ?? null,
  }))

  const seasons: SeasonLite[] = (seasonsRaw ?? []).map((s) => ({
    id: s.id,
    year: s.year,
    championManagerId: s.champion_manager_id ?? null,
    runnerUpManagerId: s.runner_up_manager_id ?? null,
    regularSeasonWinnerId: s.regular_season_winner_id ?? null,
  }))

  const standings: StandingRow[] = (standingsRaw ?? []).map((r) => ({
    seasonId: r.season_id,
    managerId: r.manager_id,
    wins: r.wins ?? 0,
    losses: r.losses ?? 0,
    ties: r.ties ?? 0,
    pointsFor: Number(r.points_for ?? 0),
    pointsAgainst: Number(r.points_against ?? 0),
    finalRank: r.final_rank ?? null,
  }))

  const matchups: MatchupLite[] = (matchupsRaw ?? []).map((m) => ({
    seasonId: m.season_id,
    week: m.week,
    managerAId: m.manager_a_id,
    managerBId: m.manager_b_id,
    scoreA: m.score_a != null ? Number(m.score_a) : null,
    scoreB: m.score_b != null ? Number(m.score_b) : null,
    isPlayoff: !!m.is_playoff,
    isChampionship: !!m.is_championship,
  }))

  const rivalries: RivalryLite[] = (rivalriesRaw ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    managerAId: r.manager_a_id,
    managerBId: r.manager_b_id,
  }))

  return {
    leagueId,
    leagueName,
    managers,
    profiles,
    seasons,
    standings,
    matchups,
    rivalries,
  }
}

// ─── Helpers consumed by individual blocks ──────────────────────────────────

export function managerById(data: LeaguePresentationData, id: string | null | undefined): ManagerLite | null {
  if (!id) return null
  return data.managers.find((m) => m.id === id) ?? null
}

// Display name for a manager, preferring its canonical profile name if linked.
export function nameForManager(data: LeaguePresentationData, id: string | null | undefined): string {
  if (!id) return '—'
  const m = managerById(data, id)
  if (!m) return '—'
  if (m.profileId) {
    const p = data.profiles.find((x) => x.id === m.profileId)
    if (p?.canonicalName) return p.canonicalName
  }
  return m.displayName || '—'
}

export function avatarForManager(data: LeaguePresentationData, id: string | null | undefined): string | null {
  const m = managerById(data, id)
  if (!m) return null
  if (m.avatarUrl) return m.avatarUrl
  if (m.profileId) {
    const p = data.profiles.find((x) => x.id === m.profileId)
    if (p?.avatarUrl) return p.avatarUrl
  }
  return null
}

// All-time profile totals across non-live seasons (everything in the bundle).
export type ProfileTotals = {
  profileId: string
  canonicalName: string
  avatarUrl: string | null
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  seasons: number
  championships: number
  playoffAppearances: number
}

export function profileTotals(data: LeaguePresentationData): ProfileTotals[] {
  const managerToProfile = new Map<string, string | null>()
  for (const m of data.managers) managerToProfile.set(m.id, m.profileId)

  const acc = new Map<string, ProfileTotals>()
  const ensure = (pid: string): ProfileTotals => {
    let row = acc.get(pid)
    if (!row) {
      const p = data.profiles.find((x) => x.id === pid)
      row = {
        profileId: pid,
        canonicalName: p?.canonicalName ?? '—',
        avatarUrl: p?.avatarUrl ?? null,
        wins: 0, losses: 0, ties: 0,
        pointsFor: 0, pointsAgainst: 0,
        seasons: 0, championships: 0, playoffAppearances: 0,
      }
      acc.set(pid, row)
    }
    return row
  }

  for (const s of data.standings) {
    const pid = managerToProfile.get(s.managerId)
    if (!pid) continue
    const r = ensure(pid)
    r.wins += s.wins
    r.losses += s.losses
    r.ties += s.ties
    r.pointsFor += s.pointsFor
    r.pointsAgainst += s.pointsAgainst
    r.seasons += 1
    // Playoff appearance heuristic: final_rank in top half (works for any league size).
    // For a stricter signal, we'd need playoff_team_count from settings — out of scope here.
  }

  for (const season of data.seasons) {
    if (!season.championManagerId) continue
    const pid = managerToProfile.get(season.championManagerId)
    if (!pid) continue
    ensure(pid).championships += 1
  }

  // Hide profiles flagged as hidden (alumni cleanup).
  const hidden = new Set(data.profiles.filter((p) => p.isHidden).map((p) => p.id))
  return [...acc.values()].filter((r) => !hidden.has(r.profileId))
}
