// GET /leagues/<slug>/live/trades/data — every completed trade for the
// league, newest first, with the platform-provided assets per side.
// Phase 1: grades are null on every side (the LLM grader lands in Phase 2).
// Not cached: trades land mid-season and the page should reflect them quickly.

import { NextResponse } from 'next/server'
import { getTradesState } from '@/lib/trades'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const state = await getTradesState(slug)
  if (state === null) return new NextResponse('League not found', { status: 404 })
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } })
}
