// GET /leagues/<slug>/powerrank/data — power rankings + Monte Carlo projections.
// Not cached: reflects matchup scores that change through the season.

import { NextResponse } from 'next/server'
import { getPowerRankings } from '@/lib/powerRankings'

export const maxDuration = 60

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const data = await getPowerRankings(slug)
  if (data === null) return new NextResponse('League not found', { status: 404 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
