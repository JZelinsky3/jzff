// Sunday Live hub — server-renders the first frame from loadSundayLive, then
// hands off to HubBoard which polls every 30s. Gates free-tier (UDFA) leagues
// behind the paywall screen so we don't waste Sleeper work on locked viewers.

import { notFound } from 'next/navigation'
import { loadSundayLive } from '@/lib/sundayLive/load'
import { getSlAccess } from '@/lib/sundayLive/access'
import { SlShell } from './_components/SlShell'
import { SlLocked } from './_components/SlLocked'
import { HubBoard } from './_components/HubBoard'
import { EmptyState } from './_components/EmptyState'
import type { Demo } from './_lib/useSundayLivePoll'

export const dynamic = 'force-dynamic'

type SP = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

function parseDemo(sp: SP): Demo | null {
  const raw = first(sp.demoWeek)
  if (!raw) return null
  const m = /^(\d{4})-(\d{1,2})$/.exec(raw.trim())
  if (!m) return null
  const year = Number(m[1])
  const week = Number(m[2])
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 25) return null
  let progress = 0.5
  const p = first(sp.progress)
  if (p != null && Number.isFinite(Number(p))) progress = Math.max(0, Math.min(1, Number(p)))
  return { year, week, progress }
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
  if (access.locked) return <SlLocked meta={access.meta} />

  const demo = parseDemo(sp)
  const result = await loadSundayLive(slug, { demo: demo ?? undefined })

  if (!result.ok) {
    return (
      <SlShell meta={access.meta}>
        <EmptyState kicker="Broadcast unavailable" title={result.reason}>
          The board refreshes on its own — try again in a moment.
        </EmptyState>
      </SlShell>
    )
  }

  return (
    <SlShell meta={access.meta} liveQuality={result.league.league.liveQuality}>
      <HubBoard slug={slug} initial={result.league} initialDemo={demo} />
    </SlShell>
  )
}
