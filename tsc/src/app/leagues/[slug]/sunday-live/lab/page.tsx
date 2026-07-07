// Sunday Live LAB: the concept bench.
//
// A dev/demo-only sandbox mounted under the same layout (fonts, palette,
// grain) that renders experimental presentation concepts against a real
// showcase frame. Nothing here is wired into the live desk; ideas graduate
// out of the lab by being rebuilt properly in _components/desk. Not linked
// from anywhere; reached by URL.

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSlAccess } from '@/lib/sundayLive/access'
import { loadSundayLive } from '@/lib/sundayLive/load'
import { getSeasonContext, buildWeekContext, type SlWeekContext } from '@/lib/sundayLive/seasonContext'
import type { SlLeague } from '@/lib/sundayLive/types'
import { LabApp, type LabConcept } from '../_components/lab/LabApp'
import type { WorldId } from '../_components/lab/worlds'
import type { Demo } from '../_lib/useSlPoll'

export const dynamic = 'force-dynamic'

type SP = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

function parseDemo(sp: SP): Demo {
  const fallback: Demo = { year: new Date().getFullYear() - 1, week: 8, progress: 0.55 }
  const raw = first(sp.demoWeek)
  if (!raw) return fallback
  const m = /^(\d{4})-(\d{1,2})$/.exec(raw.trim())
  if (!m) return fallback
  const year = Number(m[1])
  const week = Number(m[2])
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 25) return fallback
  let progress = 0.55
  const p = first(sp.progress)
  if (p != null && Number.isFinite(Number(p))) progress = Math.max(0, Math.min(1, Number(p)))
  return { year, week, progress }
}

function parseConcept(sp: SP): LabConcept {
  const c = first(sp.concept)
  return c === 'wall' || c === 'wire' || c === 'palettes' ? c : 'center'
}

function parseWorld(sp: SP): WorldId {
  const w = first(sp.world)
  return w === 'press' ? w : 'almanac'
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
  if (!access.ok || access.locked) notFound()

  const demo = parseDemo(sp)

  // SSR the frame + week context exactly like the real page so bench concepts
  // can show records/streaks/h2h. Scrubbing only changes progress, so the
  // week context stays valid across client refetches.
  let initialFrame: SlLeague | null = null
  let weekContext: SlWeekContext | null = null
  const result = await loadSundayLive(slug, { demo, noSnapshot: true }).catch(() => null)
  if (result?.ok) {
    initialFrame = result.league
    const { data: ctxSeason } = await createAdminClient()
      .from('seasons')
      .select('external_id')
      .eq('league_id', access.leagueId)
      .eq('year', initialFrame.league.year)
      .maybeSingle()
    if (ctxSeason?.external_id) {
      const ctx = await Promise.race([
        getSeasonContext(
          access.leagueId,
          slug,
          initialFrame.league.platform,
          ctxSeason.external_id as string,
          initialFrame.league.year,
          initialFrame.league.week,
        ).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ])
      if (ctx) weekContext = buildWeekContext(initialFrame, ctx)
    }
  }

  return (
    <LabApp
      slug={slug}
      initialDemo={demo}
      initialConcept={parseConcept(sp)}
      initialWorld={parseWorld(sp)}
      initialFrame={initialFrame}
      weekContext={weekContext}
    />
  )
}
