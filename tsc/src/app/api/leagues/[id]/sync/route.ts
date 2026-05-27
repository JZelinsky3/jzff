import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
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
    let result
    if (league.platform === 'sleeper') {
      result = await ingestSleeperLeague(league.id)
    } else if (league.platform === 'nfl') {
      result = await ingestNflLeague(league.id)
    } else if (league.platform === 'espn') {
      result = await ingestEspnLeague(league.id)
    } else if (league.platform === 'yahoo') {
      result = await ingestYahooLeague(league.id)
    } else {
      return NextResponse.json(
        { error: `${league.platform} sync not implemented yet` },
        { status: 400 }
      )
    }
    // Bust both caches so the static site reflects fresh data immediately.
    revalidateTag(`league-${league.id}`, 'max')  // prod: unstable_cache tag
    devCacheBust(league.id)                       // dev: in-memory bundle cache
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
