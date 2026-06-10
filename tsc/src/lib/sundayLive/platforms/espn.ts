// ESPN platform — Phase 3 work. Stub returns "best-effort" unsupported so the
// orchestrator falls back to the last ingest snapshot with a banner.

import type { LivePlatform, PlatformFrame, PlatformLeagueRef } from '../platforms'

export const espnPlatform: LivePlatform = {
  async fetchFrame(_ref: PlatformLeagueRef): Promise<PlatformFrame> {
    void _ref
    return { supported: false, reason: 'ESPN live coming soon — showing last sync.' }
  },
}
