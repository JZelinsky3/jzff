// Platform abstraction for Sunday Live.
//
// The hub doesn't care whether a league lives on Sleeper, ESPN, Yahoo, or
// NFL.com — it asks a LivePlatform for the same shape. Each implementation
// returns matchup sides + lineups with live points + projections; the
// orchestrator (load.ts) layers WP / Sweat / NFL game context / wire / ticker
// on top.

import type { Platform, SlSide, LiveQuality } from './types'

export type PlatformLeagueRef = {
  leagueId: string                    // canonical TSC league id (Supabase)
  externalLeagueId: string            // platform-side id (Sleeper league_id, etc.)
  ownerId: string | null
  name: string
  week: number
  // Roster-slot template (used to label starter slots) — platform-specific
  // vocabularies are mapped to a small canonical set upstream when we can.
  rosterPositions: string[]
}

export type PlatformFrame = {
  supported: true
  liveQuality: LiveQuality
  // One side per roster; load.ts pairs them into matchups using rosterIdToMatchup.
  sides: SlSide[]
  rosterIdToMatchup: Record<number, number>
} | {
  supported: false
  reason: string
}

export interface LivePlatform {
  fetchFrame(ref: PlatformLeagueRef): Promise<PlatformFrame>
}

import { sleeperPlatform } from './platforms/sleeper'
import { espnPlatform } from './platforms/espn'
import { yahooPlatform } from './platforms/yahoo'
import { nflPlatform } from './platforms/nfl'

export function platformFor(p: Platform): LivePlatform {
  switch (p) {
    case 'sleeper': return sleeperPlatform
    case 'espn':    return espnPlatform
    case 'yahoo':   return yahooPlatform
    case 'nfl':     return nflPlatform
  }
}
