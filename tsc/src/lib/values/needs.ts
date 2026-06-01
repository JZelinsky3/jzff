// Position-needs engine — Phase 3.5.
//
// Given a league's rosters + a player value map, produce per-roster position
// ratings (Elite / Strong / Average / Thin / Critical) by comparing each
// owner's "starter value" at a position to the league median for that same
// position. Honest, simple, league-relative — a "Thin RB" in a deep dynasty
// league might still be better than the average redraft team's #1 RB.

import type { BuilderLeague, BuilderPlayer, BuilderRoster } from '@/lib/manager/builder-types'

export type PositionTier = 'elite' | 'strong' | 'average' | 'thin' | 'critical'

export const TIER_LABEL: Record<PositionTier, string> = {
  elite: 'Elite',
  strong: 'Strong',
  average: 'Average',
  thin: 'Thin',
  critical: 'Critical',
}

// Display order — Elite first, Critical last.
export const TIER_ORDER: PositionTier[] = ['elite', 'strong', 'average', 'thin', 'critical']

export const TRACKED_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
export type TrackedPosition = (typeof TRACKED_POSITIONS)[number]

export type PositionRating = {
  position: TrackedPosition
  // Sum of the top-N players' values where N is the league's effective
  // starter count for this position (incl. FLEX/SUPER_FLEX shares).
  starterValue: number
  // Median across all rosters of the same starterValue metric.
  leagueMedian: number
  diff: number              // starterValue - leagueMedian
  diffPct: number           // diff / leagueMedian (0 when median is 0)
  tier: PositionTier
  // Players that contributed to starterValue (top N by value).
  topPlayers: BuilderPlayer[]
  // How many "starting slots" this position has in the league (e.g. 2.5 = RB×2 + FLEX share).
  effectiveStarters: number
  // Average value of the top-N starters (handy for picking trade comps).
  avgStarterValue: number
}

export type RosterNeeds = {
  ownerId: string
  ratings: Record<TrackedPosition, PositionRating>
}

const TIER_THRESHOLDS: Array<[number, PositionTier]> = [
  [0.25, 'elite'],
  [0.10, 'strong'],
  [-0.10, 'average'],
  [-0.25, 'thin'],
  [-Infinity, 'critical'],
]

function pctToTier(diffPct: number): PositionTier {
  for (const [floor, tier] of TIER_THRESHOLDS) {
    if (diffPct >= floor) return tier
  }
  return 'critical'
}

// Effective starter slots per position. FLEX is shared between RB/WR/TE in
// rough proportions used by industry analysts; SUPER_FLEX adds a QB share.
// We pull league.qbStarters straight from BuilderLeague (which already counted
// SUPER_FLEX) so the only thing we need to handle here is the FLEX split.
type SlotPlan = Record<TrackedPosition, number>

function effectiveStarterSlots(league: BuilderLeague): SlotPlan {
  // BuilderLeague doesn't carry the raw roster_positions list; we derive QB
  // count from league.qbStarters and assume a standard RB×2, WR×2-3, TE×1,
  // FLEX×1 baseline. This is a pragmatic v1 — a future pass should plumb the
  // raw roster_positions into BuilderLeague so we can be exact.
  void league
  return { QB: 1, RB: 2.5, WR: 2.5, TE: 1.2 }
}

function topNValue(players: BuilderPlayer[], n: number): { sum: number; top: BuilderPlayer[] } {
  if (n <= 0 || players.length === 0) return { sum: 0, top: [] }
  // Take ceil(n) players for "top picks" display, but use a fractional
  // weighting on the last slot when n isn't whole (FLEX share).
  const whole = Math.floor(n)
  const frac = n - whole
  const sorted = [...players].sort((a, b) => b.value - a.value)
  const wholeSlice = sorted.slice(0, whole)
  const partial = frac > 0 && sorted[whole] ? sorted[whole].value * frac : 0
  const wholeSum = wholeSlice.reduce((s, p) => s + p.value, 0)
  const display = sorted.slice(0, whole + (frac > 0 ? 1 : 0))
  return { sum: wholeSum + partial, top: display }
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function playersAtPosition(roster: BuilderRoster, pos: TrackedPosition): BuilderPlayer[] {
  return roster.players.filter((p) => p.position === pos)
}

export function computeNeeds(league: BuilderLeague): Map<string, RosterNeeds> {
  const slots = effectiveStarterSlots(league)
  // Override QB slots with league-aware count (covers superflex).
  slots.QB = Math.max(1, league.qbStarters)

  // First pass: compute each roster's starter values per position.
  type IntermediateCell = { starterValue: number; topPlayers: BuilderPlayer[]; effective: number; avg: number }
  const cells = new Map<string, Record<TrackedPosition, IntermediateCell>>()

  for (const r of league.rosters) {
    const row: Record<TrackedPosition, IntermediateCell> = {
      QB: { starterValue: 0, topPlayers: [], effective: slots.QB, avg: 0 },
      RB: { starterValue: 0, topPlayers: [], effective: slots.RB, avg: 0 },
      WR: { starterValue: 0, topPlayers: [], effective: slots.WR, avg: 0 },
      TE: { starterValue: 0, topPlayers: [], effective: slots.TE, avg: 0 },
    }
    for (const pos of TRACKED_POSITIONS) {
      const pool = playersAtPosition(r, pos)
      const { sum, top } = topNValue(pool, slots[pos])
      row[pos].starterValue = sum
      row[pos].topPlayers = top
      row[pos].avg = slots[pos] > 0 ? sum / slots[pos] : 0
    }
    cells.set(r.ownerId, row)
  }

  // Second pass: medians per position across all rosters.
  const medianByPos: Record<TrackedPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }
  for (const pos of TRACKED_POSITIONS) {
    const values: number[] = []
    for (const row of cells.values()) values.push(row[pos].starterValue)
    medianByPos[pos] = median(values)
  }

  // Third pass: tier each roster vs the medians.
  const out = new Map<string, RosterNeeds>()
  for (const [ownerId, row] of cells) {
    const ratings: Record<TrackedPosition, PositionRating> = {
      QB: ratingFor('QB', row.QB, medianByPos.QB),
      RB: ratingFor('RB', row.RB, medianByPos.RB),
      WR: ratingFor('WR', row.WR, medianByPos.WR),
      TE: ratingFor('TE', row.TE, medianByPos.TE),
    }
    out.set(ownerId, { ownerId, ratings })
  }
  return out
}

