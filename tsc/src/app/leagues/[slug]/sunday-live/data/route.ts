// Polling endpoint — returns the same SlLeague payload the SSR page renders.
// useSundayLivePoll hits this every 30s.

import { NextResponse, type NextRequest } from 'next/server'
import { loadSundayLive } from '@/lib/sundayLive/load'
import { getSlAccess } from '@/lib/sundayLive/access'
import type { LoadOptions } from '@/lib/sundayLive/types'

export const dynamic = 'force-dynamic'

function parseDemo(url: URL): LoadOptions['demo'] | null {
  const raw = url.searchParams.get('demoWeek')
  if (!raw) return null
  const m = /^(\d{4})-(\d{1,2})$/.exec(raw.trim())
  if (!m) return null
  const year = Number(m[1])
  const week = Number(m[2])
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 25) return null
  let progress = 0.5
  const p = url.searchParams.get('progress')
  if (p != null && Number.isFinite(Number(p))) progress = Math.max(0, Math.min(1, Number(p)))
  return { year, week, progress }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await getSlAccess(slug)
  if (!access.ok)     return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (access.locked)  return NextResponse.json({ error: 'locked' }, { status: 403 })

  const url = new URL(req.url)
  const demo = parseDemo(url)
  const result = await loadSundayLive(slug, { demo: demo ?? undefined })
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 502 })
  return NextResponse.json(result.league)
}
