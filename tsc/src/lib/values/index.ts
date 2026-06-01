// Value engine orchestrator.
//
// Picks the right ValueSource for a league's mode, returns a unified
// Map<playerId, PlayerValue>. v1 uses the Sleeper-derived source for every
// mode; later rounds plug KTC for dynasty, FantasyPros for redraft, etc.

import { sleeperValueSource } from './sleeper'
import type { LeagueMode, LeagueValuationContext, PlayerValue, ValueProviderId, ValueSource } from './types'

export type { LeagueMode, LeagueValuationContext, PlayerValue, ValueProviderId } from './types'

export type ValuationResult = {
  provider: ValueProviderId
  providerLabel: string
  values: Map<string, PlayerValue>
  ctx: LeagueValuationContext
}

const PROVIDER_LABELS: Record<ValueProviderId, string> = {
  'sleeper-derived': 'Sleeper search rank',
  'ktc-dynasty': 'KeepTradeCut · Dynasty',
  'fantasypros-ros': 'FantasyPros · ROS',
  'espn-ros': 'ESPN · ROS',
}

function pickSource(mode: LeagueMode): ValueSource {
  // v1: Sleeper everywhere. Stays here so the swap is one line later.
  void mode
  return sleeperValueSource
}

export async function valuateLeague(ctx: LeagueValuationContext): Promise<ValuationResult> {
  const source = pickSource(ctx.mode)
  const values = await source.valueAll(ctx)
  return {
    provider: source.id,
    providerLabel: PROVIDER_LABELS[source.id],
    values,
    ctx,
  }
}

// Sleeper league.settings.type → our LeagueMode (0=redraft, 1=keeper, 2=dynasty).
// taxi_slots > 0 is a stronger dynasty signal even if `type` is missing.
export function detectMode(args: { type?: number | null; taxiSlots?: number | null }): LeagueMode {
  if ((args.taxiSlots ?? 0) > 0) return 'dynasty'
  if (args.type === 2) return 'dynasty'
  if (args.type === 1) return 'keeper'
  return 'redraft'
}
