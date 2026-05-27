// Vercel Cron — weekly player value refresh.
//
// Pulls the full Sleeper /players/nfl dictionary, derives position ranks,
// and upserts everything into player_values. The trade grader joins this
// table at grade time to anchor its rationales in real numbers instead
// of vibes.
//
// Schedule: Mondays at 13:00 UTC (~9 AM ET, after the NFL Sunday/Monday
// slate so the next-week value shifts have settled). See vercel.json.
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
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await refreshSleeperPlayerValues()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'refresh failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
