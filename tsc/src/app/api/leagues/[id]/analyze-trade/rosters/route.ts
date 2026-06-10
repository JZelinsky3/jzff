// GET /api/leagues/[id]/analyze-trade/rosters
//
// Returns everything the Analyzer's trade-builder UI needs to render:
//   - team grid (one entry per Sleeper roster with owner/team/avatar)
//   - player metadata for every id that appears in any roster
//   - effective Trade Desk settings (commish overrides + auto-detect)
//   - the auto-detect snapshot, so the drawer can show what was inferred
//
// Public read. Anyone viewing the league can use the Analyzer to model
// trades; we don't gate on tier here because the Analyzer is the Phase 3
// headline and the gate (if any) lives one level up at the page level.
//
// Cache: no-store. Rosters churn frequently mid-season and the
// settings JSONB is hand-edited; we'd rather pay one Sleeper hit per
// request than show stale rosters.

import { NextResponse } from 'next/server'
import { loadAnalyzerData } from '@/lib/tradeDesk/analyzer'
import { defaultSlots } from '@/lib/tradeDesk/depth'
import { valuateLeague } from '@/lib/values'

// Sleeper league + users + rosters in parallel = ~700-1500ms; pad to
// 30s so a cold cache or rate-limit retry can still complete.
export const maxDuration = 30

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  // ?year=YYYY — load a specific past season's roster snapshot (offseason
  // testing). Omitted = most recent season.
  const yearParam = new URL(req.url).searchParams.get('year')
  const year = yearParam ? Number(yearParam) : undefined
  const result = await loadAnalyzerData(id, { lookupBy: 'id', year: Number.isFinite(year) ? year : undefined })

  if (!result.ok) {
    const err = result.error
    switch (err.kind) {
      case 'not-found':
        return NextResponse.json({ error: 'league not found' }, { status: 404 })
      case 'unsupported-platform':
        return NextResponse.json(
          { error: 'unsupported-platform', platform: err.platform },
          { status: 409 },
        )
      case 'no-live-id':
        return NextResponse.json(
          { error: 'no-live-id', message: 'No current league id on file. Re-sync the league.' },
          { status: 409 },
        )
      case 'sleeper-failed':
      case 'espn-failed':
      case 'nfl-failed':
      case 'yahoo-failed':
        return NextResponse.json(
          { error: err.kind, message: err.message },
          { status: 502 },
        )
      case 'yahoo-not-connected':
        return NextResponse.json(
          { error: 'yahoo-not-connected', message: 'The league owner has no Yahoo connection. Reconnect in /league/<slug>/sources.' },
          { status: 409 },
        )
    }
  }

  // Attach consensus values to each player so the chip rows can render
  // them inline. valuateLeague() is cached at the provider layer
  // (FantasyCalc daily, KTC weekly, etc.) so the additional latency
  // here is small once warmed up. On the cold path it adds ~500-2000ms.
  let valuesByPid: Record<string, number> = {}
  try {
    const valuation = await valuateLeague({
      mode: result.data.effective.mode,
      qbStarters: result.data.effective.qbStarters,
      teamCount: result.data.effective.teamCount,
    })
    for (const [pid, pv] of valuation.values) {
      valuesByPid[pid] = pv.value
    }
  } catch {
    // Soft-fail: if valuation blows up (rate limit, network), still
    // return roster data with value=0 so the UI degrades gracefully.
  }
  const playersWithValues: typeof result.data.players = {}
  for (const [pid, p] of Object.entries(result.data.players)) {
    playersWithValues[pid] = { ...p, value: valuesByPid[pid] ?? 0 }
  }

  // Merged starter slot counts (commish overrides + defaults). The client
  // uses these to mark which rows in each position group are actually
  // starters / FLEX / SF — so the UI can show "the top 2 RBs are starters"
  // without re-implementing defaultSlots() in JS.
  const slots = defaultSlots(result.data.effective)

  return NextResponse.json(
    { ...result.data, players: playersWithValues, slots },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
