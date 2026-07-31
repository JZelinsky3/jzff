// GET /api/games/roulette?pool=site|<league-slug>&seed=ABCD1234
//
// Deals one game of Roster Roulette: nine manager-seasons (seven slots plus
// two rerolls), rosters attached, scored against the pool's rank profile.
// The whole game arrives in one response rather than a request per spin, so
// a run is reproducible from its seed and shareable as a link. The client
// holds the undealt spins but reveals them one at a time.
//
// The page SSRs its opening wheel through the same dealGame() this calls;
// this route serves every wheel after that. Access rules live in dealGame.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dealGame } from '@/lib/minigames/deal'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const result = await dealGame(params.get('pool') ?? 'site', params.get('seed'), user?.id ?? null)

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
