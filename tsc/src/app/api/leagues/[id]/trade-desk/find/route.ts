// POST /api/leagues/[id]/trade-desk/find
//
// The Finder's search endpoint. Takes the asking team plus a set of
// selected players and sweeps every other roster for trade packages,
// scored by marginal starting-lineup impact (same metric the Analyzer
// grades on — see src/lib/tradeDesk/finder.ts for the sweep).
//
// Body:
//   { team: ownerId,
//     mode: 'shop' | 'target',
//     players: [playerId, ...],          // shop: yours; target: theirs
//     improvePositions?: ['RB', ...],    // optional QB/RB/WR/TE filter
//     maxPerSide?: 1|2|3 }               // package size, default 2
//
// Returns: { mode, results: FinderDeal[] } — each deal is a minimal core
// trade plus up to 4 add-on variants (same deal with extra pieces).
//
// Public read, mirroring the Analyzer endpoints — page-level tier gating
// happens upstream in the template route (trades/* is Veteran-locked).

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { loadAnalyzerData } from '@/lib/tradeDesk/analyzer'
import { findTrades } from '@/lib/tradeDesk/finder'
import { valuateLeague } from '@/lib/values'

// Roster fetch ~700ms + valuation (cached) + up to ~900 depth sims at
// well under 1ms each — comfortably inside 60s even on a cold cache.
export const maxDuration = 60

const Body = z.object({
  team:    z.string().min(1),
  mode:    z.enum(['shop', 'target']),
  players: z.array(z.string().min(1)).min(1).max(8),
  improvePositions: z.array(z.enum(['QB', 'RB', 'WR', 'TE'])).max(4).optional(),
  maxPerSide: z.number().int().min(1).max(3).optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let raw: unknown
  try { raw = await req.json() } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') },
      { status: 400 },
    )
  }
  const body = parsed.data

  // ?year=YYYY — same past-season pinning the Analyzer supports.
  const yearParam = new URL(req.url).searchParams.get('year')
  const year = yearParam ? Number(yearParam) : undefined

  const load = await loadAnalyzerData(id, {
    lookupBy: 'id',
    year: Number.isFinite(year) ? year : undefined,
  })
  if (!load.ok) {
    const err = load.error
    switch (err.kind) {
      case 'not-found':
        return NextResponse.json({ error: 'league not found' }, { status: 404 })
      case 'unsupported-platform':
        return NextResponse.json({ error: 'unsupported-platform', platform: err.platform }, { status: 409 })
      case 'no-live-id':
        return NextResponse.json({ error: 'no-live-id' }, { status: 409 })
      case 'sleeper-failed':
      case 'espn-failed':
      case 'nfl-failed':
      case 'yahoo-failed':
        return NextResponse.json({ error: err.kind, message: err.message }, { status: 502 })
      case 'yahoo-not-connected':
        return NextResponse.json({ error: 'yahoo-not-connected' }, { status: 409 })
    }
  }
  const data = load.data

  const user = data.rosters.find((r) => r.ownerId === body.team)
  if (!user) {
    return NextResponse.json({ error: 'team not in league' }, { status: 400 })
  }
  const userSet = new Set(user.playerIds)
  if (body.mode === 'shop') {
    for (const pid of body.players) {
      if (!userSet.has(pid)) {
        return NextResponse.json({ error: `player ${pid} not on your roster` }, { status: 400 })
      }
    }
  } else {
    const leagueSet = new Set(data.rosters.flatMap((r) => r.playerIds))
    for (const pid of body.players) {
      if (userSet.has(pid)) {
        return NextResponse.json({ error: `player ${pid} is already on your roster` }, { status: 400 })
      }
      if (!leagueSet.has(pid)) {
        return NextResponse.json({ error: `player ${pid} not rostered in this league` }, { status: 400 })
      }
    }
  }

  let valuation: Awaited<ReturnType<typeof valuateLeague>>
  try {
    valuation = await valuateLeague({
      mode: data.effective.mode,
      qbStarters: data.effective.qbStarters,
      teamCount: data.effective.teamCount,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'valuation failed', message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }

  const results = findTrades({
    data,
    values: valuation.values,
    userOwnerId: body.team,
    mode: body.mode,
    selected: body.players,
    // Zod already constrains these to QB/RB/WR/TE — a strict subset of
    // PositionKey, so they pass through unchanged.
    improvePositions: body.improvePositions,
    maxPerSide: body.maxPerSide,
    limit: 12,
  })

  return NextResponse.json(
    {
      mode: body.mode,
      team: body.team,
      results,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
