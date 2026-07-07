// One game's own page: the room for members who came to watch their matchup
// and nothing else. Same access gate and loader as the desk (the engine
// builds league frames, not matchup frames), but the render is scoped to the
// two teams. Old permalinks shared in league chats land here and just work.

import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSundayLive } from '@/lib/sundayLive/load'
import { getSlAccess } from '@/lib/sundayLive/access'
import { getSeasonContext, buildWeekContext, type SlWeekContext } from '@/lib/sundayLive/seasonContext'
import { GameRoom } from '../../_components/game/GameRoom'
import { LockedGate } from '../../_components/chrome/LockedGate'
import { parseDemo, demoQuery, type SP } from '../../_lib/demoParam'

export const dynamic = 'force-dynamic'

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<SP>
}) {
  const { slug, id } = await params
  const sp = await searchParams

  const access = await getSlAccess(slug)
  if (!access.ok) notFound()
  if (access.locked) return <LockedGate meta={access.meta} />

  const demo = parseDemo(sp)
  const result = await loadSundayLive(slug, { demo: demo ?? undefined, noSnapshot: true })
  if (!result.ok) redirect(`/leagues/${slug}/sunday-live/${demoQuery(demo)}`)

  const frame = result.league
  const matchupId = Number(id)
  if (!Number.isFinite(matchupId) || !frame.matchups.some((m) => m.matchupId === matchupId)) {
    redirect(`/leagues/${slug}/sunday-live/${demoQuery(demo)}`)
  }

  // Same cached week context the desk warms; a cold one just means the room
  // opens without records/series/form until the next visit.
  let weekContext: SlWeekContext | null = null
  const { data: ctxSeason } = await createAdminClient()
    .from('seasons')
    .select('external_id')
    .eq('league_id', access.leagueId)
    .eq('year', frame.league.year)
    .maybeSingle()
  if (ctxSeason?.external_id) {
    const ctx = await Promise.race([
      getSeasonContext(
        access.leagueId,
        slug,
        frame.league.platform,
        ctxSeason.external_id as string,
        frame.league.year,
        frame.league.week,
      ).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ])
    if (ctx) weekContext = buildWeekContext(frame, ctx)
  }

  return (
    <GameRoom
      slug={slug}
      initialFrame={frame}
      initialDemo={demo}
      matchupId={matchupId}
      weekContext={weekContext}
    />
  )
}
