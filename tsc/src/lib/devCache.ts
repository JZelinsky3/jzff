// In-memory dev-only cache for the per-league export bundle. The route
// handler stores fresh bundles here so subsequent requests (e.g., the draft
// page making 7+ data fetches) skip the full export. The sync API clears the
// relevant entry after writes so users see fresh data without waiting the TTL.
//
// In production this module is never read — unstable_cache handles caching
// and tag-bust there.

import type { ExportBundle } from '@/lib/export/pams'

type Entry = { bundle: ExportBundle; expiresAt: number }

const cache = new Map<string, Entry>()

export const DEV_BUNDLE_TTL_MS = 30_000

export function devCacheGet(leagueId: string): ExportBundle | null {
  const hit = cache.get(leagueId)
  if (!hit) return null
  if (Date.now() >= hit.expiresAt) {
    cache.delete(leagueId)
    return null
  }
  return hit.bundle
}

export function devCacheSet(leagueId: string, bundle: ExportBundle): void {
  cache.set(leagueId, { bundle, expiresAt: Date.now() + DEV_BUNDLE_TTL_MS })
}

export function devCacheBust(leagueId: string): void {
  cache.delete(leagueId)
}
