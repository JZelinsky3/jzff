// Yahoo platform — Phase 3 work. Stub.

import type { LivePlatform, PlatformFrame, PlatformLeagueRef } from '../platforms'

export const yahooPlatform: LivePlatform = {
  async fetchFrame(_ref: PlatformLeagueRef): Promise<PlatformFrame> {
    void _ref
    return { supported: false, reason: 'Yahoo live coming soon — showing last sync.' }
  },
}
