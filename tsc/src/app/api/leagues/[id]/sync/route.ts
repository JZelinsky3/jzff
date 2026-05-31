import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ingestSleeperLeague } from '@/lib/ingest/sleeper'
import { ingestNflLeague } from '@/lib/ingest/nfl'
import { ingestEspnLeague } from '@/lib/ingest/espn'
import { ingestYahooLeague } from '@/lib/ingest/yahoo'
import { devCacheBust } from '@/lib/devCache'

export const maxDuration = 300 // 5 min, plenty of headroom on Vercel Pro

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Verify the user owns or can edit this league.
  // RLS on `leagues` already filters select to readable rows; we additionally
  // confirm write access before triggering the admin-client ingestion.
  const { data: league } = await supabase
    .from('leagues')
    .select('id, owner_id, platform')
    .eq('id', id)
    .maybeSingle()
  if (!league) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (league.owner_id !== user.id) {
    // Check editor membership
    const { data: member } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member || !['owner', 'editor'].includes(member.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  try {
    // Collect every platform that has sources attached to this league. Older
    // single-source leagues fall back to the leagues.platform column. Without
    // this, a league created on Sleeper but later given a Yahoo source would
    // only ever sync Sleeper because dispatch went off league.platform alone.
    const admin = createAdminClient()
    const { data: sourceRows } = await admin
      .from('league_sources')
      .select('platform')
      .eq('league_id', league.id)
    const platforms = new Set<string>()
    for (const r of sourceRows ?? []) {
      if (r.platform) platforms.add(r.platform as string)
    }
    if (platforms.size === 0) platforms.add(league.platform as string)

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
    const errors: Array<{ platform: string; error: string }> = []
    for (const p of platforms) {
      try {
        let r: IngestResult | undefined
        if (p === 'sleeper') r = await ingestSleeperLeague(league.id)
        else if (p === 'nfl') r = await ingestNflLeague(league.id)
        else if (p === 'espn') r = await ingestEspnLeague(league.id)
        else if (p === 'yahoo') r = await ingestYahooLeague(league.id)
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
    if (errors.length === platforms.size && platforms.size > 0) {
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
