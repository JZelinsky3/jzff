// Shared types for the player value engine (Phase 3, Trade Desk foundation).
//
// A ValueSource produces a normalized per-player value on a roughly 0-10000
// scale so different providers (Sleeper-derived, KTC dynasty, FantasyPros
// redraft, etc.) can be A/B'd or blended without callers re-learning each
// provider's native scale.

export type LeagueMode = 'dynasty' | 'redraft' | 'keeper'

export type ValueProviderId = 'sleeper-derived' | 'ktc-dynasty' | 'fantasypros-ros' | 'espn-ros'

export type PlayerValue = {
  playerId: string            // Sleeper player_id — primary identity across providers
  name: string
  position: string
  team: string | null
  // Normalized trade value, 0-10000. Inactive / unrostered players → 0.
  value: number
  // Tier label produced by the provider (e.g. 'WR1', 'RB Elite', or null).
  tier: string | null
  age: number | null
  yearsExp: number | null
  source: ValueProviderId
}

export type LeagueValuationContext = {
  mode: LeagueMode
  // Number of QB starters; ≥2 means superflex which doubles QB scarcity.
  qbStarters: number
  // Number of teams in the league — adjusts scarcity baselines.
  teamCount: number
}

export type ValueSource = {
  id: ValueProviderId
  // Build a Map<playerId, PlayerValue> covering every player the source has
  // a value for, in the context of a specific league's mode.
  valueAll(ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>>
}
