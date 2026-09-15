import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { ingestSleeperSource } from '@/lib/ingest/sleeper'

import { ingestEspnSource, type EspnSourceSettings } from '@/lib/ingest/espn'
import { ingestYahooSource } from '@/lib/ingest/yahoo'
import { getValidAccessToken as getYahooAccessToken } from '@/lib/platforms/yahoo'
import { devCacheBust } from '@/lib/devCache'
import { isLeagueLocked } from '@/lib/leagueTier'
import type { IngestYearRange } from '@/lib/ingest/stages'
import { getNflClock } from '@/lib/nflClock'

export const maxDuration = 300

// Weekly live sync, driven by .github/workflows/cron.yml. Re-ingests every
// league_source flagged is_live (the in-progress season): pulls the finished
// week's scores and the upcoming week's matchups. History sources are
// immutable, so they're skipped.
//
// The current pick'ems week is NOT advanced here — it's derived on read from
// the season start date (see src/lib/liveSeason.ts), so it advances on its own.
//
// ── TWO REASONS THIS USED TO 504 ─────────────────────────────────────────
// The first scheduled run of this route (2026-09-15) died on the 300s
// function cap at 5m08s, taking the whole chain with it.
//
//  1. It passed no year range, so a "live sync" re-walked every season of
//     every league's entire history, every week. pams alone is seven years.
//     Nothing before the current season can change, so the walk is now
//     pinned to the NFL clock's season and the other six years are never
//     fetched. This is the fix that matters.
//  2. Even so, one request for every live source in the system is unbounded
//     work in a bounded function: it gets slower with every league that
//     signs up, and the failure mode is a 504 that syncs some leagues and
//     silently abandons the rest. So the route now stops when it runs out
//     of time budget and reports where it stopped, and the workflow calls
//     it again from there.
//
// Paging is by `?offset=` over sources in a stable id order, NOT by a
// "sync the stalest first" cursor. Offsets always advance, so a source that
// throws every time can't wedge the loop into retrying it forever while the
// leagues behind it never sync.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`. Fail closed if CRON_SECRET is
// unset so a missing-env misconfiguration doesn't open the ingest endpoint to
// anonymous callers.

// Stop STARTING new sources after this much wall clock, leaving the rest of
// maxDuration for the one already in flight to land. A single season ingest
// is tens of seconds; 120s of headroom covers a slow one without inviting a
// 504 that would lose the results collected so far.
const START_BUDGET_MS = 180_000

export async function GET(req: Request) {
  const startedAt = Date.now()
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const offset = Math.max(0, Number(new URL(req.url).searchParams.get('offset') ?? 0) || 0)

  // Only the season that's actually in progress. Falling back to the calendar
  // year when the clock is unreachable is safe: the worst case is one wasted
  // pass in early January, not a seven-year re-walk.
  const season = (await getNflClock())?.season ?? new Date().getUTCFullYear()
  // Same window, two spellings: the sleeper and yahoo source ingests take
  // {seasonStart, seasonEnd}, the espn one takes IngestYearRange's {from, to}.
  // They are not interchangeable and TypeScript is the only thing that says so.
  const range = { seasonStart: season, seasonEnd: season }
  const espnRange: IngestYearRange = { from: season, to: season }

  const db = createAdminClient()
  const { data: sources } = await db
    .from('league_sources')
    .select('id, league_id, platform, external_id, walk_history, settings')
    .eq('is_live', true)
    .order('id', { ascending: true })

  const results: Array<{ source: string; league_id: string; ok: boolean; error?: string }> = []
  const skipped: Array<{ source: string; league_id: string; reason: string }> = []
  const touchedLeagues = new Set<string>()

  // UDFA leagues don't get cron refreshes — live data is a paid
  // feature and we don't want to spend cron budget on free-tier archives
  // that can't display it anyway. Cache the per-league lock result so we
  // only pay the tier lookup once per league per run.
  const lockedCache = new Map<string, boolean>()
  async function leagueIsLocked(leagueId: string): Promise<boolean> {
    const cached = lockedCache.get(leagueId)
    if (cached !== undefined) return cached
    const { data: lg } = await db
      .from('leagues')
      .select('owner_id')
      .eq('id', leagueId)
      .maybeSingle()
    const locked = await isLeagueLocked(leagueId, lg?.owner_id ?? null)
    lockedCache.set(leagueId, locked)
    return locked
  }

  const all = sources ?? []
  const queue = all.slice(offset)
  let cursor = offset

  for (const src of queue) {
    // Out of budget. Stop cleanly with a 200 and say where to resume, rather
    // than pressing on into a 504 that would discard every result above.
    if (Date.now() - startedAt > START_BUDGET_MS) break
    cursor++
    if (await leagueIsLocked(src.league_id)) {
      skipped.push({ source: src.external_id, league_id: src.league_id, reason: 'udfa-locked' })
      continue
    }
    // NFL Fantasy was retired ahead of 2026 and fantasy.nfl.com no longer
    // serves league pages, so there is nothing left to refresh. Skipping here
    // (rather than letting the ingest throw) keeps the run quiet and cheap.
    if (src.platform === 'nfl') {
      skipped.push({ source: src.external_id, league_id: src.league_id, reason: 'nfl-sunset' })
      continue
    }
    try {
      if (src.platform === 'sleeper') {
        await ingestSleeperSource(src.league_id, src.external_id, src.walk_history, range)
      } else if (src.platform === 'espn') {
        await ingestEspnSource(
          src.league_id,
          src.external_id,
          (src.settings ?? {}) as EspnSourceSettings,
          undefined,
          espnRange,
        )
      } else if (src.platform === 'yahoo') {
        // Yahoo needs a per-user access token — look up the league owner and
        // resolve a valid (refresh-if-needed) token before calling the source ingest.
        const { data: lg } = await db.from('leagues').select('owner_id').eq('id', src.league_id).maybeSingle()
        if (!lg?.owner_id) throw new Error('Yahoo league has no owner; cannot refresh.')
        const token = await getYahooAccessToken(lg.owner_id, db)
        await ingestYahooSource(src.league_id, src.external_id, src.walk_history, token, range)
      } else {
        throw new Error(`${src.platform} sync not implemented`)
      }
      await db.from('league_sources').update({ last_synced_at: new Date().toISOString() }).eq('id', src.id)
      touchedLeagues.add(src.league_id)
      results.push({ source: src.external_id, league_id: src.league_id, ok: true })
    } catch (err) {
      results.push({
        source: src.external_id,
        league_id: src.league_id,
        ok: false,
        error: err instanceof Error ? err.message : 'unknown error',
      })
    }
  }

  for (const leagueId of touchedLeagues) {
    await db.from('leagues').update({ last_synced_at: new Date().toISOString() }).eq('id', leagueId)
    revalidateTag(`league-${leagueId}`, 'max')
    devCacheBust(leagueId)
  }

  const done = cursor >= all.length
  return NextResponse.json({
    season,
    done,
    // Where the next call picks up. Null when there's nothing left, which is
    // the flag the workflow loops on.
    nextOffset: done ? null : cursor,
    sources: all.length,
    synced: results.filter((r) => r.ok).length,
    total: results.length,
    skipped: skipped.length,
    elapsedMs: Date.now() - startedAt,
    results,
    skippedDetail: skipped,
  })
}
