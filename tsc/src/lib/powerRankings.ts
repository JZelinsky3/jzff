// Power rankings for the live season.
//
// A ranking snapshot is computed for the preseason (week 0) and after each
// completed week. Each team gets a 0–100 score from a weighted formula:
//
//   Preseason (pure career history):
//     Win% 20 · PF Avg 21 · Recent 24 · Pedigree 35
//   In-season (week 4+):
//     Record 33 · Points For 30 · Form 20 · Conference 17
//     (no divisions → Record 40 · PF 35 · Form 25 · Conf 0)
//   Weeks 1–3 blend the preseason score out: 30% / 20% / 10%, then 0%.
//
// Everything derives from manager_seasons (career) + the live season's
// matchups (in-season) — no extra ingest. Monte Carlo projections are added
// separately (see src/lib/powerSim.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentWeek } from '@/lib/liveSeason'
import { simulateSeason } from '@/lib/powerSim'

export type PowerFactors = {
  // preseason
  win_pct?: number
  pf_avg?: number
  recent?: number
  pedigree?: number
  // in-season
  record?: number
  pf?: number
  form?: number
  conf?: number
}

export type PowerTeam = {
  rank: number
  team_id: string // manager_id
  team_name: string
  manager: string
  logo: string | null
  division: number | null // 1-indexed; null if league has no divisions
  division_name: string | null
  wins: number
  losses: number
  pf: number
  pa: number
  score: number
  delta: number // rank change vs the previous snapshot (+ = moved up)
  factors: PowerFactors
  conf_rank?: number
  // Monte Carlo projections — attached when a remaining schedule exists.
  proj_wins?: number
  proj_losses?: number
  playoff_pct?: number
  bye_pct?: number
  conf_win_pct?: number
}

export type PowerWeek = {
  id: string // "preseason" | "1" | "2" ...
  week: number // 0 = preseason
  label: string
  overall: PowerTeam[]
  // one entry per division, in division order
  divisions: { key: string; name: string; teams: PowerTeam[] }[]
}

export type PowerRankings =
  | { status: 'no-live' }
  | { status: 'no-week'; year: number }
  | {
      status: 'ok'
      year: number
      league_id: string
      season_id: string
      currentWeek: number
      hasDivisions: boolean
      hasProjections: boolean
      weights: { preseason: Record<string, number>; inseason: Record<string, number> }
      weeks: PowerWeek[]
    }

const PRESEASON_W = { win_pct: 20, pf_avg: 21, recent: 24, pedigree: 35 }
const INSEASON_DIV_W = { record: 33, pf: 30, form: 20, conf: 17 }
const INSEASON_NODIV_W = { record: 40, pf: 35, form: 25, conf: 0 }
// Share of the preseason (history) score still mixed in, by week.
const HISTORY_BLEND: Record<number, number> = { 1: 0.3, 2: 0.2, 3: 0.1 }

// Percentile of `value` within `pool`: fraction below + half the ties. 0–1.
function percentile(value: number, pool: number[]): number {
  if (pool.length <= 1) return 0.5
  let below = 0
  let equal = 0
  for (const v of pool) {
    if (v < value) below++
    else if (v === value) equal++
  }
  return (below + equal / 2) / pool.length
}

