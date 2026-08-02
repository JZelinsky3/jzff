// GET /api/games/gauntlet?pool=<league-slug>&seed=ABCD1234
//
// Deals one run of The Gauntlet: up to forty decided matchups in order, each
// with both teams' records as they stood going in. The whole run arrives in
// one response rather than a request per question, so a streak is reproducible
// from its seed and a link plays the same run for whoever opens it.
//
// The page SSRs its opening run through the same dealGauntlet() this calls;
// this route serves every run after that. Access rules live in the dealer.

import { NextResponse, type NextRequest } from 'next/server'
import { dealGauntlet } from '@/lib/minigames/gauntletDeal'
import { isGauntletMode } from '@/lib/minigames/gauntlet'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  // No auth read, for the same reason the other two game routes skip one: a
  // link shared into a group chat has to play identically for the people in
  // it who have accounts and the people who don't.
  // An unrecognised mode falls back rather than erroring: the modes are a
  // choice of how long to play, not a permission, and a typo in a shared link
  // should still deal a game.
  const raw = params.get('mode')
  const mode = isGauntletMode(raw) ? raw : 'ten'

  const result = await dealGauntlet(params.get('pool') ?? '', mode, params.get('seed'))

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
