// Pure derivation helpers for the matchup booth. No React, no fetch — these
// take a SlMatchup and produce the booth's secondary views.

import type { SlMatchup, SlPlayer, SlSide } from '@/lib/sundayLive/types'

// ── Position H2H pairing ─────────────────────────────────────────────────────
// Sleeper-style: starter array is positional (QB, RB, RB, WR, WR, WR, TE, FLEX,
// K, DEF). Pair index-by-index against the opponent's starters. Render the
// margin so the booth shows where the matchup is being won/lost.

export type PositionRow = {
  slot: string
  a: SlPlayer | null
  b: SlPlayer | null
  marginA: number          // a.points - b.points; positive = side A winning the slot
}

export function pairLineupSlots(matchup: SlMatchup): PositionRow[] {
  const startersA = matchup.a.players.filter((p) => p.isStarter)
  const startersB = matchup.b.players.filter((p) => p.isStarter)
  const len = Math.max(startersA.length, startersB.length)
  const rows: PositionRow[] = []
  for (let i = 0; i < len; i++) {
    const pa = startersA[i] ?? null
    const pb = startersB[i] ?? null
    const slot = pa?.slot ?? pb?.slot ?? '—'
    const marginA = (pa?.points ?? 0) - (pb?.points ?? 0)
    rows.push({ slot, a: pa, b: pb, marginA })
  }
  return rows
}

// ── Bench remorse ────────────────────────────────────────────────────────────
// For each starter on a side: find the highest-scoring bench player at the
// same position who has outscored them. Only matters for FINAL or LIVE games
// (a pre-game starter still has chances). The "swing" is how much you'd be
// ahead if you'd started the bench player instead.

export type BenchRemorseRow = {
  startedName: string
  startedPoints: number
  shouldveName: string
  shouldvePoints: number
  position: string
  swing: number
}

export function computeBenchRemorse(side: SlSide): BenchRemorseRow[] {
  const starters = side.players.filter((p) => p.isStarter)
  const bench = side.players.filter((p) => !p.isStarter)
  const rows: BenchRemorseRow[] = []
  for (const s of starters) {
    if (!s.position) continue
    // FLEX accepts RB/WR/TE; everything else position-strict.
    const candidates = bench.filter((b) =>
      s.slot === 'FLEX' || s.position === 'FLEX'
        ? b.position === 'RB' || b.position === 'WR' || b.position === 'TE'
        : b.position === s.position,
    )
    let best: SlPlayer | null = null
    for (const c of candidates) {
      if (c.points <= s.points) continue
      if (!best || c.points > best.points) best = c
    }
    if (best) {
      rows.push({
        startedName: s.name,
        startedPoints: s.points,
        shouldveName: best.name,
        shouldvePoints: best.points,
        position: s.position ?? '—',
        swing: best.points - s.points,
      })
    }
  }
  rows.sort((a, b) => b.swing - a.swing)
  return rows
}

// ── Dud watch ────────────────────────────────────────────────────────────────
// The single worst starter in the matchup — across both sides — by points
// scored relative to projection, but only counted if their game is at least
// half over (no point in shaming a Sunday-nighter at kickoff).

export type Dud = {
  side: 'a' | 'b'
  ownerName: string
  player: SlPlayer
  deltaFromProj: number    // negative; "underperformed by X"
}

export function computeDudWatch(matchup: SlMatchup): Dud | null {
  const collect = (side: SlSide, key: 'a' | 'b'): Dud[] =>
    side.players
      .filter((p) => p.isStarter && p.game && p.game.state !== 'pre')
      .map((p) => ({
        side: key,
        ownerName: side.ownerName,
        player: p,
        deltaFromProj: p.points - p.projected,
      }))
  const all = [...collect(matchup.a, 'a'), ...collect(matchup.b, 'b')]
  all.sort((x, y) => x.deltaFromProj - y.deltaFromProj)
  const worst = all[0]
  // Only worth surfacing if they're actually underperforming.
  if (!worst || worst.deltaFromProj >= -3) return null
  return worst
}

// ── Comeback math ────────────────────────────────────────────────────────────
// For the trailing side: what's their max remaining ceiling (sum of projection
// minus current for unfinished starters) and is catching up mathematically
// possible? Only renders when (a) there's a gap, (b) some starters are still
// to play.

export type ComebackMath = {
  trailing: 'a' | 'b'
  gap: number
  ceiling: number          // points trailing side could still score
  opponentCeiling: number  // what opponent could add
  possible: boolean
  pctChance: number        // crude — Phase 5 will refine
}

export function computeComebackMath(matchup: SlMatchup): ComebackMath | null {
  const trailingSide = matchup.a.score < matchup.b.score ? 'a' : matchup.a.score > matchup.b.score ? 'b' : null
  if (!trailingSide) return null
  const lead = trailingSide === 'a' ? matchup.b : matchup.a
  const trail = trailingSide === 'a' ? matchup.a : matchup.b
  const remaining = (side: SlSide) => side.players
    .filter((p) => p.isStarter && p.game?.state !== 'final')
    .reduce((sum, p) => sum + Math.max(0, p.projected - p.points), 0)
  const ceiling = remaining(trail)
  const opponentCeiling = remaining(lead)
  const gap = lead.score - trail.score
  // Crude possibility: trailing's ceiling has to exceed (gap + opponent's
  // expected remaining). Anything under 10% is "no shot."
  const need = gap + opponentCeiling
  const possible = ceiling >= need - 5    // ±5pt fuzz
  const pctChance = !possible ? 0 : Math.max(5, Math.min(95, Math.round(((ceiling - need) / Math.max(1, gap)) * 30 + 35)))
  if (gap < 1 || ceiling < 5) return null
  return { trailing: trailingSide, gap, ceiling, opponentCeiling, possible, pctChance }
}
