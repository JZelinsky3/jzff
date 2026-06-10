// GET /api/leagues/[id]/trade-desk/status
//
// Lightweight seasonal context for the Trade Desk hub: current NFL
// phase/week and the league's trade deadline. { known: false } when the
// platform can't answer (non-Sleeper, stale season, API failure) — the
// hub simply skips the stamp.

import { NextResponse } from 'next/server'
import { getDeadlineStatus } from '@/lib/tradeDesk/deadline'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const status = await getDeadlineStatus(id)
  return NextResponse.json(status, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
