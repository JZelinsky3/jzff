// POST /api/games/runs
//
// Puts a finished run on a board. The body carries the seed and the CHOICES
// the player made; it never carries a score. This route re-deals the seed,
// replays the choices and derives the number itself (see verifyRun.ts), then
// writes the row with the admin client.
//
// Takes an array, because free-play runs BANK in the browser while you are
// signed out and get claimed in one go when you sign in. A banked run is
// verified exactly like a live one — the server re-deals its seed either way
// — so there is no reason to trust it less for having waited.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyRun } from '@/lib/minigames/verifyRun'
import {
  isGameId,
  weekStartFor,
  weeklySeed,
  boardSize,
  type GameId,
} from '@/lib/minigames/leaderboard'

export const dynamic = 'force-dynamic'

/** Runs one claim may carry. A long session banks a handful, not hundreds. */
const MAX_BATCH = 25

type Incoming = {
  game?: unknown
  mode?: unknown
  pool?: unknown
  seed?: unknown
  picks?: unknown
  /**
   * Set by the client when the wheel came from a shared `?seed=` link.
   * Those replay a known deal, which is the definition of a run that cannot
   * be ranked, so they are refused rather than silently dropped.
   */
  shared?: unknown
  /** Set when the run was played on the week's shared board. */
  weekly?: unknown
}

type Outcome = {
  ok: boolean
  /** Why it didn't post, in words the recap can show as-is. */
  error?: string
  runId?: string
  score?: number
  /** Where it landed, returned with the post so the recap needs no second
      request to say "4th of 812". */
  rank?: number
  total?: number
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Not an error state in the UI: the recap shows "sign in to put this on
    // the board" and keeps the run banked until they do.
    return NextResponse.json(
      { ok: false, needsAuth: true, error: 'Sign in to put a run on the board.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 })
  }

  const raw = body as { runs?: unknown }
  const list: Incoming[] = Array.isArray(raw?.runs)
    ? (raw.runs as Incoming[])
    : [body as Incoming]

  if (list.length === 0 || list.length > MAX_BATCH) {
    return NextResponse.json(
      { ok: false, error: `Send between 1 and ${MAX_BATCH} runs.` },
      { status: 400 }
    )
  }

  const db = createAdminClient()
  const results: Outcome[] = []

  for (const item of list) {
    results.push(await postOne(db, user.id, item))
  }

  return NextResponse.json(
    { ok: results.some((r) => r.ok), results },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

async function postOne(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  item: Incoming
): Promise<Outcome> {
  const game = typeof item.game === 'string' ? item.game : ''
  if (!isGameId(game)) return { ok: false, error: 'Unknown game.' }

  const poolId = typeof item.pool === 'string' ? item.pool.trim().toLowerCase() : ''
  const seed = typeof item.seed === 'string' ? item.seed.trim().toUpperCase() : ''
  const mode = typeof item.mode === 'string' && item.mode ? item.mode : null
  if (!poolId || !seed) return { ok: false, error: 'Missing pool or seed.' }

  if (item.shared === true) {
    return { ok: false, error: 'A shared wheel is a replay, so it stays off the board.' }
  }

  // The weekly board is the one place a shared seed is legitimate — but it
  // has to be THE week's seed, derived here rather than taken on trust.
  let weekStart: string | null = null
  if (item.weekly === true) {
    const week = weekStartFor()
    const expected = weeklySeed({ game: game as GameId, mode, poolId }, week)
    if (seed !== expected) {
      return { ok: false, error: "That is not this week's board." }
    }
    weekStart = week
  }

  const verdict = await verifyRun(game, poolId, seed, item.picks)
  if (!verdict.ok) return { ok: false, error: verdict.error }

  const { data, error } = await db
    .from('game_runs')
    .insert({
      game,
      mode,
      pool_id: poolId,
      week_start: weekStart,
      seed,
      user_id: userId,
      score: verdict.score,
      rate_num: verdict.rateNum,
      rate_den: verdict.rateDen,
      display: verdict.display,
      detail: verdict.detail,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 is one of the two uniqueness rules. Re-posting is what a
    // double-tap or a re-claimed bank looks like, so it reads as
    // already-done rather than as a failure.
    if (error.code === '23505') {
      return {
        ok: false,
        error: weekStart
          ? "You have already played this week's board."
          : 'That wheel is already on the board.',
      }
    }
    return { ok: false, error: 'Could not reach the board. Try again in a moment.' }
  }

  const runId = data.id as string
  const key = { game: game as GameId, mode, poolId }
  const [{ data: rank }, total] = await Promise.all([
    db.rpc('game_rank', {
      p_game: game,
      p_pool: poolId,
      p_mode: mode,
      p_week: weekStart,
      p_run: runId,
    }),
    boardSize(key, weekStart),
  ])

  return {
    ok: true,
    runId,
    score: verdict.score,
    rank: Number(rank ?? 0),
    total,
  }
}
