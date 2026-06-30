// Power rankings for the live season — v2 formula.
//
// A ranking snapshot is computed for the preseason (week 0) and after each
// completed week. Each team gets a 0–100 score from a weighted formula:
//
//   Preseason (career history, weeks 0–3, blended out):
//     Win% 22 · PF Avg 22 · Recent 24 · Pedigree 32
//   In-season (week 4+):
//     Record-SOS 23 · PF 27 · Form 20 · Conference 12 · Top-Half 18
//     (no divisions → Record-SOS 27 · PF 30 · Form 23 · Top-Half 20)
//   Weeks 1–3 use reduced in-season factor sets so the preseason history
//   can fill the gap (history weight 40 / 25 / 10). Form is excluded
//   until week 4 (with <3 games it's identical to Record); Conf joins at
//   week 3 for division leagues only.
//
// v2 improvements over v1:
// - Record-SOS: win% multiplied by 0.85 + 0.30 × avg-opponent-PF-percentile.
//   Round-robin leagues already have low SOS variance, so the multiplier
//   only nudges ±15%.
// - PF uses PPG (bye-week aware) percentile, not raw season PF.
// - Form combines W/L AND margin: 60% result + 40% point-diff percentile,
//   over the last 3 weeks weighted .5/.3/.2.
// - Top-Half Rate: % of weeks the team's score beat that week's league
//   median. Schedule-independent measure of real strength.
// - Smooth preseason slide: pedigree contribution fades to zero by week 4
//   instead of snapping off.
//
// Everything derives from manager_seasons (career) + the live season's
// matchups (in-season) — no extra ingest. Monte Carlo projections are added
// separately (see src/lib/powerSim.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentWeek } from '@/lib/liveSeason'
import { simulateSeason } from '@/lib/powerSim'

