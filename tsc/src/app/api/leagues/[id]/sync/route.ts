import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { ingestSleeperLeague } from '@/lib/ingest/sleeper'
import { ingestNflLeague } from '@/lib/ingest/nfl'
import { ingestEspnLeague } from '@/lib/ingest/espn'
import { ingestYahooLeague } from '@/lib/ingest/yahoo'
import { devCacheBust } from '@/lib/devCache'
import { isLeagueLocked } from '@/lib/leagueTier'
import type { IngestStages, IngestYearRange } from '@/lib/ingest/stages'

export const maxDuration = 300 // 5 min, plenty of headroom on Vercel Pro

// Verify the user owns or can edit this league.
// RLS on `leagues` already filters select to readable rows; we additionally
// confirm write access before triggering the admin-client ingestion.
async function authorizeLeague(id: string): Promise<
  | { league: { id: string; owner_id: string | null; platform: string } }
  | { response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const { data: league } = await supabase
    .from('leagues')
    .select('id, owner_id, platform')
    .eq('id', id)
    .maybeSingle()
  if (!league) return { response: NextResponse.json({ error: 'not found' }, { status: 404 }) }
  if (league.owner_id !== user.id) {
    // Check editor membership
    const { data: member } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member || !['owner', 'editor'].includes(member.role)) {
      if (!(await isSiteAdmin(user.id))) {
        return { response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
      }
    }
  }
  return { league }
}

// Collect every platform that has sources attached to this league. Older
// single-source leagues fall back to the leagues.platform column. Without
// this, a league created on Sleeper but later given a Yahoo source would
// only ever sync Sleeper because dispatch went off league.platform alone.
async function leaguePlatforms(leagueId: string, fallback: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data: sourceRows } = await admin
    .from('league_sources')
    .select('platform')
    .eq('league_id', leagueId)
  const platforms = new Set<string>()
  for (const r of sourceRows ?? []) {
    if (r.platform) platforms.add(r.platform as string)
  }
  if (platforms.size === 0) platforms.add(fallback)
  return [...platforms]
}

// How many seasons one chunked request should walk per platform. NFL is
// scrape-bound (~200 gamecenter pages per season) so it gets the smallest
// window; Yahoo is API-fast but deliberately fetched with low concurrency
// (rate limits); ESPN and Sleeper are cheap JSON APIs.
const CHUNK_SEASONS: Record<string, number> = { nfl: 3, espn: 5, yahoo: 3, sleeper: 6 }

export type SyncChunk = { platform: string; from?: number; to?: number }

// Build the chunk plan: for each platform, if EVERY source carries a numeric
// season_start/season_end we can split the union of those ranges into
// year-window chunks; otherwise (walk-history Sleeper/Yahoo sources with no
// declared range) the platform syncs as one un-windowed chunk, same as before.
async function syncChunkPlan(leagueId: string, fallbackPlatform: string): Promise<{ platforms: string[]; chunks: SyncChunk[] }> {
  const admin = createAdminClient()
  const { data: sourceRows } = await admin
    .from('league_sources')
    .select('platform, settings')
    .eq('league_id', leagueId)
  let rows = (sourceRows ?? []).filter((r) => r.platform)
  if (rows.length === 0) {
    // Pre-multi-source league: range (if any) lives on leagues.settings.
    const { data: leagueRow } = await admin
      .from('leagues')
      .select('settings')
      .eq('id', leagueId)
      .maybeSingle()
    rows = [{ platform: fallbackPlatform, settings: leagueRow?.settings ?? null }]
  }

  const byPlatform = new Map<string, Array<{ start?: number; end?: number }>>()
  for (const r of rows) {
    const s = (r.settings ?? {}) as { season_start?: unknown; season_end?: unknown }
    const arr = byPlatform.get(r.platform as string) ?? []
    arr.push({
      start: typeof s.season_start === 'number' ? s.season_start : undefined,
      end: typeof s.season_end === 'number' ? s.season_end : undefined,
    })
    byPlatform.set(r.platform as string, arr)
  }

  const platforms = [...byPlatform.keys()]
  const chunks: SyncChunk[] = []
  for (const [platform, ranges] of byPlatform) {
    const allRanged = ranges.every((r) => r.start != null && r.end != null && r.start <= r.end)
    const size = CHUNK_SEASONS[platform] ?? 4
    if (!allRanged) {
      chunks.push({ platform })
      continue
    }
    const min = Math.min(...ranges.map((r) => r.start!))
    const max = Math.max(...ranges.map((r) => r.end!))
    for (let from = min; from <= max; from += size) {
      chunks.push({ platform, from, to: Math.min(from + size - 1, max) })
    }
  }
  return { platforms, chunks }
}

