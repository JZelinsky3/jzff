// Trade Desk Analyzer — positional depth engine.
//
// For every team in the league, slot their roster's players into starter
// tiers per position, sum the starter values, then rank teams 1..N at
// each position. Composite roster strength is a 0–100 weighted sum.
//
// Used by:
//   • The Analyzer endpoint to compute Team A + Team B's depth BEFORE
//     and AFTER a proposed trade — drives the "RB rank 8→5 ▲3" UI bits
//     and feeds the Groq narrative as positional context.
//   • The Roster Room (Phase 6) to render the full league strength
//     table without re-deriving the same numbers.
//
// Defaults:
//   • If effective.rosterSlots doesn't override a position, we fall back
//     to a common starter shape (QB 1, RB 2, WR 2, TE 1, FLEX 1, K 1,
//     DEF 1, SF 0). FLEX is treated as +1 to whichever of RB/WR/TE is
//     the team's deepest at the moment of slotting — we don't fight it.

import type { AnalyzerRoster, AnalyzerPlayer } from './analyzer'
import type { EffectiveSettings, RosterSlots } from './settings'
import type { PlayerValue } from '@/lib/values'

// ── Public types ─────────────────────────────────────────────────────────

export type PositionKey = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF'
const POSITIONS: PositionKey[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export type TeamPositionDepth = {
  position: PositionKey
  // Total value of the players slotted into the starter tier at this
  // position (accounting for FLEX and SUPER_FLEX where applicable).
  starterValue: number
  // 1..N where 1 = best in the league at this position. Lower = better.
  leagueRank: number
  // 1..10 scaled score relative to the league. 10 = league-best.
  // Derived from leagueRank so the UI can show a tidy number without
  // re-implementing the rank → score curve in the client.
  score10: number
}

export type TeamDepthSnapshot = {
  ownerId: string
  byPosition: Record<PositionKey, TeamPositionDepth>
  // Separate FLEX + SF buckets so per-position values stay stable. A
  // trade that shifts only RB depth won't ripple into the TE position
  // ranking — TE rank now only changes when actual TE players change
  // hands.
  flexValue: number
  sfValue: number
  // Weighted composite 0–100. Weights match the starter slot count at
  // each position so the overall number reflects how much each
  // position matters in this league's lineup.
  compositeStrength: number
  overallLeagueRank: number
  // Sleeper ids of every starter in lineup order (QB → RB → WR → TE → K
  // → DEF → FLEX → SF). Picked by VALUE in slotTeam — the analyzer
  // route uses these ids to sum REAL projection ppg for the same lineup.
  starterIds: string[]
}

export type LeagueDepthSnapshot = {
  byOwnerId: Record<string, TeamDepthSnapshot>
}

// ── Slot defaults ────────────────────────────────────────────────────────

export function defaultSlots(eff: EffectiveSettings): Required<Pick<RosterSlots, 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'SF' | 'K' | 'DEF'>> {
  const o = eff.rosterSlots ?? {}
  return {
    QB:   o.QB   ?? 1,
    RB:   o.RB   ?? 2,
    WR:   o.WR   ?? 2,
    TE:   o.TE   ?? 1,
    FLEX: o.FLEX ?? 1,
    SF:   o.SF   ?? (eff.lineupType === 'SUPERFLEX' ? 1 : 0),
    K:    o.K    ?? 1,
    DEF:  o.DEF  ?? 1,
  }
}

// ── Roster slotting ──────────────────────────────────────────────────────
//
// Given one team's player ids + the value map, slot players into a
// starter pool per position. Handles FLEX (top remaining RB/WR/TE) and
// SF (top remaining QB/RB/WR/TE) explicitly so a Superflex league
// values QB depth correctly.

type SlotResult = {
  byPos: Record<PositionKey, number>   // pure top-N at each position
  flexValue: number                    // separate bucket — best remaining RB/WR/TE
  sfValue: number                      // separate bucket — best remaining QB/RB/WR/TE
  // All starter player ids in lineup order (QB → RB → WR → TE → K → DEF →
  // FLEX → SF). Used by the analyzer route to sum REAL projection ppg for
  // the same starters value picked.
  starterIds: string[]
}

function slotTeam(
  playerIds: string[],
  players: Record<string, AnalyzerPlayer>,
  values: Map<string, PlayerValue>,
  slots: ReturnType<typeof defaultSlots>,
): SlotResult {
  // Bucket players by position with values attached.
  const byPos: Record<string, Array<{ id: string; value: number }>> = {
    QB: [], RB: [], WR: [], TE: [], K: [], DEF: [],
  }
  for (const pid of playerIds) {
    const p = players[pid]
    if (!p || !p.position) continue
    const pos = p.position.toUpperCase()
    if (!(pos in byPos)) continue
    const v = values.get(pid)?.value ?? 0
    byPos[pos].push({ id: pid, value: v })
  }
  for (const k of Object.keys(byPos)) byPos[k].sort((a, b) => b.value - a.value)

  // Take the top-N at each pure position (QB/RB/WR/TE/K/DEF) as starters.
  // FLEX and SF do NOT add into these buckets anymore — they get their
  // own line items so that an unrelated trade can't move e.g. TE's
  // ranking just because the FLEX spot shifted from a TE to an RB3.
  const taken = new Set<string>()
  const starterIds: string[] = []
  const startersByPos: Record<PositionKey, number> = {
    QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0,
  }
  function takeTop(pos: PositionKey, n: number): number {
    let sum = 0
    let picked = 0
    for (const entry of byPos[pos]) {
      if (picked >= n) break
      if (taken.has(entry.id)) continue
      taken.add(entry.id)
      starterIds.push(entry.id)
      sum += entry.value
      picked += 1
    }
    return sum
  }
  startersByPos.QB  = takeTop('QB',  slots.QB)
  startersByPos.RB  = takeTop('RB',  slots.RB)
  startersByPos.WR  = takeTop('WR',  slots.WR)
  startersByPos.TE  = takeTop('TE',  slots.TE)
  startersByPos.K   = takeTop('K',   slots.K)
  startersByPos.DEF = takeTop('DEF', slots.DEF)

  function topRemaining(positions: PositionKey[], n: number): { value: number; ids: string[] } {
    if (!n) return { value: 0, ids: [] }
    const pool: Array<{ id: string; value: number }> = []
    for (const pos of positions) {
      for (const e of byPos[pos]) {
        if (!taken.has(e.id)) pool.push(e)
      }
    }
    pool.sort((a, b) => b.value - a.value)
    let sum = 0
    const ids: string[] = []
    for (let i = 0; i < Math.min(n, pool.length); i++) {
      sum += pool[i].value
      ids.push(pool[i].id)
    }
    return { value: sum, ids }
  }
  // FLEX: top remaining RB/WR/TE — own bucket.
  const flex = topRemaining(['RB', 'WR', 'TE'], slots.FLEX)
  for (const id of flex.ids) { taken.add(id); starterIds.push(id) }
  // SF: top remaining QB/RB/WR/TE — own bucket.
  const sf = topRemaining(['QB', 'RB', 'WR', 'TE'], slots.SF)
  for (const id of sf.ids) { taken.add(id); starterIds.push(id) }

  return { byPos: startersByPos, flexValue: flex.value, sfValue: sf.value, starterIds }
}

// ── League-wide depth snapshot ───────────────────────────────────────────

export function computeLeagueDepth(
  rosters: AnalyzerRoster[],
  players: Record<string, AnalyzerPlayer>,
  values: Map<string, PlayerValue>,
  eff: EffectiveSettings,
): LeagueDepthSnapshot {
  const slots = defaultSlots(eff)

  // Step 1: slot each team. Now returns pure per-position + separate
  // FLEX/SF buckets, so per-position rankings are stable when the
  // position isn't touched.
  const slotByOwner: Record<string, SlotResult> = {}
  for (const r of rosters) {
    slotByOwner[r.ownerId] = slotTeam(r.playerIds, players, values, slots)
  }

  // Step 2: rank teams at each pure position (no FLEX/SF leakage).
  const rankByPos: Record<PositionKey, Map<string, number>> = {
    QB: new Map(), RB: new Map(), WR: new Map(), TE: new Map(), K: new Map(), DEF: new Map(),
  }
  for (const pos of POSITIONS) {
    const sorted = rosters
      .map((r) => ({ ownerId: r.ownerId, val: slotByOwner[r.ownerId].byPos[pos] }))
      .sort((a, b) => b.val - a.val)
    sorted.forEach((entry, i) => rankByPos[pos].set(entry.ownerId, i + 1))
  }

  // Step 3: composite — weighted sum of position scores, weights ∝ starter slots.
  // score10 mapping: rank 1 → 10, rank N → 1, linear. composite is the
  // weighted average of score10s, scaled to 0–100 for display friendliness.
  const totalSlots =
    slots.QB + slots.RB + slots.WR + slots.TE +
    slots.FLEX + slots.SF + slots.K + slots.DEF
  const teamCount = rosters.length
  function rankToScore10(rank: number): number {
    if (teamCount <= 1) return 10
    return 10 - ((rank - 1) / (teamCount - 1)) * 9   // 1→10, N→1
  }

  const out: LeagueDepthSnapshot = { byOwnerId: {} }
  // We'll need the per-team composites to rank overall.
  const compositesByOwner = new Map<string, number>()

  for (const r of rosters) {
    const slotRes = slotByOwner[r.ownerId]
    const byPosition = {} as Record<PositionKey, TeamPositionDepth>
    let weightedScoreSum = 0
    for (const pos of POSITIONS) {
      const starterValue = slotRes.byPos[pos]
      const rank = rankByPos[pos].get(r.ownerId) ?? teamCount
      const score10 = rankToScore10(rank)
      byPosition[pos] = { position: pos, starterValue, leagueRank: rank, score10 }
      const w = slots[pos as keyof typeof slots] ?? 0
      weightedScoreSum += score10 * w
    }
    const pureSlotSum = slots.QB + slots.RB + slots.WR + slots.TE + slots.K + slots.DEF
    const composite = pureSlotSum > 0 ? (weightedScoreSum / pureSlotSum) * 10 : 0
    compositesByOwner.set(r.ownerId, composite)
    out.byOwnerId[r.ownerId] = {
      ownerId: r.ownerId,
      byPosition,
      flexValue: slotRes.flexValue,
      sfValue:   slotRes.sfValue,
      compositeStrength: composite,
      overallLeagueRank: 0,   // set below
      starterIds: slotRes.starterIds,
    }
  }

  // Overall league rank (1 = best composite)
  const overall = Array.from(compositesByOwner.entries())
    .sort((a, b) => b[1] - a[1])
  overall.forEach(([ownerId], i) => {
    out.byOwnerId[ownerId].overallLeagueRank = i + 1
  })

  void totalSlots // currently unused; kept for future Pick Capital weighting
  return out
}

// ── Hypothetical "after the trade" snapshot ──────────────────────────────
//
// Build alternate rosters for the two trading teams: Team A's roster
// becomes (current minus sends plus receives), Team B's vice versa.
// All other teams stay put. Re-run computeLeagueDepth on the swapped
// rosters so per-position ranks reflect the proposed trade.

export function snapshotAfterTrade(
  rosters: AnalyzerRoster[],
  players: Record<string, AnalyzerPlayer>,
  values: Map<string, PlayerValue>,
  eff: EffectiveSettings,
  teamAOwnerId: string,
  teamBOwnerId: string,
  aSends: string[],     // ids leaving Team A → Team B
  aReceives: string[],  // ids leaving Team B → Team A
): LeagueDepthSnapshot {
  const swapped = rosters.map((r) => {
    if (r.ownerId === teamAOwnerId) {
      const keep = r.playerIds.filter((id) => !aSends.includes(id))
      return { ...r, playerIds: [...keep, ...aReceives] }
    }
    if (r.ownerId === teamBOwnerId) {
      const keep = r.playerIds.filter((id) => !aReceives.includes(id))
      return { ...r, playerIds: [...keep, ...aSends] }
    }
    return r
  })
  return computeLeagueDepth(swapped, players, values, eff)
}

// ── Delta projection (per-team, before vs after) ─────────────────────────

export type TeamDepthDelta = {
  ownerId: string
  before: TeamDepthSnapshot
  after: TeamDepthSnapshot
  // Positions where this team moved most in league rank. Negative
  // values = rank went DOWN (got better — lower rank number is better).
  rankMovements: Array<{ position: PositionKey; before: number; after: number; delta: number }>
  compositeDelta: number
  overallRankDelta: number   // negative = rank improved
}

// Sum a team's full starting lineup value: every pure-position
// starter plus the FLEX + SF buckets. Per-position .starterValue is
// now pure (FLEX/SF don't leak into it), so we explicitly add the
// flex/sf bucket values here. This is the number that actually
// changes when a trade gives or takes a starter — it's the metric
// the Analyzer's grade is driven by.
export function sumStarters(snap: TeamDepthSnapshot): number {
  const pure = POSITIONS.reduce((acc, pos) => acc + snap.byPosition[pos].starterValue, 0)
  return pure + (snap.flexValue || 0) + (snap.sfValue || 0)
}

export function depthDelta(
  before: LeagueDepthSnapshot,
  after: LeagueDepthSnapshot,
  ownerId: string,
): TeamDepthDelta {
  const b = before.byOwnerId[ownerId]
  const a = after.byOwnerId[ownerId]
  const movements: TeamDepthDelta['rankMovements'] = POSITIONS.map((pos) => ({
    position: pos,
    before: b.byPosition[pos].leagueRank,
    after:  a.byPosition[pos].leagueRank,
    delta:  a.byPosition[pos].leagueRank - b.byPosition[pos].leagueRank,
  })).filter((m) => m.delta !== 0)
  // Sort by absolute movement first, so the UI can take .slice(0, 2).
  movements.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
  return {
    ownerId,
    before: b,
    after: a,
    rankMovements: movements,
    compositeDelta: a.compositeStrength - b.compositeStrength,
    overallRankDelta: a.overallLeagueRank - b.overallLeagueRank,
  }
}
