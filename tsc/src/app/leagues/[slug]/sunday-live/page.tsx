// Sunday Live: server entry.
//
// Gates free-tier leagues, server-renders the first frame, seeds the WP
// sparkline from persisted frames, and hands off to the client app which
// polls every 30s. Demo mode (?demoWeek=YYYY-W&progress=0..1) replays a past
// week through the simulator; it is the offseason preview path.

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSundayLive } from '@/lib/sundayLive/load'
import { getSlAccess } from '@/lib/sundayLive/access'
import { readFrameHistory } from '@/lib/sundayLive/snapshots'
import { getSeasonContext, buildWeekContext, type SlWeekContext } from '@/lib/sundayLive/seasonContext'
import { SundayLiveApp } from './_components/SundayLiveApp'
import { LockedGate } from './_components/chrome/LockedGate'
import type { SlView } from './_components/SlProvider'
import type { WpPoint } from './_lib/wpSeries'
import { parseFlips } from './_lib/scenarioFlips'
import { parseDemo, first, type SP } from './_lib/demoParam'

export const dynamic = 'force-dynamic'

function parseView(sp: SP): SlView {
  const v = first(sp.view)
  return v === 'storylines' || v === 'leaders' || v === 'news' || v === 'scenarios' || v === 'ballot'
    ? v
    : 'desk'
}

// Server-rendered dead air: league exists but no broadcast can start (no live
// season, unsupported platform). Demo links reload with query params.
function DeadAir({ slug, reason }: { slug: string; reason: string }) {
  const lastSeason = new Date().getFullYear() - 1
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <div className="sl-offair-bars mb-8 h-20 w-full max-w-md rounded" />
      <p className="sl-kicker mb-2">NO SIGNAL</p>
      <h1 className="sl-display mb-3 text-4xl text-sl-text">WE ARE OFF AIR</h1>
      <p className="mb-8 max-w-md text-sm text-sl-mute">{reason}</p>
      <a
        href={`/leagues/${slug}/sunday-live/?demoWeek=${lastSeason}-8&progress=0.55`}
        className="sl-display rounded border border-sl-electric bg-sl-electric/15 px-4 py-2 text-sm text-sl-text transition-colors hover:bg-sl-electric/30"
      >
        Replay a Sunday
      </a>
    </div>
  )
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<SP>
}) {
  const { slug } = await params
  const sp = await searchParams

  const access = await getSlAccess(slug)
  if (!access.ok) notFound()
  if (access.locked) return <LockedGate meta={access.meta} />

  const demo = parseDemo(sp)
  const result = await loadSundayLive(slug, { demo: demo ?? undefined, noSnapshot: true })
  if (!result.ok) return <DeadAir slug={slug} reason={result.reason} />

  const frame = result.league

  // Seed the WP sparkline from today's persisted frames (live only; demo
  // writes no frames and scrubs its own timeline).
  let wpSeed: WpPoint[] = []
  if (!demo) {
    const history = await readFrameHistory(access.leagueId, frame.league.year, frame.league.week).catch(() => [])
    wpSeed = history.flatMap((f) =>
      (f.payload.matchups ?? []).map((m) => ({ t: f.takenAt, matchupId: m.matchupId, wpA: m.a.wp })),
    )
  }

  // Week context for the stage strip: same cached getter the poll path races,
  // so SSR is what warms it. Generous cap: a stone-cold context (position
  // ranks fan out to per-week stat fetches) must not stall first paint; the
  // strip simply waits for the next visit.
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
    <SundayLiveApp
      slug={slug}
      initialFrame={frame}
      initialDemo={demo}
      initialView={parseView(sp)}
      initialScenarioFlips={parseFlips(first(sp.flips))}
      wpSeed={wpSeed}
      weekContext={weekContext}
    />
  )
}
