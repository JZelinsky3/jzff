// Shared league-bundle accessor used by:
//   • the public almanac route (/leagues/<slug>/[[...path]])
//   • OG image generators under /api/og/*
//
// Mirrors the caching the almanac route uses so callers share a single
// build per league per slug. Bumping BUNDLE_VERSION here forces a recompute
// on the next request (use when bundle schema changes affect OG renders).

import { unstable_cache } from 'next/cache'
import { exportLeague, type ExportBundle } from '@/lib/export/pams'
import { devBundleGet, devBundleSet } from '@/lib/devCache'

// Keep in sync with the version pinned in the leagues route; bumping either
// invalidates both, which is what we want — OG images should track template
// data changes 1:1.
const BUNDLE_VERSION = 'v72'

export function getLeagueBundle(leagueId: string, slug: string): Promise<ExportBundle> {
  if (process.env.NODE_ENV !== 'production') {
    const cacheKey = `${leagueId}|${slug}`
    const inflight = devBundleGet(cacheKey)
    if (inflight) return inflight
    const fresh = exportLeague(leagueId, { slug })
    devBundleSet(cacheKey, fresh)
    return fresh
  }
  return unstable_cache(
    async () => exportLeague(leagueId, { slug }),
    ['pams-bundle', BUNDLE_VERSION, leagueId, slug],
    { tags: [`league-${leagueId}`], revalidate: 3600 }
  )()
}