export async function getPowerRankings(slug: string): Promise<PowerRankings | null> {
  const db = createAdminClient()

  const { data: league } = await db
    .from('leagues')
    .select('id, division_names, is_udfa')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) return null
  // Power rankings is a paid-tier feature — UDFA (free) leagues never get it.
  if (league.is_udfa) return null
  const divisionNames: string[] = Array.isArray(league.division_names) ? league.division_names : []

  const { data: liveSeason } = await db
    .from('seasons')
    .select('id, year, settings, playoff_weeks')
    .eq('league_id', league.id)
    .eq('is_live', true)
    .maybeSingle()
  if (!liveSeason) return { status: 'no-live' }
  const currentWeek = resolveCurrentWeek((liveSeason.settings ?? {}) as Record<string, unknown>)
  if (currentWeek == null) return { status: 'no-week', year: liveSeason.year }

  const [{ data: seasons }, { data: managers }, { data: profiles }, { data: matchups }] = await Promise.all([
    db.from('seasons').select('id, year, champion_manager_id, settings').eq('league_id', league.id),
    db.from('managers').select('id, display_name, team_name, avatar_url, profile_id').eq('league_id', league.id),
    db.from('manager_profiles').select('id, canonical_name').eq('league_id', league.id),
    db.from('matchups').select('week, manager_a_id, manager_b_id, score_a, score_b').eq('season_id', liveSeason.id),
  ])
  // manager_seasons has no league_id column — filter by this league's season ids.
  const seasonIds = (seasons ?? []).map((s) => s.id)
  const { data: managerSeasons } = await db
    .from('manager_seasons')
    .select('season_id, manager_id, team_name, avatar_url, wins, losses, points_for, points_against, final_rank, division_index')
    .in('season_id', seasonIds.length > 0 ? seasonIds : ['00000000-0000-0000-0000-000000000000'])

  const seasonById = new Map((seasons ?? []).map((s) => [s.id, s]))
  const profileName = new Map((profiles ?? []).map((p) => [p.id, p.canonical_name]))
  const profileOf = new Map<string, string | null>()
  const managerInfo = new Map<string, { name: string; team: string | null; logo: string | null }>()
  for (const m of managers ?? []) {
    profileOf.set(m.id, m.profile_id ?? null)
    managerInfo.set(m.id, {
      name: (m.profile_id && profileName.get(m.profile_id)) || m.display_name,
      team: m.team_name ?? null,
      logo: m.avatar_url ?? null,
    })
  }

  // Live-season roster — the teams being ranked. Prefer manager_seasons rows
  // (they carry division + team name); if a freshly-synced season has none
  // yet, fall back to the distinct participants in its matchups.
  let liveRoster = (managerSeasons ?? []).filter((ms) => ms.season_id === liveSeason.id)
  if (liveRoster.length === 0) {
    const ids = new Set<string>()
    for (const m of matchups ?? []) { ids.add(m.manager_a_id); ids.add(m.manager_b_id) }
    liveRoster = [...ids].map((id) => ({
      season_id: liveSeason.id,
      manager_id: id,
      team_name: null,
      avatar_url: null,
      wins: 0,
      losses: 0,
      points_for: 0,
      points_against: 0,
      final_rank: null,
      division_index: null,
    }))
  }
  if (liveRoster.length === 0) return { status: 'no-week', year: liveSeason.year }

  // Team count per past season, to normalize finishes.
  const seasonSize = new Map<string, number>()
  for (const ms of managerSeasons ?? []) {
    seasonSize.set(ms.season_id, (seasonSize.get(ms.season_id) ?? 0) + 1)
  }

  // ── Career stats per profile (prior seasons only) ────────────────────────
  type Career = {
    wins: number; losses: number; pfTotal: number; seasons: number
    finishes: { year: number; norm: number }[] // normalized finish, 1=best
    champs: number; top3: number; playoffApps: number
  }
  const career = new Map<string, Career>()
  const ensureCareer = (pid: string): Career => {
    let c = career.get(pid)
    if (!c) {
      c = { wins: 0, losses: 0, pfTotal: 0, seasons: 0, finishes: [], champs: 0, top3: 0, playoffApps: 0 }
      career.set(pid, c)
    }
    return c
  }
  for (const ms of managerSeasons ?? []) {
    if (ms.season_id === liveSeason.id) continue
    const season = seasonById.get(ms.season_id)
    if (!season) continue
    const pid = profileOf.get(ms.manager_id)
    if (!pid) continue
    const c = ensureCareer(pid)
    c.wins += ms.wins ?? 0
    c.losses += ms.losses ?? 0
    c.pfTotal += Number(ms.points_for ?? 0)
    c.seasons++
    if (season.champion_manager_id === ms.manager_id) c.champs++
    const size = seasonSize.get(ms.season_id) ?? 12
    if (ms.final_rank != null) {
      if (ms.final_rank <= 3) c.top3++
      const playoffCut =
        (((season.settings ?? {}) as Record<string, unknown>).playoff_team_count as number | undefined) ?? 6
      if (ms.final_rank <= playoffCut) c.playoffApps++
      c.finishes.push({ year: season.year, norm: size > 1 ? (size - ms.final_rank) / (size - 1) : 0.5 })
    }
  }

  const hasDivisions = divisionNames.length > 0 && liveRoster.some((ms) => ms.division_index != null)

  // ── Per-team static (career + identity) ──────────────────────────────────
  type Base = {
    teamId: string
    name: string
    teamName: string
    logo: string | null
    divisionIdx: number | null
    careerWinPct: number
    pfPerSeason: number
    recentNorm: number // avg of last-3 normalized finishes, 0–1
    pedigreeRaw: number
  }
  const bases: Base[] = liveRoster.map((ms) => {
    const info = managerInfo.get(ms.manager_id)
    const pid = profileOf.get(ms.manager_id)
    const c = pid ? career.get(pid) : undefined
    const games = c ? c.wins + c.losses : 0
    const recent = c
      ? [...c.finishes].sort((a, b) => b.year - a.year).slice(0, 3)
      : []
    return {
      teamId: ms.manager_id,
      name: info?.name ?? 'Unknown',
      teamName: ms.team_name ?? info?.team ?? info?.name ?? 'Team',
      logo: ms.avatar_url ?? info?.logo ?? null,
      divisionIdx: ms.division_index ?? null,
      careerWinPct: games > 0 ? c!.wins / games : 0,
      pfPerSeason: c && c.seasons > 0 ? c.pfTotal / c.seasons : 0,
      recentNorm: recent.length > 0 ? recent.reduce((s, f) => s + f.norm, 0) / recent.length : 0,
      pedigreeRaw: c ? c.champs * 3 + c.top3 * 2 + c.playoffApps : 0,
    }
  })

  const pfSeasonPool = bases.map((b) => b.pfPerSeason)
  const pedigreePool = bases.map((b) => b.pedigreeRaw)

  // ── Which weeks have completed (all matchups scored) ─────────────────────
  const byWeek = new Map<number, typeof matchups>()
  for (const m of matchups ?? []) {
    const arr = byWeek.get(m.week) ?? []
    arr.push(m)
    byWeek.set(m.week, arr)
  }
  const completedWeeks: number[] = []
  for (let w = 1; w <= currentWeek; w++) {
    const games = byWeek.get(w) ?? []
    if (games.length > 0 && games.every((g) => g.score_a != null && g.score_b != null)) {
      completedWeeks.push(w)
    }
  }

  // ── Compute one snapshot (week N; 0 = preseason) ─────────────────────────
  const inSeasonW = hasDivisions ? INSEASON_DIV_W : INSEASON_NODIV_W

  function snapshot(throughWeek: number): PowerTeam[] {
    // Season aggregates from scored matchups up to `throughWeek`.
    type Agg = { w: number; l: number; pf: number; pa: number; weekResults: { week: number; win: 0 | 0.5 | 1 }[] }
    const agg = new Map<string, Agg>()
    const ensureAgg = (id: string): Agg => {
      let a = agg.get(id)
      if (!a) { a = { w: 0, l: 0, pf: 0, pa: 0, weekResults: [] }; agg.set(id, a) }
      return a
    }
    for (const b of bases) ensureAgg(b.teamId)
    for (let w = 1; w <= throughWeek; w++) {
      for (const g of byWeek.get(w) ?? []) {
        if (g.score_a == null || g.score_b == null) continue
        const sa = Number(g.score_a)
        const sb = Number(g.score_b)
        const a = ensureAgg(g.manager_a_id)
        const b = ensureAgg(g.manager_b_id)
        a.pf += sa; a.pa += sb
        b.pf += sb; b.pa += sa
        if (sa > sb) { a.w++; b.l++; a.weekResults.push({ week: w, win: 1 }); b.weekResults.push({ week: w, win: 0 }) }
        else if (sb > sa) { b.w++; a.l++; a.weekResults.push({ week: w, win: 0 }); b.weekResults.push({ week: w, win: 1 }) }
        else { a.weekResults.push({ week: w, win: 0.5 }); b.weekResults.push({ week: w, win: 0.5 }) }
      }
    }

    const seasonPfPool = bases.map((b) => agg.get(b.teamId)!.pf)

    // Division rank (by season win%, then PF) for the conference factor.
    const divRank = new Map<string, { rank: number; size: number }>()
    if (hasDivisions) {
      const byDiv = new Map<number, Base[]>()
      for (const b of bases) {
        const d = b.divisionIdx ?? -1
        const arr = byDiv.get(d) ?? []
        arr.push(b)
        byDiv.set(d, arr)
      }
      for (const [, group] of byDiv) {
        const ranked = [...group].sort((x, y) => {
          const ax = agg.get(x.teamId)!
          const ay = agg.get(y.teamId)!
          const wpx = ax.w + ax.l > 0 ? ax.w / (ax.w + ax.l) : 0
          const wpy = ay.w + ay.l > 0 ? ay.w / (ay.w + ay.l) : 0
          return wpy - wpx || ay.pf - ax.pf
        })
        ranked.forEach((b, i) => divRank.set(b.teamId, { rank: i + 1, size: group.length }))
      }
    }

    const blend = throughWeek === 0 ? 1 : HISTORY_BLEND[throughWeek] ?? 0

    const teams: Omit<PowerTeam, 'rank' | 'delta'>[] = bases.map((b) => {
      const a = agg.get(b.teamId)!
      const games = a.w + a.l
      const winPct = games > 0 ? a.w / games : 0

      // Preseason factors.
      const preFactors: PowerFactors = {
        win_pct: b.careerWinPct * PRESEASON_W.win_pct,
        pf_avg: percentile(b.pfPerSeason, pfSeasonPool) * PRESEASON_W.pf_avg,
        recent: b.recentNorm * PRESEASON_W.recent,
        pedigree: percentile(b.pedigreeRaw, pedigreePool) * PRESEASON_W.pedigree,
      }
      const preScore = (preFactors.win_pct ?? 0) + (preFactors.pf_avg ?? 0) + (preFactors.recent ?? 0) + (preFactors.pedigree ?? 0)

      // Form: win% over the last 3 completed weeks.
      const last3 = [...a.weekResults].sort((x, y) => y.week - x.week).slice(0, 3)
      const formPct = last3.length > 0 ? last3.reduce((s, r) => s + r.win, 0) / last3.length : 0
      const dr = divRank.get(b.teamId)
      const confNorm = dr && dr.size > 1 ? (dr.size - dr.rank) / (dr.size - 1) : 0

      const inFactors: PowerFactors = {
        record: winPct * inSeasonW.record,
        pf: percentile(a.pf, seasonPfPool) * inSeasonW.pf,
        form: formPct * inSeasonW.form,
        conf: confNorm * inSeasonW.conf,
      }
      const inScore = (inFactors.record ?? 0) + (inFactors.pf ?? 0) + (inFactors.form ?? 0) + (inFactors.conf ?? 0)

      const score = blend * preScore + (1 - blend) * inScore
      const factors = throughWeek === 0 ? preFactors : inFactors

      return {
        team_id: b.teamId,
        team_name: b.teamName,
        manager: b.name,
        logo: b.logo,
        division: b.divisionIdx != null ? b.divisionIdx + 1 : null,
        division_name: b.divisionIdx != null ? divisionNames[b.divisionIdx] ?? null : null,
        wins: a.w,
        losses: a.l,
        pf: Math.round(a.pf * 10) / 10,
        pa: Math.round(a.pa * 10) / 10,
        score: Math.round(score * 100) / 100,
        factors: Object.fromEntries(
          Object.entries(factors).map(([k, v]) => [k, Math.round((v as number) * 100) / 100]),
        ),
        conf_rank: dr?.rank,
      }
    })

    teams.sort((x, y) => y.score - x.score)
    return teams.map((t, i) => ({ ...t, rank: i + 1, delta: 0 }))
  }

  // Snapshots: preseason + each completed week.
  const snapshotWeeks = [0, ...completedWeeks]
  const rankingByWeek = new Map<number, PowerTeam[]>()
  for (const w of snapshotWeeks) rankingByWeek.set(w, snapshot(w))

  // Delta = previous snapshot's rank minus this one's (positive = moved up).
  const weeks: PowerWeek[] = snapshotWeeks.map((w, idx) => {
    const teams = rankingByWeek.get(w)!
    const prev = idx > 0 ? rankingByWeek.get(snapshotWeeks[idx - 1]!) : null
    const prevRank = new Map(prev?.map((t) => [t.team_id, t.rank]))
    for (const t of teams) {
      const before = prevRank.get(t.team_id)
      t.delta = before != null ? before - t.rank : 0
    }
    const divisions = hasDivisions
      ? divisionNames.map((name, i) => ({
          key: name.toLowerCase().replace(/\s+/g, '-'),
          name,
          teams: teams
            .filter((t) => t.division === i + 1)
            .map((t, j) => ({ ...t, conf_rank: j + 1 })),
        }))
      : []
    return {
      id: w === 0 ? 'preseason' : String(w),
      week: w,
      label: w === 0 ? 'Pre-Season' : `Week ${w}`,
      overall: teams,
      divisions,
    }
  })

  // ── Monte Carlo projections ──────────────────────────────────────────────
  const playoffWeeks: number[] = Array.isArray(liveSeason.playoff_weeks) ? liveSeason.playoff_weeks : []
  const playoffStart = playoffWeeks.length > 0 ? Math.min(...playoffWeeks) : 15
  const remaining = (matchups ?? [])
    .filter((m) => m.week >= 1 && m.week < playoffStart && (m.score_a == null || m.score_b == null))
    .map((m) => ({ a: m.manager_a_id, b: m.manager_b_id }))

  let hasProjections = false
  if (remaining.length > 0 && weeks.length > 0) {
    const latest = weeks[weeks.length - 1]!.overall
    const baseById = new Map(bases.map((b) => [b.teamId, b]))
    const teamPpg = new Map<string, number>()
    const ppgVals: number[] = []
    for (const t of latest) {
      const games = t.wins + t.losses
      let ppg = games > 0 ? t.pf / games : 0
      if (ppg === 0) {
        const b = baseById.get(t.team_id)
        ppg = b && b.pfPerSeason > 0 ? b.pfPerSeason / 14 : 0
      }
      teamPpg.set(t.team_id, ppg)
      if (ppg > 0) ppgVals.push(ppg)
    }
    const leagueAvgPpg = ppgVals.length > 0 ? ppgVals.reduce((s, v) => s + v, 0) / ppgVals.length : 105

    const scores: number[] = []
    for (const w of completedWeeks) {
      for (const g of byWeek.get(w) ?? []) {
        if (g.score_a != null) scores.push(Number(g.score_a))
        if (g.score_b != null) scores.push(Number(g.score_b))
      }
    }
    let scoreSd = 22
    if (scores.length >= 4) {
      const mean = scores.reduce((s, v) => s + v, 0) / scores.length
      scoreSd = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length)
    }

    const teamCount = bases.length
    const playoffTeams =
      (((liveSeason.settings ?? {}) as Record<string, unknown>).playoff_team_count as number | undefined) ??
      (teamCount >= 10 ? 6 : Math.max(2, Math.round(teamCount / 2)))
    const byeTeams = playoffTeams === 6 ? 2 : 0

    const simTeams = latest.map((t) => ({
      teamId: t.team_id,
      division: t.division,
      ppg: teamPpg.get(t.team_id) || leagueAvgPpg,
      startWins: t.wins,
      startLosses: t.losses,
      startPf: t.pf,
    }))
    const projections = simulateSeason(simTeams, remaining, { scoreSd, playoffTeams, byeTeams, runs: 8000 })

    const attach = (t: PowerTeam) => {
      const p = projections.get(t.team_id)
      if (!p) return
      t.proj_wins = p.proj_wins
      t.proj_losses = p.proj_losses
      t.playoff_pct = p.playoff_pct
      t.bye_pct = p.bye_pct
      t.conf_win_pct = p.conf_win_pct
    }
    for (const wk of weeks) {
      wk.overall.forEach(attach)
      wk.divisions.forEach((d) => d.teams.forEach(attach))
    }
    hasProjections = true
  }

  return {
    status: 'ok',
    year: liveSeason.year,
    league_id: league.id,
    season_id: liveSeason.id,
    currentWeek,
    hasDivisions,
    hasProjections,
    weights: { preseason: PRESEASON_W, inseason: inSeasonW },
    weeks,
  }
}