function ratingFor(position: TrackedPosition, cell: { starterValue: number; topPlayers: BuilderPlayer[]; effective: number; avg: number }, leagueMedian: number): PositionRating {
  const diff = cell.starterValue - leagueMedian
  const diffPct = leagueMedian > 0 ? diff / leagueMedian : 0
  return {
    position,
    starterValue: cell.starterValue,
    leagueMedian,
    diff,
    diffPct,
    tier: pctToTier(diffPct),
    topPlayers: cell.topPlayers,
    effectiveStarters: cell.effective,
    avgStarterValue: cell.avg,
  }
}

// Recommendations — given my needs + the league's needs map, find candidate
// swaps: take a piece from one of my strong positions, get a piece at one of
// my weak positions from someone whose position is surplus. Keep value within
// the FAIR band (≤ 12% delta) so the recommendation reads as "they'd say yes."
export type TradeRecommendation = {
  leagueName: string
  leagueSlug: string
  archiveLeagueId: string
  counterpartyOwnerId: string
  counterpartyTeamName: string
  give: BuilderPlayer
  giveTier: PositionTier
  givePosition: TrackedPosition
  get: BuilderPlayer
  getTier: PositionTier
  getPosition: TrackedPosition
  valueDelta: number          // get.value - give.value
  valueDeltaPct: number
  rationale: string
}

const REC_FAIR_PCT = 0.12

export function buildRecommendations(
  league: BuilderLeague,
  needs: Map<string, RosterNeeds>,
  archiveLeagueId: string,
): TradeRecommendation[] {
  const myOwnerId = league.myOwnerId
  const me = needs.get(myOwnerId)
  if (!me) return []

  const myWeak = TRACKED_POSITIONS
    .map((p) => me.ratings[p])
    .filter((r) => r.tier === 'thin' || r.tier === 'critical')
    .sort((a, b) => a.diffPct - b.diffPct)
  const myStrong = TRACKED_POSITIONS
    .map((p) => me.ratings[p])
    .filter((r) => r.tier === 'strong' || r.tier === 'elite')
    .sort((a, b) => b.diffPct - a.diffPct)

  if (myWeak.length === 0 || myStrong.length === 0) return []

  const recs: TradeRecommendation[] = []
  for (const weak of myWeak) {
    // Find opposing rosters that are SURPLUS at this weak position.
    for (const otherRoster of league.rosters) {
      if (otherRoster.ownerId === myOwnerId) continue
      const opp = needs.get(otherRoster.ownerId)
      if (!opp) continue
      const oppAtPos = opp.ratings[weak.position]
      if (oppAtPos.tier !== 'strong' && oppAtPos.tier !== 'elite') continue

      // For each of their non-top-1 pieces at the surplus position, pair with
      // one of my strong-position pieces in the same value band.
      const candidates = oppAtPos.topPlayers
        .filter((p) => p.value > 0)
        // Skip their #1 — most owners won't move their best at a surplus position.
        // Their 2nd-best onward are realistic targets.
        .slice(1)

      for (const cand of candidates) {
        for (const strong of myStrong) {
          const piece = strong.topPlayers.find((p) => {
            const delta = (cand.value - p.value) / Math.max(p.value, 1)
            return Math.abs(delta) <= REC_FAIR_PCT
          })
          if (!piece) continue
          const delta = cand.value - piece.value
          const deltaPct = piece.value > 0 ? delta / piece.value : 0
          recs.push({
            leagueName: league.leagueName,
            leagueSlug: league.leagueSlug,
            archiveLeagueId,
            counterpartyOwnerId: otherRoster.ownerId,
            counterpartyTeamName: otherRoster.teamName,
            give: piece,
            giveTier: strong.tier,
            givePosition: strong.position,
            get: cand,
            getTier: oppAtPos.tier,
            getPosition: weak.position,
            valueDelta: delta,
            valueDeltaPct: deltaPct,
            rationale: `You're ${TIER_LABEL[strong.tier].toLowerCase()} at ${strong.position}, ${TIER_LABEL[weak.tier].toLowerCase()} at ${weak.position}; ${otherRoster.teamName} is ${TIER_LABEL[oppAtPos.tier].toLowerCase()} at ${weak.position}.`,
          })
          break  // one piece-pairing per candidate
        }
      }
    }
  }

  // Dedupe (same give+get) and prefer the most value-balanced swaps.
  const seen = new Set<string>()
  return recs
    .filter((r) => {
      const k = `${r.give.playerId}|${r.get.playerId}|${r.counterpartyOwnerId}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => Math.abs(a.valueDeltaPct) - Math.abs(b.valueDeltaPct))
    .slice(0, 5)
}
