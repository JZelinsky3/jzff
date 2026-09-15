// GET /leagues/<slug>/live/weekly/data — the composed weekly digest that
// backs templates/pams-mobile/live/weekly/. One fetch, already reduced;
// see src/lib/weekly.ts for what goes into it.
//
// Not cached: pick'em submissions, trades and the live week all move
// during the week, and this page exists to be re-opened.

import { NextResponse } from 'next/server'
import { getWeeklyState } from '@/lib/weekly'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const state = await getWeeklyState(slug)
  if (state.status === 'no-league') return new NextResponse('League not found', { status: 404 })
  if (state.status === 'locked') return new NextResponse('Locked', { status: 404 })
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } })
}
