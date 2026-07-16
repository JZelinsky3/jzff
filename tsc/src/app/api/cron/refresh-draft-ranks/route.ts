// Vercel Cron — daily draft-rankings refresh for the Mock Room board.
//
// Warms every draft-rank source (ESPN, NFL.com, Sleeper ADP, FantasyPros
// draft cheatsheet) for both scoring formats so the 24h unstable_cache
// entries never expire against a live visitor. Sources that fail report
// their error but don't fail the run — the board degrades to whichever
// outlets answered.
//
// Schedule: daily at 10:00 UTC (see vercel.json). Runs year-round; outside
// draft season the boards just change slowly.
//
// Auth: same convention as the other crons — Vercel sends CRON_SECRET as
// a Bearer token; anything else is rejected.

import { NextResponse } from 'next/server'
import { getSourceRanks, DRAFT_RANK_SOURCES, type DraftRankSourceId } from '@/lib/values/draftRanks'

export const maxDuration = 120

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const year = new Date().getUTCFullYear()
  const ids = DRAFT_RANK_SOURCES.filter((s) => s.id !== 'consensus').map(
    (s) => s.id as Exclude<DraftRankSourceId, 'consensus'>,
  )
  const jobs: Array<{ source: string; scoring: 'ppr' | 'half' }> = []
  for (const id of ids) {
    jobs.push({ source: id, scoring: 'ppr' })
    // Only the scoring-sensitive sources need a second warm.
    if (id === 'sleeper-adp' || id === 'fantasypros-draft') jobs.push({ source: id, scoring: 'half' })
  }

  const results = await Promise.all(
    jobs.map(async (j) => {
      try {
        const rows = await getSourceRanks(j.source as Exclude<DraftRankSourceId, 'consensus'>, {
          year,
          scoring: j.scoring,
          qbStarters: 1,
        })
        return { ...j, ok: true, rows: rows.length }
      } catch (e) {
        return { ...j, ok: false, error: e instanceof Error ? e.message : 'failed' }
      }
    }),
  )

  const failures = results.filter((r) => !r.ok).length
  return NextResponse.json({ year, results }, { status: failures === results.length ? 502 : 200 })
}
