// Clubhouse Trade Room engine — the league Trade Analyzer minus the league.
//
// Reuses the same consensus value engine the in-league Trade Desk runs on
// (valuateLeague → blended FantasyCalc/KTC/DP/FP/Sleeper values), but takes
// its inputs from hand-entered player ids instead of synced rosters.
//
// Two analysis modes:
//   QUICK  — sides only. Grade = raw consensus-value delta between what
//            each side sends. Same rubric the league Analyzer used before
//            it went starter-aware.
//   ROSTER — both full rosters provided. Grade = change in each team's
//            optimal STARTING LINEUP value before vs after the trade
//            (greedy fill over configurable slots), which captures need
//            and scarcity the way the in-league Analyzer does.

import { z } from 'zod'
import { valuateLeague, type LeagueMode, type PlayerValue } from '@/lib/values'
import { getPlayersMap } from '@/lib/sleeperPlayers'

// Request schema shared by the analyze + publish routes (route files can
// only export handlers, so the schema lives here).
export const AnalyzeBody = z.object({
  settings: z.object({
    mode: z.enum(['redraft', 'keeper', 'dynasty']),
    qbStarters: z.union([z.literal(1), z.literal(2)]),
    teamCount: z.number().int().min(4).max(32),
  }),
  sideA: z.array(z.string().min(1)).min(1).max(10),
  sideB: z.array(z.string().min(1)).min(1).max(10),
  rosterA: z.array(z.string().min(1)).max(60).optional(),
  rosterB: z.array(z.string().min(1)).max(60).optional(),
  slots: z
    .object({
      QB: z.number().int().min(0).max(3),
      RB: z.number().int().min(0).max(5),
      WR: z.number().int().min(0).max(5),
      TE: z.number().int().min(0).max(3),
      FLEX: z.number().int().min(0).max(5),
      SF: z.number().int().min(0).max(2),
    })
    .optional(),
})
export type AnalyzeBodyType = z.infer<typeof AnalyzeBody>

// Roster mode requires BOTH rosters, and each side's sends must come from
// its own roster or the lineup math would invent players. Returns an error
// string or null.
export function validateRosterMode(body: AnalyzeBodyType): string | null {
  const usesRosters = !!(body.rosterA?.length && body.rosterB?.length)
  if (!usesRosters) return null
  const ra = new Set(body.rosterA)
  const rb = new Set(body.rosterB)
  if (!body.sideA.every((id) => ra.has(id)) || !body.sideB.every((id) => rb.has(id))) {
    return 'In roster mode, each side can only send players from its own roster.'
  }
  return null
}

export type HubTradeSettings = {
  mode: LeagueMode
  qbStarters: 1 | 2
  teamCount: number
}

export type HubLineupSlots = {
  QB: number
  RB: number
  WR: number
  TE: number
  FLEX: number
  SF: number
}

export const DEFAULT_SLOTS: HubLineupSlots = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SF: 0 }

export type HubAsset = {
  id: string
  name: string
  position: string
  team: string | null
  value: number
}

export type HubSideResult = {
  assets: HubAsset[]
  total: number
  grade: string
  verdict: string
  /** Roster mode only — starting lineup value before/after the swap */
  starterBefore: number | null
  starterAfter: number | null
}

export type HubAnalysis = {
  mode: LeagueMode
  qbStarters: 1 | 2
  teamCount: number
  usesRosters: boolean
  /** Positive = side B sends more value (side A wins the swap) */
  deltaPct: number
  valuationLabel: string
  sideA: HubSideResult
  sideB: HubSideResult
  /** Roster mode only — the full hand-entered rosters, resolved, so the
      docket can show team trades with their context. */
  rosterAssetsA: HubAsset[] | null
  rosterAssetsB: HubAsset[] | null
}

