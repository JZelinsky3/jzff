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

    const results: Record<string, unknown> = {}
    const errors: Array<{ platform: string; error: string }> = []
    for (const p of platforms) {
      try {
        if (p === 'sleeper') results[p] = await ingestSleeperLeague(league.id)
        else if (p === 'nfl') results[p] = await ingestNflLeague(league.id)
        else if (p === 'espn') results[p] = await ingestEspnLeague(league.id)
        else if (p === 'yahoo') results[p] = await ingestYahooLeague(league.id)
        else errors.push({ platform: p, error: `${p} sync not implemented yet` })
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
    return NextResponse.json({ results, errors: errors.length ? errors : undefined })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
