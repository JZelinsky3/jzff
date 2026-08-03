// GET /api/games/multiverse?pool=demo|<league-slug>&seed=ABCD1234
//
// Deals one Multiverse Draft season: seven rounds of cards, the dice, and the
// fourteen opponents. The whole season arrives in one response rather than a
// request per round, so a run is reproducible from its seed and a shared link
// plays the identical cards, the identical rolls and the identical slate.
//
// The page SSRs its opening season through the same dealMultiverse() this
// calls; this route serves every season after that. Access rules live in the
// dealer.

import { NextResponse, type NextRequest } from 'next/server'
import { dealMultiverse } from '@/lib/minigames/multiverseDeal'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  // No auth read, for the same reason the other game routes skip one: a link
  // shared into a group chat has to play identically for the people in it who
  // have accounts and the people who don't.
  const result = await dealMultiverse(params.get('pool') ?? '', params.get('seed'))

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