export type PowerFactors = {
  // preseason (weeks 0–3, blended down)
  win_pct?: number
  pf_avg?: number
  recent?: number
  pedigree?: number
  // in-season (weeks 1+, blended up)
  record?: number   // SOS-adjusted win%
  pf?: number       // PPG percentile (bye-aware)
  form?: number     // 60% W/L + 40% point-diff percentile, last 3 weighted .5/.3/.2
  conf?: number     // div win% (zero when no divisions)
  top_half?: number // share of weeks scored above weekly league median
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
  // Pre-season carryover contribution for W1–3 only: each preseason factor
  // multiplied by the active blend (0.30 / 0.20 / 0.10), so values are in
  // the same "points contributed" units as `factors`. Omitted in W0 (where
  // `factors` IS the preseason set) and W4+ (no carryover).
  preseasonFactors?: PowerFactors
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
  // In-season factor max-points used for this snapshot. Varies week 1–3 (form
  // / conf phased in) and matches INSEASON_*_W from week 4 on. The UI uses
  // this to size the factor bars and to hide bars whose max is 0.
  inseasonWeights: Record<string, number>
  // Pre-season carryover factor max-points for W1–3 (each PRESEASON_W key
  // scaled by the blend), so the UI can size carryover bars. Omitted in
  // W0 and W4+.
  preseasonWeights?: Record<string, number>
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

type InSeasonW = { record: number; pf: number; form: number; conf: number; top_half: number }

const PRESEASON_W = { win_pct: 22, pf_avg: 22, recent: 24, pedigree: 32 }
// Week 4+ canonical weights — sum to 100. Earlier weeks use reduced subsets
// (form excluded until week 4; conf joins at week 3 for div leagues) and
// the remainder is filled by preseason history (see preseasonBlend).
const INSEASON_DIV_W   : InSeasonW = { record: 23, pf: 27, form: 20, conf: 12, top_half: 18 }
const INSEASON_NODIV_W : InSeasonW = { record: 27, pf: 30, form: 23, conf: 0,  top_half: 20 }
// Sums: 60 / 75 / 90 — the gap to 100 is filled by preseasonBlend.
const INSEASON_DIV_W1  : InSeasonW = { record: 20, pf: 22, form: 0,  conf: 0,  top_half: 18 }
const INSEASON_DIV_W2  : InSeasonW = { record: 25, pf: 30, form: 0,  conf: 0,  top_half: 20 }
const INSEASON_DIV_W3  : InSeasonW = { record: 29, pf: 32, form: 0,  conf: 7,  top_half: 22 }
const INSEASON_NODIV_W1: InSeasonW = { record: 20, pf: 22, form: 0,  conf: 0,  top_half: 18 }
const INSEASON_NODIV_W2: InSeasonW = { record: 25, pf: 30, form: 0,  conf: 0,  top_half: 20 }
const INSEASON_NODIV_W3: InSeasonW = { record: 30, pf: 35, form: 0,  conf: 0,  top_half: 25 }
const INSEASON_ZERO    : InSeasonW = { record: 0,  pf: 0,  form: 0,  conf: 0,  top_half: 0 }

function inSeasonWeightsFor(throughWeek: number, hasDivisions: boolean): InSeasonW {
  if (throughWeek <= 0) return INSEASON_ZERO
  if (hasDivisions) {
    if (throughWeek === 1) return INSEASON_DIV_W1
    if (throughWeek === 2) return INSEASON_DIV_W2
    if (throughWeek === 3) return INSEASON_DIV_W3
    return INSEASON_DIV_W
  }
  if (throughWeek === 1) return INSEASON_NODIV_W1
  if (throughWeek === 2) return INSEASON_NODIV_W2
  if (throughWeek === 3) return INSEASON_NODIV_W3
  return INSEASON_NODIV_W
}

// Preseason history weight by week: 1.0 / 0.40 / 0.25 / 0.10 / 0.
// Pairs with inSeasonWeightsFor so the two sources always sum to 100.
function preseasonBlend(throughWeek: number): number {
  if (throughWeek <= 0) return 1.0
  if (throughWeek === 1) return 0.40
  if (throughWeek === 2) return 0.25
  if (throughWeek === 3) return 0.10
  return 0.0
}

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

  function snapshot(throughWeek: number): PowerTeam[] {
    // Per-week weight set: subsets in W1–3 (form / conf phased in), full
    // canonical at W4+. Used both to weight factor contributions and to
    // shape inFactors so the UI can hide bars for inactive factors.
    const inSeasonW = inSeasonWeightsFor(throughWeek, hasDivisions)
    // Season aggregates from scored matchups up to `throughWeek`. We track
    // the full game list (score / opp score / opp id) so SOS, margin-form,
    // and top-half rate can derive from it.
    type Game = { week: number; result: 0 | 0.5 | 1; score: number; oppScore: number; oppId: string }
    type Agg = { w: number; l: number; pf: number; pa: number; games: Game[] }
    const agg = new Map<string, Agg>()
    const ensureAgg = (id: string): Agg => {
      let a = agg.get(id)
      if (!a) { a = { w: 0, l: 0, pf: 0, pa: 0, games: [] }; agg.set(id, a) }
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
        const resultA: 0 | 0.5 | 1 = sa > sb ? 1 : sa < sb ? 0 : 0.5
        const resultB: 0 | 0.5 | 1 = sb > sa ? 1 : sb < sa ? 0 : 0.5
        if (resultA === 1) { a.w++; b.l++ }
        else if (resultB === 1) { b.w++; a.l++ }
        a.games.push({ week: w, result: resultA, score: sa, oppScore: sb, oppId: g.manager_b_id })
        b.games.push({ week: w, result: resultB, score: sb, oppScore: sa, oppId: g.manager_a_id })
      }
    }

    // Per-team season totals — needed both for the PF factor and as the
    // SOS pool (each opponent's PF percentile is read from this).
    const seasonPfPool = bases.map((b) => agg.get(b.teamId)!.pf)

    // Bye-aware PPG pool for the PF factor.
    const ppgPool = bases.map((b) => {
      const a = agg.get(b.teamId)!
      const games = a.w + a.l
      return games > 0 ? a.pf / games : 0
    })

    // League-wide margin pool — used to percentile a single game's
    // point-differential for the Form factor.
    const marginPool: number[] = []
    for (const b of bases) {
      for (const g of agg.get(b.teamId)!.games) marginPool.push(g.score - g.oppScore)
    }

    // League weekly medians — Top-Half rate counts the weeks a team
    // scored above the median of that week's scores (including its own).
    const weeklyMedian = new Map<number, number>()
    for (let wk = 1; wk <= throughWeek; wk++) {
      const scores: number[] = []
      for (const g of byWeek.get(wk) ?? []) {
        if (g.score_a == null || g.score_b == null) continue
        scores.push(Number(g.score_a))
        scores.push(Number(g.score_b))
      }
      if (scores.length === 0) continue
      scores.sort((x, y) => x - y)
      const mid = scores.length / 2
      weeklyMedian.set(
        wk,
        Number.isInteger(mid) ? (scores[mid - 1]! + scores[mid]!) / 2 : scores[Math.floor(mid)]!,
      )
    }

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

    const blend = preseasonBlend(throughWeek)

    const teams: Omit<PowerTeam, 'rank' | 'delta'>[] = bases.map((b) => {
      const a = agg.get(b.teamId)!
      const games = a.w + a.l
      const winPct = games > 0 ? a.w / games : 0
      const ppg = games > 0 ? a.pf / games : 0

      // Preseason factors.
      const preFactors: PowerFactors = {
        win_pct: b.careerWinPct * PRESEASON_W.win_pct,
        pf_avg: percentile(b.pfPerSeason, pfSeasonPool) * PRESEASON_W.pf_avg,
        recent: b.recentNorm * PRESEASON_W.recent,
        pedigree: percentile(b.pedigreeRaw, pedigreePool) * PRESEASON_W.pedigree,
      }
      const preScore = (preFactors.win_pct ?? 0) + (preFactors.pf_avg ?? 0) + (preFactors.recent ?? 0) + (preFactors.pedigree ?? 0)

      // Record-SOS: scale season win% by avg opponent PF percentile.
      // Multiplier ranges 0.85 (faced the basement) → 1.15 (faced the
      // contenders); capped at 1.0 so the factor stays in [0, max].
      let sosMult = 1.0
      if (a.games.length > 0) {
        let sum = 0
        for (const g of a.games) {
          const oppAgg = agg.get(g.oppId)
          sum += oppAgg ? percentile(oppAgg.pf, seasonPfPool) : 0.5
        }
        const avgSos = sum / a.games.length
        sosMult = 0.85 + 0.30 * avgSos
      }
      const recordSos = Math.min(1, winPct * sosMult)

      // Form: last 3 games weighted .5/.3/.2, each scored 60% W/L + 40%
      // point-diff percentile. Empty → 0; partial (1–2 games) renormalizes
      // by the weight actually consumed.
      const last3 = [...a.games].sort((x, y) => y.week - x.week).slice(0, 3)
      const formWeights = [0.5, 0.3, 0.2]
      let formNum = 0
      let formDen = 0
      for (let i = 0; i < last3.length; i++) {
        const g = last3[i]!
        const w = formWeights[i] ?? 0
        const marginPct = percentile(g.score - g.oppScore, marginPool)
        formNum += w * (0.6 * g.result + 0.4 * marginPct)
        formDen += w
      }
      const formPct = formDen > 0 ? formNum / formDen : 0

      // Top-Half rate: share of weeks scored strictly above the league
      // weekly median (ties count as half — same convention as percentile).
      let topHalfRate = 0
      if (a.games.length > 0) {
        let credit = 0
        for (const g of a.games) {
          const m = weeklyMedian.get(g.week)
          if (m == null) continue
          if (g.score > m) credit += 1
          else if (g.score === m) credit += 0.5
        }
        topHalfRate = credit / a.games.length
      }

      const dr = divRank.get(b.teamId)
      const confNorm = dr && dr.size > 1 ? (dr.size - dr.rank) / (dr.size - 1) : 0

      const inFactors: PowerFactors = {
        record: recordSos * inSeasonW.record,
        pf: percentile(ppg, ppgPool) * inSeasonW.pf,
        form: formPct * inSeasonW.form,
        conf: confNorm * inSeasonW.conf,
        top_half: topHalfRate * inSeasonW.top_half,
      }
      const inScore =
        (inFactors.record ?? 0) + (inFactors.pf ?? 0) + (inFactors.form ?? 0) +
        (inFactors.conf ?? 0) + (inFactors.top_half ?? 0)

      // Per-week inSeasonW sums to (100 × (1 − blend)), so adding the
      // history contribution gives a 0–100 score without rescaling.
      const score = blend * preScore + inScore
      const factors = throughWeek === 0 ? preFactors : inFactors

      // For W1–3, expose the preseason factors scaled by `blend` so the UI
      // can show carryover contributions in the same "points" units as the
      // in-season bars. Skipped at W0 (factors already IS preseason) and
      // W4+ (no carryover).
      const showCarryover = throughWeek >= 1 && throughWeek <= 3
      const preseasonFactors: PowerFactors | undefined = showCarryover
        ? {
            win_pct: (preFactors.win_pct ?? 0) * blend,
            pf_avg: (preFactors.pf_avg ?? 0) * blend,
            recent: (preFactors.recent ?? 0) * blend,
            pedigree: (preFactors.pedigree ?? 0) * blend,
          }
        : undefined

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
        preseasonFactors: preseasonFactors
          ? Object.fromEntries(
              Object.entries(preseasonFactors).map(([k, v]) => [k, Math.round((v as number) * 100) / 100]),
            )
          : undefined,
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
    const wkBlend = preseasonBlend(w)
    const preseasonWeights = w >= 1 && w <= 3
      ? {
          win_pct: Math.round(PRESEASON_W.win_pct * wkBlend * 100) / 100,
          pf_avg: Math.round(PRESEASON_W.pf_avg * wkBlend * 100) / 100,
          recent: Math.round(PRESEASON_W.recent * wkBlend * 100) / 100,
          pedigree: Math.round(PRESEASON_W.pedigree * wkBlend * 100) / 100,
        }
      : undefined
    return {
      id: w === 0 ? 'preseason' : String(w),
      week: w,
      label: w === 0 ? 'Pre-Season' : `Week ${w}`,
      inseasonWeights: inSeasonWeightsFor(w, hasDivisions) as unknown as Record<string, number>,
      preseasonWeights,
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
    // Canonical W4+ in-season maxes for fallback/UI labels. Per-snapshot
    // weights live on each PowerWeek as `inseasonWeights`.
    weights: { preseason: PRESEASON_W, inseason: hasDivisions ? INSEASON_DIV_W : INSEASON_NODIV_W },
    weeks,
  }
}