// Raw value rubric (quick mode) — same scale the league analyze-trade
// route used for pure asset-delta grading.
function gradeRaw(p: number): string {
  if (p >= 0.18) return 'A+'
  if (p >= 0.12) return 'A'
  if (p >= 0.05) return 'A-'
  if (p >= 0.02) return 'B+'
  if (p > -0.02) return 'B'
  if (p > -0.05) return 'B-'
  if (p > -0.08) return 'C+'
  if (p > -0.12) return 'C'
  if (p > -0.2) return 'D'
  return 'F'
}

// Starter-impact rubric (roster mode) — matches the in-league Analyzer's
// grade lock scale.
function gradeStarter(p: number): string {
  if (p >= 0.25) return 'A+'
  if (p >= 0.15) return 'A'
  if (p >= 0.08) return 'A-'
  if (p >= 0.03) return 'B+'
  if (p > -0.03) return 'B'
  if (p > -0.08) return 'B-'
  if (p > -0.15) return 'C+'
  if (p > -0.25) return 'C'
  if (p > -0.4) return 'D'
  return 'F'
}

// Deterministic one-liners (no Groq dependency — the Trade Room analyzes
// on every keypress-ish cadence; blurbs stay cheap and instant).
function verdictLine(pct: number, usesRosters: boolean): string {
  const abs = Math.abs(pct)
  const lens = usesRosters ? 'lineup' : 'value'
  if (abs < 0.03) return usesRosters ? 'Starting lineup barely moves. A true coin flip.' : 'Essentially even on consensus value.'
  if (pct > 0 && abs < 0.08) return usesRosters ? 'Nudges the starting lineup forward.' : 'A slight value win on paper.'
  if (pct > 0 && abs < 0.15) return usesRosters ? 'Real lineup upgrade. The starters get better.' : 'Comes out ahead on raw value.'
  if (pct > 0) return usesRosters ? 'Transforms the starting lineup. A clear heist.' : 'Clear value haul. Wins on paper.'
  if (abs < 0.08) return `Gives up a touch of ${lens}.`
  if (abs < 0.15) return `Loses noticeably on ${lens}.`
  return usesRosters ? 'The starting lineup takes a real hit.' : 'Loses badly on raw value.'
}

// Greedy optimal-lineup value: fixed slots from most restrictive first,
// then SF (QB-eligible), then FLEX. Mirrors the Best Coach fill order.
function lineupValue(
  ids: string[],
  values: Map<string, PlayerValue>,
  slots: HubLineupSlots
): number {
  const pool: { position: string; value: number }[] = []
  for (const id of ids) {
    const v = values.get(id)
    if (v && ['QB', 'RB', 'WR', 'TE'].includes(v.position)) {
      pool.push({ position: v.position, value: v.value })
    }
  }
  pool.sort((a, b) => b.value - a.value)
  const used = new Set<number>()
  let total = 0

  const take = (eligible: string[], count: number) => {
    let taken = 0
    for (let i = 0; i < pool.length && taken < count; i++) {
      if (used.has(i)) continue
      if (!eligible.includes(pool[i].position)) continue
      used.add(i)
      total += pool[i].value
      taken++
    }
  }

  take(['QB'], slots.QB)
  take(['TE'], slots.TE)
  take(['RB'], slots.RB)
  take(['WR'], slots.WR)
  take(['QB', 'RB', 'WR', 'TE'], slots.SF)
  take(['RB', 'WR', 'TE'], slots.FLEX)
  return total
}

