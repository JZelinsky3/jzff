// Cron — daily player value refresh.
//
// Pulls the full Sleeper /players/nfl dictionary, derives position ranks,
// and upserts everything into player_values. The trade grader joins this
// table at grade time to anchor its rationales in real numbers instead
// of vibes.
//
// Schedule: daily, immediately after refresh-sleeper-players and before
// grade-trades. See .github/workflows/cron.yml.
//
// This used to run weekly, on Mondays, which quietly made every trade grade
// up to seven days behind on injuries. The dictionary underneath it already
// refreshed daily; this job was the only thing standing between that fresh
// data and player_values, so a player who had surgery on Wednesday was still
// described as healthy in grades written through Sunday. It is a dictionary
// read plus a chunked upsert against data we already hold, with no
// third-party rate limit in play, so daily costs essentially nothing.
//
// Auth: when CRON_SECRET is set in env, Vercel sends it as a Bearer token.
// We reject anything else so the endpoint isn't a free DoS surface.

import { NextResponse } from 'next/server'
import { refreshSleeperPlayerValues } from '@/lib/playerValues'

// Sleeper /players/nfl is ~5MB; deriving ranks + upserting in chunks
// finishes well under 60s in practice. 300s gives plenty of headroom if
// Supabase or Sleeper is slow.
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const result = await refreshSleeperPlayerValues()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'refresh failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
