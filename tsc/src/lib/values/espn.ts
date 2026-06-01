// ESPN ROS ValueSource — Phase 4 stub.
//
// ESPN's player projection feed lives behind a league-scoped URL that needs
// an authenticated session for private leagues; public leagues can pull
// projections from the kona_player_info view. Scaffolded with the same
// pattern as the FP/KTC sources — configure via env when ready.

import type { LeagueValuationContext, PlayerValue, ValueSource } from './types'

export function isEspnConfigured(): boolean {
  return Boolean(process.env.ESPN_PROJECTIONS_URL?.trim())
}

export const espnRosSource: ValueSource = {
  id: 'espn-ros',
  async valueAll(_ctx: LeagueValuationContext): Promise<Map<string, PlayerValue>> {
    void _ctx
    // Stub: when wired, hit ESPN's player projections endpoint, parse, map
    // by normalized name → Sleeper player ID. Same pattern as KTC source.
    return new Map()
  },
}
