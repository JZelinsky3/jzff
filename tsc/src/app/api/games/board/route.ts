// GET /api/games/board?game=roulette&pool=pams&mode=&kind=best&offset=0
//
// One board, plus the viewer's own place on it. Public: boards read the same
// signed out as signed in, minus the pinned "you" row, because a leaderboard
// nobody can see until they have an account is a poor argument for making one.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  loadBoard,
  isGameId,
  boardRowsFor,
  type BoardKind,
} from '@/lib/minigames/leaderboard'

export const dynamic = 'force-dynamic'

const KINDS: BoardKind[] = ['best', 'weekly', 'career']

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  const game = params.get('game') ?? ''
  if (!isGameId(game)) {
    return NextResponse.json({ ok: false, error: 'Unknown game.' }, { status: 404 })
  }

  const poolId = (params.get('pool') ?? '').trim().toLowerCase()
  if (!poolId) {
    return NextResponse.json({ ok: false, error: 'Missing pool.' }, { status: 400 })
  }

  const kindParam = params.get('kind') ?? 'best'
  const kind = (KINDS as string[]).includes(kindParam) ? (kindParam as BoardKind) : 'best'
  const mode = params.get('mode') || null

  // Offsets exist for "show more" on the site board. League boards are
  // bounded by how much their members have played and rarely reach one page,
  // which is also why they run shorter — see boardRowsFor.
  const offset = Math.max(0, Math.min(5000, Number(params.get('offset') ?? 0) || 0))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const board = await loadBoard(kind, { game, mode, poolId }, user?.id ?? null, {
    limit: boardRowsFor(poolId),
    offset,
  })

  return NextResponse.json(
    { ok: true, board, signedIn: !!user },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
