import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { ingestSleeperSource } from '@/lib/ingest/sleeper'
import { ingestNflSource } from '@/lib/ingest/nfl'
import { ingestEspnSource, type EspnSourceSettings } from '@/lib/ingest/espn'
import { ingestYahooSource } from '@/lib/ingest/yahoo'
import { getValidAccessToken as getYahooAccessToken } from '@/lib/platforms/yahoo'
import { devCacheBust } from '@/lib/devCache'
import { isLeagueLocked } from '@/lib/leagueTier'

export const maxDuration = 300

// Vercel Cron — weekly live sync. Re-ingests every league_source flagged
// is_live (the in-progress season): pulls the finished week's scores and the
// upcoming week's matchups. History sources are immutable, so they're skipped.
//
// The current pick'ems week is NOT advanced here — it's derived on read from
// the season start date (see src/lib/liveSeason.ts), so it advances on its own.
//
// Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
export async function GET(req: Request) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const db = createAdminClient()
  const { data: sources } = await db
    .from('league_sources')
    .select('id, league_id, platform, external_id, walk_history, settings')
    .eq('is_live', true)

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

  for (const src of sources ?? []) {
    if (await leagueIsLocked(src.league_id)) {
      skipped.push({ source: src.external_id, league_id: src.league_id, reason: 'udfa-locked' })
      continue
    }
    try {
      if (src.platform === 'sleeper') {
        await ingestSleeperSource(src.league_id, src.external_id, src.walk_history)
      } else if (src.platform === 'nfl') {
        await ingestNflSource(src.league_id, src.external_id, (src.settings ?? {}) as Record<string, number>)
      } else if (src.platform === 'espn') {
        await ingestEspnSource(src.league_id, src.external_id, (src.settings ?? {}) as EspnSourceSettings)
      } else if (src.platform === 'yahoo') {
        // Yahoo needs a per-user access token — look up the league owner and
        // resolve a valid (refresh-if-needed) token before calling the source ingest.
        const { data: lg } = await db.from('leagues').select('owner_id').eq('id', src.league_id).maybeSingle()
        if (!lg?.owner_id) throw new Error('Yahoo league has no owner; cannot refresh.')
        const token = await getYahooAccessToken(lg.owner_id, db)
        await ingestYahooSource(src.league_id, src.external_id, src.walk_history, token)
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

  return NextResponse.json({
    synced: results.filter((r) => r.ok).length,
    total: results.length,
    skipped: skipped.length,
    results,
    skippedDetail: skipped,
  })
}
