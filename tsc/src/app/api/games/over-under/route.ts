// GET /api/games/over-under?pool=<league-slug>&seed=ABCD1234
//
// Deals one card of the Over/Under: ten real team-weeks, each with a line
// hung on it. The whole card arrives in one response rather than a request per
// call, so a card is reproducible from its seed and a link plays the identical
// ten lines for whoever opens it.
//
// The page SSRs its opening card through the same dealOverUnder() this calls;
// this route serves every card after that. Access rules live in the dealer.

import { NextResponse, type NextRequest } from 'next/server'
import { dealOverUnder } from '@/lib/minigames/overUnderDeal'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  // No auth read, for the same reason the other game routes skip one: a link
  // shared into a group chat has to play identically for the people in it who
  // have accounts and the people who don't.
  const result = await dealOverUnder(params.get('pool') ?? '', params.get('seed'))

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
