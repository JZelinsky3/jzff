// Vercel Cron — daily Sleeper player-dictionary refresh.
//
// This is the only scheduled thing that calls Sleeper's /players/nfl, and
// after the sleeper_players_cache change it is the only caller anywhere
// (getPlayersNflDict falls back to a live pull only if the cache row has
// never been written). Sleeper's docs ask for at most one call per day.
//
// Schedule: daily at 09:00 UTC (see vercel.json) — an hour before the
// draft-ranks cron, which reads the dictionary this writes.
//
// Auth: same convention as the other crons — Vercel sends CRON_SECRET as a
// Bearer token; anything else is rejected.

import { NextResponse } from 'next/server'
import { refreshSleeperPlayers } from '@/lib/sleeperPlayers'

export const maxDuration = 120

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const { fetched, storedBytes } = await refreshSleeperPlayers()
    return NextResponse.json({
      ok: true,
      players: fetched,
      storedMb: +(storedBytes / 1e6).toFixed(2),
    })
  } catch (e) {
    // A failed refresh leaves the previous row in place, so the site keeps
    // serving yesterday's dictionary rather than losing every player name.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'refresh failed' },
      { status: 502 },
    )
  }
}
