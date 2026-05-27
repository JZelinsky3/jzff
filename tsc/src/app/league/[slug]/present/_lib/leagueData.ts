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
  // True once the season has a recorded champion. Anything still in progress
  // (or imported but not yet decided) is excluded from leaderboards and from
  // the final-standings picker by default — owners can still scope a deck to
  // a live season explicitly if they want a mid-year recap.
  isFinished: boolean
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

export type DraftLite = {
  id: string
  seasonId: string
  rounds: number | null
}

export type DraftPickLite = {
  draftId: string
  round: number
  pick: number
  managerId: string | null
  playerName: string | null
  position: string | null
  nflTeam: string | null
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
  drafts: DraftLite[]
  draftPicks: DraftPickLite[]
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

  const [
    { data: standingsRaw },
    { data: matchupsRaw },
    { data: draftsRaw },
  ] = await Promise.all([
    db.from('manager_seasons')
      .select('season_id, manager_id, wins, losses, ties, points_for, points_against, final_rank')
      .in('season_id', inIds),
    db.from('matchups')
      .select('season_id, week, manager_a_id, manager_b_id, score_a, score_b, is_playoff, is_championship')
      .in('season_id', inIds),
    db.from('drafts')
      .select('id, season_id, rounds')
      .in('season_id', inIds),
  ])

  const draftIds = (draftsRaw ?? []).map((d) => d.id)
  const inDraftIds = draftIds.length > 0 ? draftIds : ['00000000-0000-0000-0000-000000000000']
  const { data: draftPicksRaw } = await db
    .from('draft_picks')
    .select('draft_id, round, pick, manager_id, player_name, position, nfl_team')
    .in('draft_id', inDraftIds)
    .order('pick', { ascending: true })

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
    isFinished: !!s.champion_manager_id,
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

  const drafts: DraftLite[] = (draftsRaw ?? []).map((d) => ({
    id: d.id,
    seasonId: d.season_id,
    rounds: d.rounds ?? null,
  }))

  const draftPicks: DraftPickLite[] = (draftPicksRaw ?? []).map((p) => ({
    draftId: p.draft_id,
    round: p.round,
    pick: p.pick,
    managerId: p.manager_id ?? null,
    playerName: p.player_name ?? null,
    position: p.position ?? null,
    nflTeam: p.nfl_team ?? null,
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
    drafts,
    draftPicks,
  }
}

// ─── Scope + consolation handling ──────────────────────────────────────────

// True for matchups that should count toward "real" league history. Sleeper
// tags every game in playoff weeks as is_playoff including consolation
// brackets, so we reconstruct the bracket structure from per-team loss
// counts to identify which playoff games are legitimate.
//
// Rule (per user spec):
//   - Regular season → always real
//   - Championship game (is_championship) → always real
//   - Other playoff games → real iff both participants had 0 prior playoff
//     losses entering (so it's a winners-bracket game: round 1, semifinal)
//   - The third-place game also counts → detected as "championship-week
//     game where both teams have exactly 1 prior playoff loss"
//
// This excludes 5th-place / 7th-place / lower placement games (consolation
// matchups in later rounds between previously-eliminated teams).
const _realKeyCache = new WeakMap<LeaguePresentationData, Set<string>>()

function matchupKey(m: MatchupLite): string {
  return `${m.seasonId}|${m.week}|${m.managerAId}|${m.managerBId}`
}

function buildRealMatchupKeys(data: LeaguePresentationData): Set<string> {
  const keys = new Set<string>()
  // Identify each season's championship week from is_championship matchups —
  // used to detect the third-place game (same-week game with both teams at
  // 1 prior playoff loss).
  const champWeekBySeason = new Map<string, number>()
  for (const m of data.matchups) {
    if (m.isChampionship) champWeekBySeason.set(m.seasonId, m.week)
  }

  const bySeason = new Map<string, MatchupLite[]>()
  for (const m of data.matchups) {
    const arr = bySeason.get(m.seasonId) ?? []
    arr.push(m)
    bySeason.set(m.seasonId, arr)
  }

  for (const [seasonId, list] of bySeason) {
    list.sort((a, b) => a.week - b.week)
    const playoffLosses = new Map<string, number>()
    const champWeek = champWeekBySeason.get(seasonId)
    for (const m of list) {
      if (!m.isPlayoff) {
        keys.add(matchupKey(m))
        continue
      }
      if (m.isChampionship) {
        keys.add(matchupKey(m))
        // Don't update loss counts on the championship — outcome doesn't
        // matter for downstream classification.
        continue
      }
      const aLosses = playoffLosses.get(m.managerAId) ?? 0
      const bLosses = playoffLosses.get(m.managerBId) ?? 0
      const bothInContention = aLosses === 0 && bLosses === 0
      const isThirdPlaceGame =
        champWeek != null && m.week === champWeek && aLosses === 1 && bLosses === 1
      if (bothInContention || isThirdPlaceGame) {
        keys.add(matchupKey(m))
      }
      // Update loss counters for the next game in this season.
      if (m.scoreA != null && m.scoreB != null && m.scoreA !== m.scoreB) {
        if (m.scoreA < m.scoreB) playoffLosses.set(m.managerAId, aLosses + 1)
        else playoffLosses.set(m.managerBId, bLosses + 1)
      }
    }
  }
  return keys
}

export function isRealMatchup(
  m: MatchupLite,
  data: LeaguePresentationData,
): boolean {
  if (!m.isPlayoff) return true
  if (m.isChampionship) return true
  let cached = _realKeyCache.get(data)
  if (!cached) {
    cached = buildRealMatchupKeys(data)
    _realKeyCache.set(data, cached)
  }
  return cached.has(matchupKey(m))
}

// Filter the bundle to a single season (used when the owner scopes a deck
// to one year, e.g. "2025 only"). Returns a new bundle with matchups,
// standings, drafts, and draftPicks narrowed; seasons + managers + profiles
// are kept full because most blocks still need them for lookups.
export function scopeDataToSeason(
  data: LeaguePresentationData,
  seasonId: string,
): LeaguePresentationData {
  const draftIds = new Set(data.drafts.filter((d) => d.seasonId === seasonId).map((d) => d.id))
  return {
    ...data,
    matchups: data.matchups.filter((m) => m.seasonId === seasonId),
    standings: data.standings.filter((s) => s.seasonId === seasonId),
    drafts: data.drafts.filter((d) => d.seasonId === seasonId),
    draftPicks: data.draftPicks.filter((p) => draftIds.has(p.draftId)),
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

export function profileById(data: LeaguePresentationData, id: string | null | undefined): ProfileLite | null {
  if (!id) return null
  return data.profiles.find((p) => p.id === id) ?? null
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

  // Only roll up rows from finished seasons (champion decided). Mid-season
  // standings would inflate everyone's W-L with partial-year numbers and
  // make career totals nonsensical.
  const finishedSeasonIds = new Set(
    data.seasons.filter((s) => s.isFinished).map((s) => s.id),
  )

  for (const s of data.standings) {
    if (!finishedSeasonIds.has(s.seasonId)) continue
    const pid = managerToProfile.get(s.managerId)
    if (!pid) continue
    const r = ensure(pid)
    r.wins += s.wins
    r.losses += s.losses
    r.ties += s.ties
    r.pointsFor += s.pointsFor
    r.pointsAgainst += s.pointsAgainst
    r.seasons += 1
  }

  for (const season of data.seasons) {
    if (!season.isFinished) continue
    if (!season.championManagerId) continue
    const pid = managerToProfile.get(season.championManagerId)
    if (!pid) continue
    ensure(pid).championships += 1
  }

  // Hide profiles flagged as hidden (alumni cleanup).
  const hidden = new Set(data.profiles.filter((p) => p.isHidden).map((p) => p.id))
  return [...acc.values()].filter((r) => !hidden.has(r.profileId))
}

// ─── Highlight helpers ──────────────────────────────────────────────────────

export type WeekHighlight = {
  managerId: string         // who did it
  opponentId: string
  score: number
  opponentScore: number
  week: number
  year: number
  isPlayoff: boolean
  isChampionship: boolean
}

// Pulls every individual team-week score with its surrounding context.
// Used by highest/lowest score helpers below. Skips matchups where the
// score is null (incomplete sync) or zero (almost always a sync artifact
// for unplayed bye weeks rather than a real zero performance).
function weekScores(data: LeaguePresentationData): WeekHighlight[] {
  const yearById = new Map(data.seasons.map((s) => [s.id, s.year]))
  const out: WeekHighlight[] = []
  for (const m of data.matchups) {
    if (!isRealMatchup(m, data)) continue
    const year = yearById.get(m.seasonId)
    if (year == null) continue
    if (m.scoreA != null && m.scoreA > 0) {
      out.push({
        managerId: m.managerAId,
        opponentId: m.managerBId,
        score: m.scoreA,
        opponentScore: m.scoreB ?? 0,
        week: m.week,
        year,
        isPlayoff: m.isPlayoff,
        isChampionship: m.isChampionship,
      })
    }
    if (m.scoreB != null && m.scoreB > 0) {
      out.push({
        managerId: m.managerBId,
        opponentId: m.managerAId,
        score: m.scoreB,
        opponentScore: m.scoreA ?? 0,
        week: m.week,
        year,
        isPlayoff: m.isPlayoff,
        isChampionship: m.isChampionship,
      })
    }
  }
  return out
}

export function highestScoringWeek(data: LeaguePresentationData): WeekHighlight | null {
  const all = weekScores(data)
  if (all.length === 0) return null
  return all.reduce((best, x) => (x.score > best.score ? x : best))
}

export function lowestScoringWeek(data: LeaguePresentationData): WeekHighlight | null {
  const all = weekScores(data)
  if (all.length === 0) return null
  return all.reduce((best, x) => (x.score < best.score ? x : best))
}

export type MarginHighlight = {
  winnerId: string
  loserId: string
  winnerScore: number
  loserScore: number
  margin: number
  week: number
  year: number
  isPlayoff: boolean
  isChampionship: boolean
}

function marginGames(data: LeaguePresentationData): MarginHighlight[] {
  const yearById = new Map(data.seasons.map((s) => [s.id, s.year]))
  const out: MarginHighlight[] = []
  for (const m of data.matchups) {
    if (!isRealMatchup(m, data)) continue
    if (m.scoreA == null || m.scoreB == null) continue
    if (m.scoreA === 0 && m.scoreB === 0) continue
    const year = yearById.get(m.seasonId)
    if (year == null) continue
    const aWins = m.scoreA > m.scoreB
    out.push({
      winnerId: aWins ? m.managerAId : m.managerBId,
      loserId:  aWins ? m.managerBId : m.managerAId,
      winnerScore: aWins ? m.scoreA : m.scoreB,
      loserScore:  aWins ? m.scoreB : m.scoreA,
      margin: Math.abs(m.scoreA - m.scoreB),
      week: m.week,
      year,
      isPlayoff: m.isPlayoff,
      isChampionship: m.isChampionship,
    })
  }
  return out
}

export function biggestBlowout(data: LeaguePresentationData): MarginHighlight | null {
  const all = marginGames(data)
  if (all.length === 0) return null
  return all.reduce((best, x) => (x.margin > best.margin ? x : best))
}

export function closestGame(data: LeaguePresentationData): MarginHighlight | null {
  // Filter out ties (margin = 0) — "closest game" tradition means closest
  // finish that still had a winner.
  const all = marginGames(data).filter((g) => g.margin > 0)
  if (all.length === 0) return null
  return all.reduce((best, x) => (x.margin < best.margin ? x : best))
}

export type StreakResult = {
  profileId: string
  canonicalName: string
  avatarUrl: string | null
  length: number
  startYear: number
  endYear: number
}

export type HeadToHead = {
  profileAId: string
  profileBId: string
  nameA: string
  nameB: string
  avatarA: string | null
  avatarB: string | null
  winsA: number
  winsB: number
  ties: number
  pointsForA: number
  pointsForB: number
  matchupCount: number
  lastMeetingYear: number | null
  biggestMargin: { winnerId: string; margin: number; year: number; week: number } | null
}

// Head-to-head record between two profiles, summing across every season
// where either of their per-platform managers met. Hidden profiles are
// allowed here — caller controls whether to expose hidden alumni.
export function headToHead(
  data: LeaguePresentationData,
  profileAId: string,
  profileBId: string,
): HeadToHead | null {
  if (!profileAId || !profileBId || profileAId === profileBId) return null
  const profileOf = new Map(data.managers.map((m) => [m.id, m.profileId]))
  const yearById = new Map(data.seasons.map((s) => [s.id, s.year]))
  const a = data.profiles.find((p) => p.id === profileAId)
  const b = data.profiles.find((p) => p.id === profileBId)
  if (!a || !b) return null

  let winsA = 0, winsB = 0, ties = 0
  let pointsForA = 0, pointsForB = 0
  let matchupCount = 0
  let lastMeetingYear: number | null = null
  let biggestMargin: HeadToHead['biggestMargin'] = null

  for (const m of data.matchups) {
    if (!isRealMatchup(m, data)) continue
    if (m.scoreA == null || m.scoreB == null) continue
    const pidA = profileOf.get(m.managerAId)
    const pidB = profileOf.get(m.managerBId)
    if (!pidA || !pidB) continue
    // Order-agnostic: A vs B means our matchup's A-side could be either profile.
    let isAFirst: boolean
    if (pidA === profileAId && pidB === profileBId) isAFirst = true
    else if (pidA === profileBId && pidB === profileAId) isAFirst = false
    else continue

    matchupCount++
    const year = yearById.get(m.seasonId) ?? null
    if (year != null && (lastMeetingYear == null || year > lastMeetingYear)) lastMeetingYear = year

    const scoreOurA = isAFirst ? m.scoreA : m.scoreB
    const scoreOurB = isAFirst ? m.scoreB : m.scoreA
    pointsForA += scoreOurA
    pointsForB += scoreOurB

    if (scoreOurA === scoreOurB) {
      ties++
    } else {
      const margin = Math.abs(scoreOurA - scoreOurB)
      if (!biggestMargin || margin > biggestMargin.margin) {
        biggestMargin = {
          winnerId: scoreOurA > scoreOurB ? profileAId : profileBId,
          margin,
          year: year ?? 0,
          week: m.week,
        }
      }
      if (scoreOurA > scoreOurB) winsA++; else winsB++
    }
  }

  if (matchupCount === 0) return null

  return {
    profileAId, profileBId,
    nameA: a.canonicalName,
    nameB: b.canonicalName,
    avatarA: a.avatarUrl,
    avatarB: b.avatarUrl,
    winsA, winsB, ties, pointsForA, pointsForB,
    matchupCount, lastMeetingYear, biggestMargin,
  }
}

// Longest consecutive regular-season win streak per profile (playoff games
// excluded so a single championship run doesn't dominate). Walks results
// chronologically — (year asc, week asc) — and tracks the longest run.
export function longestWinStreak(data: LeaguePresentationData): StreakResult | null {
  const yearById = new Map(data.seasons.map((s) => [s.id, s.year]))
  const managerToProfile = new Map(data.managers.map((m) => [m.id, m.profileId]))

  type Game = { profileId: string; year: number; week: number; won: boolean }
  const games: Game[] = []
  for (const m of data.matchups) {
    if (m.isPlayoff) continue
    if (m.scoreA == null || m.scoreB == null) continue
    if (m.scoreA === m.scoreB) continue
    const year = yearById.get(m.seasonId)
    if (year == null) continue
    const aWins = m.scoreA > m.scoreB
    const pidA = managerToProfile.get(m.managerAId)
    const pidB = managerToProfile.get(m.managerBId)
    if (pidA) games.push({ profileId: pidA, year, week: m.week, won: aWins })
    if (pidB) games.push({ profileId: pidB, year, week: m.week, won: !aWins })
  }
  games.sort((a, b) => a.year - b.year || a.week - b.week)

  const byProfile = new Map<string, Game[]>()
  for (const g of games) {
    let arr = byProfile.get(g.profileId)
    if (!arr) { arr = []; byProfile.set(g.profileId, arr) }
    arr.push(g)
  }

  let best: StreakResult | null = null
  for (const [pid, list] of byProfile) {
    let runLen = 0, runStart: Game | null = null
    let bestLen = 0, bestStart: Game | null = null, bestEnd: Game | null = null
    for (const g of list) {
      if (g.won) {
        if (runLen === 0) runStart = g
        runLen++
        if (runLen > bestLen) {
          bestLen = runLen
          bestStart = runStart
          bestEnd = g
        }
      } else {
        runLen = 0
        runStart = null
      }
    }
    if (bestLen > 0 && (!best || bestLen > best.length)) {
      const p = data.profiles.find((x) => x.id === pid)
      best = {
        profileId: pid,
        canonicalName: p?.canonicalName ?? '—',
        avatarUrl: p?.avatarUrl ?? null,
        length: bestLen,
        startYear: bestStart?.year ?? 0,
        endYear: bestEnd?.year ?? 0,
      }
    }
  }
  return best
}