export async function analyzeHubTrade(args: {
  settings: HubTradeSettings
  sideA: string[]
  sideB: string[]
  rosterA?: string[] | null
  rosterB?: string[] | null
  slots?: HubLineupSlots | null
}): Promise<HubAnalysis> {
  const { settings } = args
  const [result, players] = await Promise.all([
    valuateLeague({
      mode: settings.mode,
      qbStarters: settings.qbStarters,
      teamCount: settings.teamCount,
    }),
    // Identity fallback: the value engine only carries players a provider
    // has priced — deep-bench guys (the search still offers them) resolve
    // their name/position from the lean dictionary and trade at 0.
    getPlayersMap(),
  ])

  const toAsset = (id: string): HubAsset => {
    const v = result.values.get(id)
    const p = players[id]
    return {
      id,
      name: v?.name ?? p?.name ?? 'Unknown player',
      position: v?.position ?? p?.position ?? '—',
      team: v?.team ?? p?.team ?? null,
      value: Math.round(v?.value ?? 0),
    }
  }

  const assetsA = args.sideA.map(toAsset)
  const assetsB = args.sideB.map(toAsset)
  const totalA = assetsA.reduce((s, a) => s + a.value, 0)
  const totalB = assetsB.reduce((s, a) => s + a.value, 0)

  const usesRosters = !!(args.rosterA?.length && args.rosterB?.length)

  let deltaPct: number
  let gradeA: string, gradeB: string
  let starterA: { before: number; after: number } | null = null
  let starterB: { before: number; after: number } | null = null

  if (usesRosters) {
    const slots = args.slots ?? DEFAULT_SLOTS
    const rosterA = args.rosterA!
    const rosterB = args.rosterB!
    const sendA = new Set(args.sideA)
    const sendB = new Set(args.sideB)
    const afterA = rosterA.filter((id) => !sendA.has(id)).concat(args.sideB)
    const afterB = rosterB.filter((id) => !sendB.has(id)).concat(args.sideA)

    const beforeAVal = lineupValue(rosterA, result.values, slots)
    const afterAVal = lineupValue(afterA, result.values, slots)
    const beforeBVal = lineupValue(rosterB, result.values, slots)
    const afterBVal = lineupValue(afterB, result.values, slots)

    const pctA = (afterAVal - beforeAVal) / Math.max(beforeAVal, 1)
    const pctB = (afterBVal - beforeBVal) / Math.max(beforeBVal, 1)
    deltaPct = pctA - pctB
    gradeA = gradeStarter(pctA)
    gradeB = gradeStarter(pctB)
    starterA = { before: Math.round(beforeAVal), after: Math.round(afterAVal) }
    starterB = { before: Math.round(beforeBVal), after: Math.round(afterBVal) }

    return {
      mode: settings.mode,
      qbStarters: settings.qbStarters,
      teamCount: settings.teamCount,
      usesRosters,
      deltaPct,
      valuationLabel: result.providerLabel,
      sideA: {
        assets: assetsA, total: totalA, grade: gradeA,
        verdict: verdictLine(pctA, true),
        starterBefore: starterA.before, starterAfter: starterA.after,
      },
      sideB: {
        assets: assetsB, total: totalB, grade: gradeB,
        verdict: verdictLine(pctB, true),
        starterBefore: starterB.before, starterAfter: starterB.after,
      },
      rosterAssetsA: rosterA.map(toAsset),
      rosterAssetsB: rosterB.map(toAsset),
    }
  }

  // Quick mode — side A receives what side B sends and vice versa.
  const avg = Math.max((totalA + totalB) / 2, 1)
  deltaPct = (totalB - totalA) / avg
  gradeA = gradeRaw(deltaPct)
  gradeB = gradeRaw(-deltaPct)

  return {
    mode: settings.mode,
    qbStarters: settings.qbStarters,
    teamCount: settings.teamCount,
    usesRosters: false,
    deltaPct,
    valuationLabel: result.providerLabel,
    sideA: {
      assets: assetsA, total: totalA, grade: gradeA,
      verdict: verdictLine(deltaPct, false),
      starterBefore: null, starterAfter: null,
    },
    sideB: {
      assets: assetsB, total: totalB, grade: gradeB,
      verdict: verdictLine(-deltaPct, false),
      starterBefore: null, starterAfter: null,
    },
    rosterAssetsA: null,
    rosterAssetsB: null,
  }
}
