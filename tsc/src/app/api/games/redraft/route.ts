// GET /api/games/redraft?pool=demo|<league-slug>&mode=round1|manager&seed=ABCD1234
//
// Deals one Redraft board: a set of real draft slots, each with the six-man
// shortlist that was genuinely available. The whole board arrives in one
// response rather than a request per pick, so a run is reproducible from its
// seed and a link plays the identical board for whoever opens it.
//
// The page SSRs its opening board through the same dealRedraft() this calls;
// this route serves every board after that. Access rules live in the dealer.

import { NextResponse, type NextRequest } from 'next/server'
import { dealRedraft } from '@/lib/minigames/redraftDeal'
import { isRedraftMode } from '@/lib/minigames/redraft'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  // An unrecognised mode falls back rather than erroring: the two modes are a
  // choice of question, not a permission, and a typo in a shared link should
  // still deal a game.
  const raw = params.get('mode')
  const mode = isRedraftMode(raw) ? raw : 'manager'

  // No auth read, for the same reason the other game routes skip one: a link
  // shared into a group chat has to play identically for the people in it who
  // have accounts and the people who don't.
  const result = await dealRedraft(params.get('pool') ?? '', mode, params.get('seed'))

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
