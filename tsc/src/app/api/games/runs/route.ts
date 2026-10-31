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
//
// Pack Empire's board also takes a run with a typed name and no account. It's
// replayed the same way, under the same one-post-per-deal rule; it just has no
// binder to file into until that device signs in (see runs/claim).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyRun } from '@/lib/minigames/verifyRun'
import { recordSoloRun } from '@/lib/packEmpire/binder'
import { cleanGuestName, guestNameTaken, hashKey } from '@/lib/packEmpire/people'
import { difficultyForMode, type Chemistry, type Player } from '@/lib/packEmpire/rules'
import { parseSoloPicks } from '@/lib/packEmpire/solo'
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

// Per-IP throttle on posts with no account: 12 per 10 minutes per warm
// instance, which is more runs than anyone can play in that time. Best-effort
// on serverless, the same as the support form's.
const GUEST_WINDOW_MS = 10 * 60 * 1000
const GUEST_MAX_PER_WINDOW = 12
const guestHits = new Map<string, number[]>()

function guestThrottled(ip: string): boolean {
  const now = Date.now()
  const recent = (guestHits.get(ip) ?? []).filter((t) => now - t < GUEST_WINDOW_MS)
  if (recent.length >= GUEST_MAX_PER_WINDOW) {
    guestHits.set(ip, recent)
    return true
  }
  recent.push(now)
  guestHits.set(ip, recent)
  // Cheap leak guard: the map only ever holds recent posters.
  if (guestHits.size > 2000) {
    for (const [k, v] of guestHits) {
      if (v.every((t) => now - t >= GUEST_WINDOW_MS)) guestHits.delete(k)
    }
  }
  return false
}

/** Who a run is posted as. */
type Owner = { userId: string } | { guestKey: string; guestName: string }

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
  /** Pack Empire, signed out: the name typed and the browser's own key. */
  guest?: { name?: unknown; key?: unknown }
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
  /** Pack Empire: cards from this run's packs that were new to the binder. */
  newCards?: number
  /** Pack Empire, a blind run: its real lineup, shown for the first time. */
  reveal?: { lineup: Player[]; base: number; chem: Chemistry | null; score: number }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  let owner: Owner
  if (user) {
    owner = { userId: user.id }
  } else {
    const item = list[0]
    const onEmpireBoard =
      item.game === 'pack-empire' &&
      item.pool === 'site' &&
      typeof item.mode === 'string' &&
      difficultyForMode(item.mode) != null
    if (list.length > 1 || !item.guest || !onEmpireBoard || item.weekly === true) {
      // Not an error state in the UI: the recap shows "sign in to put this on
      // the board" and keeps the run banked until they do.
      return NextResponse.json(
        { ok: false, needsAuth: true, error: 'Sign in to put a run on the board.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (guestThrottled(ip)) {
      return NextResponse.json({ ok: false, error: 'Too many runs in a row. Give it a few minutes.' }, { status: 429 })
    }

    const guestKey = hashKey(item.guest.key)
    if (!guestKey) return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 })

    const guestName = cleanGuestName(item.guest.name)
    if (!guestName) {
      return NextResponse.json({ ok: false, error: 'Pick a different name, 2 to 24 characters.' }, { status: 400 })
    }
    if (await guestNameTaken(guestName, guestKey)) {
      return NextResponse.json({ ok: false, error: 'That name is already on the board.' }, { status: 409 })
    }

    owner = { guestKey, guestName }
  }

  const results: Outcome[] = []

  for (const item of list) {
    results.push(await postOne(db, owner, item))
  }

  return NextResponse.json(
    { ok: results.some((r) => r.ok), results },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

async function postOne(
  db: ReturnType<typeof createAdminClient>,
  owner: Owner,
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

  const verdict = await verifyRun(game, poolId, seed, item.picks, mode)
  if (!verdict.ok) return { ok: false, error: verdict.error }

  const { data, error } = await db
    .from('game_runs')
    .insert({
      game,
      mode,
      pool_id: poolId,
      week_start: weekStart,
      seed,
      ...('userId' in owner
        ? { user_id: owner.userId }
        : { guest_key: owner.guestKey, guest_name: owner.guestName }),
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
          : game === 'pack-empire' && verdict.reveal
            ? 'This run has already been scored.'
            : 'That wheel is already on the board.',
      }
    }
    return { ok: false, error: 'Could not reach the board. Try again in a moment.' }
  }

  const runId = data.id as string
  const key = { game: game as GameId, mode, poolId }
  // A Pack Empire run files its fifty-five cards in the binder on the way
  // past. Only once it's on the board: a re-post is a duplicate, already filed.
  const soloPicks = game === 'pack-empire' && 'userId' in owner ? parseSoloPicks(item.picks) : null
  const [{ data: rank }, total, fresh] = await Promise.all([
    db.rpc('game_rank', {
      p_game: game,
      p_pool: poolId,
      p_mode: mode,
      p_week: weekStart,
      p_run: runId,
    }),
    boardSize(key, weekStart),
    soloPicks && 'userId' in owner ? recordSoloRun(owner.userId, 'solo', seed, soloPicks) : Promise.resolve(null),
  ])

  return {
    ok: true,
    runId,
    score: verdict.score,
    rank: Number(rank ?? 0),
    total,
    ...(fresh ? { newCards: fresh.length } : {}),
    ...(verdict.reveal ? { reveal: verdict.reveal } : {}),
  }
}
