// NFL.com platform — Phase 3 work. Stub.

import type { LivePlatform, PlatformFrame, PlatformLeagueRef } from '../platforms'

export const nflPlatform: LivePlatform = {
  async fetchFrame(_ref: PlatformLeagueRef): Promise<PlatformFrame> {
    void _ref
    return { supported: false, reason: 'NFL.com live coming soon — showing last sync.' }
  },
}
