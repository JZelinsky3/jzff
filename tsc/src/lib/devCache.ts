// In-memory dev-only cache for per-league computed data. The route handler
// stores fresh bundles here so subsequent requests (e.g., the draft page
// making 7+ data fetches) skip the full export. The sync API clears the
// relevant entries after writes so users see fresh data without waiting
// the TTL.
//
// In production this module is mostly bypassed — unstable_cache handles
// caching and tag-bust there.
//
// THREE caches live here, each scoped to one concern:
//
//   1. devCacheGet / devCacheSet   — RESOLVED ExportBundle values. Used by
//      the manager bundle + chronicle helpers, which build their own
//      per-manager bundles and don't have the parallel-stampede problem.
//
//   2. devBundleGet / devBundleSet — In-flight PROMISES for the per-league
//      JSON bundle that the public almanac route serves. We cache the
//      Promise (not the resolved value) so when the hub fires 5 parallel
//      data/*.json fetches against a cold cache, all 5 await the same
//      exportLeague() instead of each kicking off its own 4-second build.
//      Before this, a cold landing was 5× the work it needed to be.
//
//   3. devMetaGet / devMetaSet     — In-flight PROMISES for slug→meta
//      lookups. Same parallelism story: every request to /leagues/<slug>/...
//      (HTML and every data file) does a meta lookup, and the hub fires 5
//      of those in close succession.

import type { ExportBundle } from '@/lib/export/pams'

type ResolvedEntry = { bundle: ExportBundle; expiresAt: number }
type BundleEntry = { promise: Promise<ExportBundle>; expiresAt: number }
type MetaEntry<T> = { promise: Promise<T | null>; expiresAt: number }

const resolvedCache = new Map<string, ResolvedEntry>()
const bundleCache = new Map<string, BundleEntry>()
const metaCache = new Map<string, MetaEntry<unknown>>()

// Bundle TTL stays short in dev so iterating on the exporter (editing
// pams.ts) doesn't require restarting the dev server to see changes.
export const DEV_BUNDLE_TTL_MS = 30_000
export const DEV_META_TTL_MS = 60_000

// ── (1) Resolved-value cache (manager bundle, chronicle) ────────────────
export function devCacheGet(key: string): ExportBundle | null {
  const hit = resolvedCache.get(key)
  if (!hit) return null
  if (Date.now() >= hit.expiresAt) {
    resolvedCache.delete(key)
    return null
  }
  return hit.bundle
}

export function devCacheSet(key: string, bundle: ExportBundle): void {
  resolvedCache.set(key, { bundle, expiresAt: Date.now() + DEV_BUNDLE_TTL_MS })
}

// ── (2) In-flight Promise cache for the per-league JSON bundle ──────────
export function devBundleGet(leagueKey: string): Promise<ExportBundle> | null {
  const hit = bundleCache.get(leagueKey)
  if (!hit) return null
  if (Date.now() >= hit.expiresAt) {
    bundleCache.delete(leagueKey)
    return null
  }
  return hit.promise
}

export function devBundleSet(
  leagueKey: string,
  promise: Promise<ExportBundle>,
): void {
  bundleCache.set(leagueKey, { promise, expiresAt: Date.now() + DEV_BUNDLE_TTL_MS })
  // Evict on rejection so a transient build error doesn't keep handing
  // back the failed Promise to every subsequent request for 30s.
  promise.catch(() => {
    const cur = bundleCache.get(leagueKey)
    if (cur && cur.promise === promise) bundleCache.delete(leagueKey)
  })
}

// ── (3) In-flight Promise cache for slug→meta lookups ───────────────────
export function devMetaGet<T>(slug: string): Promise<T | null> | null {
  const hit = metaCache.get(slug)
  if (!hit) return null
  if (Date.now() >= hit.expiresAt) {
    metaCache.delete(slug)
    return null
  }
  return hit.promise as Promise<T | null>
}

export function devMetaSet<T>(slug: string, promise: Promise<T | null>): void {
  metaCache.set(slug, { promise, expiresAt: Date.now() + DEV_META_TTL_MS } as MetaEntry<unknown>)
  promise.catch(() => {
    const cur = metaCache.get(slug)
    if (cur && cur.promise === promise) metaCache.delete(slug)
  })
}

// ── Bust ────────────────────────────────────────────────────────────────
// Called by sync, settings/setup actions, theme writes, etc. — anywhere
// that changes a league's underlying data. We wipe ALL caches that could
// be holding stale info for this league. Meta is keyed by slug (not id),
// so the only correct thing to do is drop all meta entries; that's cheap
// and self-heals on the next request.
export function devCacheBust(leagueId: string): void {
  for (const key of bundleCache.keys()) {
    if (key === leagueId || key.startsWith(leagueId + '|')) bundleCache.delete(key)
  }
  for (const key of resolvedCache.keys()) {
    if (key === leagueId || key.startsWith(leagueId)) resolvedCache.delete(key)
  }
  metaCache.clear()
}
