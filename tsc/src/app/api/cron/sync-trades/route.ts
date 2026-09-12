// Cron — trades-only re-ingest of the current season.
//
// WHY THIS EXISTS, SEPARATE FROM /api/cron/refresh:
// Trades used to reach the database through one path only, the full weekly
// refresh that runs Tuesday night. Everything else in the trade pipeline is
// daily, so the weekly step set the pace: a trade agreed to on a Wednesday
// did not exist on the site until the following Tuesday, got graded the
// next morning, and landed on the page eight days after the league had
// already moved on. For an in-season feature that is the whole ballgame.
//
// The full refresh is too heavy to run daily (every week's matchups, every
// lineup, every draft, for every live source). The ingest is stage-gated,
// so this route runs the trades stage alone, scoped to the current season.
// That skips the per-week matchup and lineup fetches entirely and leaves
// the weekly refresh to do what only it can do.
//
// Trades ingest is idempotent: transactions are keyed by their platform id,
// so re-walking the same weeks every day re-writes the same rows and picks
// up whatever is new. A missed day costs nothing but a day.
//
// Grading does NOT happen here. It runs afterwards in /api/cron/grade-trades,
// which is deliberately sequenced after the value refresh so nothing gets
// graded against yesterday's market. See .github/workflows/cron.yml.

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { ingestSleeperSource } from '@/lib/ingest/sleeper'
import { ingestEspnSource, type EspnSourceSettings } from '@/lib/ingest/espn'
import { ingestYahooSource } from '@/lib/ingest/yahoo'
import { getValidAccessToken as getYahooAccessToken } from '@/lib/platforms/yahoo'
import { sleeper } from '@/lib/platforms/sleeper'
import { devCacheBust } from '@/lib/devCache'
import { isLeagueLocked } from '@/lib/leagueTier'
import type { IngestStages } from '@/lib/ingest/stages'

export const maxDuration = 300

// Trades only. Every other stage is the weekly refresh's job.
const TRADES_ONLY: IngestStages = {
  matchups: false,
  drafts: false,
  lineups: false,
  trades: true,
}

// The NFL season year, which is not the calendar year from January through
// the Super Bowl. Sleeper's /state/nfl is authoritative and free; the date
// fallback only matters if that call fails, and it uses March as the rollover
// so a February run still reports the season that is finishing.
async function currentSeasonYear(): Promise<number> {
  try {
    const st = await sleeper.state()
    const y = Number(st?.season)
    if (Number.isFinite(y) && y > 2000) return y
  } catch {
    // fall through to the date estimate
  }
  const now = new Date()
  return now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const year = await currentSeasonYear()

  const { data: sources } = await db
    .from('league_sources')
    .select('id, league_id, platform, external_id, walk_history, settings')
    .eq('is_live', true)

  const results: Array<{ source: string; league_id: string; ok: boolean; trades?: number; error?: string }> = []
  const skipped: Array<{ source: string; league_id: string; reason: string }> = []
  const touchedLeagues = new Set<string>()

  // Same tier gate as the weekly refresh: trades are a paid feature, so a
  // UDFA league's sources aren't worth the fetch. Cached per league so a
  // multi-source league pays one tier lookup.
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

  for (const src of sources ?? []) {
    if (await leagueIsLocked(src.league_id)) {
      skipped.push({ source: src.external_id, league_id: src.league_id, reason: 'udfa-locked' })
      continue
    }
    // fantasy.nfl.com was retired ahead of 2026 and serves nothing to scrape.
    if (src.platform === 'nfl') {
      skipped.push({ source: src.external_id, league_id: src.league_id, reason: 'nfl-sunset' })
      continue
    }
    try {
      let trades = 0
      if (src.platform === 'sleeper') {
        // walk_history is forced false: history sources are immutable and a
        // current-season trade sweep has no reason to walk back through them.
        const r = await ingestSleeperSource(
          src.league_id,
          src.external_id,
          false,
          { seasonStart: year, seasonEnd: year },
          TRADES_ONLY,
        )
        trades = r.tradesIngested ?? 0
      } else if (src.platform === 'espn') {
        const r = await ingestEspnSource(
          src.league_id,
          src.external_id,
          (src.settings ?? {}) as EspnSourceSettings,
          TRADES_ONLY,
          { from: year, to: year },
        )
        trades = r.tradesIngested ?? 0
      } else if (src.platform === 'yahoo') {
        const { data: lg } = await db.from('leagues').select('owner_id').eq('id', src.league_id).maybeSingle()
        if (!lg?.owner_id) throw new Error('Yahoo league has no owner; cannot sync trades.')
        const token = await getYahooAccessToken(lg.owner_id, db)
        const r = await ingestYahooSource(
          src.league_id,
          src.external_id,
          false,
          token,
          { seasonStart: year, seasonEnd: year },
          TRADES_ONLY,
        )
        trades = r.tradesIngested ?? 0
      } else {
        throw new Error(`${src.platform} trade sync not implemented`)
      }
      touchedLeagues.add(src.league_id)
      results.push({ source: src.external_id, league_id: src.league_id, ok: true, trades })
    } catch (err) {
      results.push({
        source: src.external_id,
        league_id: src.league_id,
        ok: false,
        error: err instanceof Error ? err.message : 'unknown error',
      })
    }
  }

  // Deliberately NOT stamping league_sources.last_synced_at here. That field
  // is the user-facing "last synced" on the sources page and it means a FULL
  // sync; a trades-only pass touching it would tell a commissioner their
  // matchups were current when they are up to a week old.
  for (const leagueId of touchedLeagues) {
    revalidateTag(`league-${leagueId}`, 'max')
    devCacheBust(leagueId)
  }

  const tradesIngested = results.reduce((n, r) => n + (r.trades ?? 0), 0)
  return NextResponse.json({
    season: year,
    synced: results.filter((r) => r.ok).length,
    total: results.length,
    tradesIngested,
    skipped: skipped.length,
    results,
    skippedDetail: skipped,
  })
}
