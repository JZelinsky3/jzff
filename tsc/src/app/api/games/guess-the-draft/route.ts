// GET /api/games/guess-the-draft?pool=demo|<league-slug>&seed=ABCD1234
//
// Deals one card of Guess the Draft: eight redacted manager-seasons, plus the
// answer set (the league's managers and years) the reader picks from. The
// whole card arrives in one response rather than a request per round, so a
// run is reproducible from its seed and shareable as a link.
//
// The page SSRs its opening card through the same dealGuessDraft() this calls;
// this route serves every card after that. Access rules live in the dealer.

import { NextResponse, type NextRequest } from 'next/server'
import { dealGuessDraft } from '@/lib/minigames/guessDraftDeal'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  // No auth read, for the same reason the Roulette route skips one: a link
  // shared into a group chat has to play identically for the people in it
  // who have accounts and the people who don't.
  const result = await dealGuessDraft(params.get('pool') ?? '', params.get('seed'))

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
