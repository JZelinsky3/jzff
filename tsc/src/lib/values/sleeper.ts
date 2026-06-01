// Sleeper-derived ValueSource — Phase 3 v1 foundation.
//
// Builds a per-player trade value from Sleeper's own `search_rank` (their
// internal popularity / consensus rank, lower = more valuable) combined with
// age / position adjustments for dynasty mode. Not as authoritative as KTC
// for dynasty or FantasyPros for redraft, but it's free, always-fresh, and
// covers every active NFL player Sleeper knows about.
//
// Future providers (KTC, FP, ESPN) implement the same ValueSource interface
// so the orchestrator can swap or blend without touching callers.

import { unstable_cache } from 'next/cache'
import { sleeper, type SleeperPlayer } from '@/lib/platforms/sleeper'
import type { LeagueValuationContext, PlayerValue, ValueSource } from './types'

const MAX_RANK = 500   // anyone past this rank is treated as ~0 value
const TOP_VALUE = 10000

// Age curves are loose — they're tuned to produce sensible relative orderings
// (rookie WR > 31-year-old WR in dynasty; both worth roughly the same in
// redraft) rather than to match KTC exactly. Tighten when we add KTC.
function ageMultiplier(mode: LeagueValuationContext['mode'], pos: string, age: number | null): number {
  if (mode === 'redraft') return 1
  if (age == null) return 1

  if (pos === 'RB') {
    if (age >= 30) return 0.30
    if (age >= 28) return 0.50
    if (age >= 26) return 0.75
    if (age <= 22) return 1.20
    if (age <= 24) return 1.10
    return 1
  }
  if (pos === 'WR') {
    if (age >= 32) return 0.45
    if (age >= 30) return 0.70
    if (age >= 28) return 0.90
    if (age <= 23) return 1.15
    if (age <= 25) return 1.05
    return 1
  }
  if (pos === 'TE') {
    if (age >= 32) return 0.55
    if (age >= 30) return 0.80
    if (age <= 25) return 1.10
    return 1
  }
  if (pos === 'QB') {
    if (age >= 38) return 0.60
    if (age >= 35) return 0.85
    if (age <= 25) return 1.10
    return 1
  }
  return 1
}

// Position scarcity multiplier: bumps the value of premium positions and
// flattens the kicker/defense floor. Superflex roughly doubles QB premium.
function positionScarcity(mode: LeagueValuationContext['mode'], pos: string, qbStarters: number): number {
  const superflex = qbStarters >= 2
  switch (pos) {
    case 'QB': return superflex ? 1.45 : (mode === 'dynasty' ? 0.90 : 1.0)
    case 'RB': return mode === 'dynasty' ? 1.15 : 1.10
    case 'WR': return 1.05
    case 'TE': return 0.95
    case 'K':
    case 'DEF':
    case 'DST':
    case 'D/ST':
      return 0.25
    default:
      return 0.85
  }
}

function inactive(p: SleeperPlayer): boolean {
  const s = (p.status ?? '').toLowerCase()
  if (s === 'inactive' || s === 'retired') return true
  if (!p.team && (!p.fantasy_positions || p.fantasy_positions.length === 0)) return true
  return false
}

function tierFor(rank: number, pos: string): string | null {
  if (!Number.isFinite(rank)) return null
  if (rank <= 12) return `${pos}1`
  if (rank <= 36) return `${pos}2`
  if (rank <= 60) return `${pos}3`
  if (rank <= 100) return `${pos}4`
  return null
}

function valueFromPlayer(p: SleeperPlayer, ctx: LeagueValuationContext): number {
  const rank = p.search_rank ?? null
  if (rank == null || rank > MAX_RANK) return 0
  if (inactive(p)) return 0

  // Invert rank to a 0..TOP_VALUE base. Front-load the curve so the elite
  // tier separates more sharply than the mid-round bulk.
  const linear = Math.max(0, 1 - (rank - 1) / MAX_RANK)
  const curved = Math.pow(linear, 1.4)
  const base = curved * TOP_VALUE

  const pos = p.position ?? '—'
  const ageMul = ageMultiplier(ctx.mode, pos, p.age ?? null)
  const posMul = positionScarcity(ctx.mode, pos, ctx.qbStarters)

  return Math.round(base * ageMul * posMul)
}

async function loadSleeperPlayers(): Promise<Record<string, SleeperPlayer>> {
  // Shares the 6h cache the Player Desk uses — same upstream call.
  const cached = unstable_cache(
    async () => (await sleeper.playersNfl()) ?? {},
    ['sleeper-players-nfl', 'v1'],
    { revalidate: 6 * 60 * 60 },
  )
  return cached()
}

export const sleeperValueSource: ValueSource = {
  id: 'sleeper-derived',
  async valueAll(ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>> {
    const players = await loadSleeperPlayers()
    const out = new Map<string, PlayerValue>()
    for (const [pid, p] of Object.entries(players)) {
      const v = valueFromPlayer(p, ctx)
      if (v <= 0) continue
      const pos = p.position ?? '—'
      const name = p.full_name ?? (`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || `Player ${pid}`)
      out.set(pid, {
        playerId: pid,
        name,
        position: pos,
        team: p.team ?? null,
        value: v,
        tier: tierFor(p.search_rank ?? Infinity, pos),
        age: p.age ?? null,
        yearsExp: p.years_exp ?? null,
        source: 'sleeper-derived',
      })
    }
    return out
  },
}