// GET lists the work a sync would walk — platforms (legacy shape) plus the
// year-window chunk plan — so the client can issue one POST per chunk
// instead of one giant request. A long single-source history (say NFL
// 2014–2025) synced in a single request routinely outlives the Vercel
// function cap: the function gets killed mid-walk around whatever season
// the 300s budget ran out on, the user sees a raw error, and only the
// earlier seasons have their rows on disk.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await authorizeLeague(id)
  if ('response' in auth) return auth.response
  const plan = await syncChunkPlan(auth.league.id, auth.league.platform as string)
  return NextResponse.json(plan)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await authorizeLeague(id)
  if ('response' in auth) return auth.response
  const { league } = auth

  try {
    let platforms = await leaguePlatforms(league.id, league.platform as string)
    // `?platform=` narrows the run to a single source platform and
    // `?from=&to=` to a year window — the chunked sync button walks the
    // history a few seasons per request so no single request has to fit the
    // whole multi-source history under the function cap.
    const search = new URL(req.url).searchParams
    const only = search.get('platform')
    if (only) {
      if (!platforms.includes(only)) {
        return NextResponse.json({ error: `no ${only} source on this league` }, { status: 400 })
      }
      platforms = [only]
    }
    const fromParam = parseInt(search.get('from') ?? '', 10)
    const toParam = parseInt(search.get('to') ?? '', 10)
    const range: IngestYearRange | undefined =
      Number.isFinite(fromParam) || Number.isFinite(toParam)
        ? {
            ...(Number.isFinite(fromParam) ? { from: fromParam } : {}),
            ...(Number.isFinite(toParam) ? { to: toParam } : {}),
          }
        : undefined

    // Aggregate counts across every platform's ingest. Keeping the same
    // top-level shape (seasonsIngested / managersIngested / matchupsIngested /
    // draftsIngested / warnings) the sync button has always rendered means
    // the UI keeps working unchanged for single-platform leagues; mixed-
    // platform leagues just see summed totals plus per-platform warnings.
    type IngestResult = {
      seasonsIngested?: number
      managersIngested?: number
      matchupsIngested?: number
      draftsIngested?: number
      tradesIngested?: number
      warnings?: string[]
    }
    const totals = {
      seasonsIngested: 0,
      managersIngested: 0,
      matchupsIngested: 0,
      draftsIngested: 0,
      tradesIngested: 0,
      warnings: [] as string[],
    }
    // UDFA leagues only need data that feeds the unlocked pages: matchups
    // (standings + rivalries) and lineups (manager profile shell). Drafts
    // and trades feed locked surfaces — skip them at ingest so we're not
    // burning API quota / DB writes on data the public almanac will never
    // surface. If the league later upgrades to paid, a fresh sync will
    // backfill drafts + trades.
    const udfaLocked = await isLeagueLocked(league.id, league.owner_id)
    const stages: IngestStages | undefined = udfaLocked
      ? { drafts: false, trades: false }
      : undefined

    const errors: Array<{ platform: string; error: string }> = []
    for (const p of platforms) {
      try {
        let r: IngestResult | undefined
        if (p === 'sleeper') r = await ingestSleeperLeague(league.id, stages, range)
        else if (p === 'nfl') r = await ingestNflLeague(league.id, stages, range)
        else if (p === 'espn') r = await ingestEspnLeague(league.id, stages, range)
        else if (p === 'yahoo') r = await ingestYahooLeague(league.id, stages, range)
        else { errors.push({ platform: p, error: `${p} sync not implemented yet` }); continue }
        totals.seasonsIngested += r?.seasonsIngested ?? 0
        totals.managersIngested += r?.managersIngested ?? 0
        totals.matchupsIngested += r?.matchupsIngested ?? 0
        totals.draftsIngested += r?.draftsIngested ?? 0
        totals.tradesIngested += r?.tradesIngested ?? 0
        if (Array.isArray(r?.warnings)) {
          for (const w of r!.warnings!) totals.warnings.push(`[${p}] ${w}`)
        }
      } catch (err) {
        errors.push({ platform: p, error: err instanceof Error ? err.message : 'sync failed' })
      }
    }

    // Bust both caches so the static site reflects fresh data immediately.
    revalidateTag(`league-${league.id}`, 'max')  // prod: unstable_cache tag
    devCacheBust(league.id)                       // dev: in-memory bundle cache

    // Surface partial failures so the UI can show which platform broke. The
    // overall request only 500s when every platform failed.
    if (errors.length === platforms.length && platforms.length > 0) {
      return NextResponse.json({ error: errors.map((e) => `${e.platform}: ${e.error}`).join('; ') }, { status: 500 })
    }
    if (errors.length > 0) {
      for (const e of errors) totals.warnings.push(`[${e.platform}] sync failed: ${e.error}`)
    }
    return NextResponse.json(totals)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
