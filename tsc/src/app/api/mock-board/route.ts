// GET /api/mock-board?scoring=ppr&qbs=1&srcs=espn-draft,fantasypros-draft
//
// The Mock Room's player board: real preseason DRAFT rankings (ESPN,
// NFL.com, Sleeper ADP, FantasyPros draft cheatsheet — see
// lib/values/draftRanks.ts), single-source or rank-averaged consensus.
// League-agnostic on purpose — the board is the same for every league on
// a given scoring format, so it lives outside the per-league bundle. Each
// source caches for 24h and a daily cron keeps them warm through draft
// season.

import { NextResponse } from 'next/server'
import {
  buildDraftBoard,
  parseDraftSourceParam,
  DRAFT_RANK_SOURCES,
  type DraftFeedId,
} from '@/lib/values/draftRanks'

function clampInt(raw: string | null, lo: number, hi: number, dflt: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return dflt
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const qbStarters = clampInt(url.searchParams.get('qbs'), 1, 2, 1)
  const scoring = url.searchParams.get('scoring') === 'half' ? 'half' : 'ppr'
  // `srcs` picks any subset of outlets to blend (1 = that board verbatim,
  // 2+ = consensus over just those, empty/absent = all). The older `source`
  // param still works for single-source or full consensus.
  const feedIds = DRAFT_RANK_SOURCES.filter((s) => s.id !== 'consensus').map((s) => s.id)
  let sources = (url.searchParams.get('srcs') ?? '')
    .split(',')
    .filter((s) => (feedIds as string[]).includes(s)) as DraftFeedId[]
  if (sources.length === 0) {
    const legacy = parseDraftSourceParam(url.searchParams.get('source'))
    if (legacy !== 'consensus') sources = [legacy]
  }
  // Rankings target the upcoming season; Sleeper/ESPN/FP all publish the
  // new year's boards by spring.
  const year = new Date().getUTCFullYear()

  try {
    const board = await buildDraftBoard({ year, scoring, qbStarters, sources })
    return NextResponse.json(
      {
        source: board.source,
        label: board.label,
        sources: board.sources.filter((s) => s.ok),
        ctx: { year, scoring, qbs: qbStarters },
        players: board.players,
      },
      {
        headers: {
          // CDN-cache the board: sources refresh daily anyway, so an hour
          // at the edge costs nothing in freshness.
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'rankings unavailable' },
      { status: 502 },
    )
  }
}
