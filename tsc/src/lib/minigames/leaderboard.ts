// Leaderboards for the Games Page.
//
// Three boards per (game, mode, pool), and they measure different things on
// purpose:
//
//   best    the primary one. Best runs, one row per RUN, so a player who has
//           put up four of the top ten holds four of the top ten. Ties go to
//           whoever got there first.
//   weekly  one shared seed for the week, ONE ATTEMPT each. Everybody plays
//           the identical board, whatever you get is your score, and at the
//           end of the week you see who did best. The only place a
//           duplicated deal exists deliberately — and the single attempt is
//           what makes it safe, since a second go at a fixed seed would be a
//           memory test of the first.
//   career  every run, as a rate, with a minimum so one hot wheel can't top
//           it. This is the "who is actually good" answer; `best` is the
//           high-score board people came for.
//
// A pool is a league slug, a comma-joined combined wheel, 'site' or 'demo'.
// Boards are never merged across pools or modes.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveBoardIdentities, soleLeagueSlug, type BoardIdentity } from './boardIdentity'

export type GameId =
  | 'roulette'
  | 'guess-the-draft'
  | 'gauntlet'
  | 'over-under'
  | 'redraft'
  | 'multiverse'

export const GAME_IDS: GameId[] = [
  'roulette',
  'guess-the-draft',
  'gauntlet',
  'over-under',
  'redraft',
  'multiverse',
]

export function isGameId(v: string): v is GameId {
  return (GAME_IDS as string[]).includes(v)
}

export type BoardKind = 'best' | 'weekly' | 'career'

export type BoardKey = {
  game: GameId
  /** Null for games with a single mode. Never merged across modes. */
  mode: string | null
  poolId: string
}

/** Rows shown before the board is cut off, on the site-wide and combined
    boards where the field is everybody. */
export const BOARD_ROWS = 50

/**
 * Rows on ONE league's board.
 *
 * Shorter on purpose. A league is a dozen people, so fifty rows is the same
 * handful of names over and over down a page nobody scrolls; twenty is the
 * part anyone reads, and your own best run is pinned underneath at its true
 * rank whether or not it made the cut.
 */
export const LEAGUE_BOARD_ROWS = 20

/** How long a given pool's board runs. */
export function boardRowsFor(poolId: string): number {
  return soleLeagueSlug(poolId) ? LEAGUE_BOARD_ROWS : BOARD_ROWS
}

/** Runs a player needs before they appear on the career board. */
export const CAREER_MIN_RUNS = 10

/**
 * What a board row prints, per game. Display only — none of it is ever read
 * back as an input to a score, which is always derived server-side.
 */
export type RunDisplay = {
  /** Roulette: "15-2". Redraft: "5-3". */
  record?: string
  /** Roulette: lineup PPG. */
  ppg?: number
  /** The guessing games: 8 of 10. */
  correct?: number
  asked?: number
  /** Gauntlet endless. */
  streak?: number
  /** Redraft: points ahead of the opponent, per game. */
  margin?: number
  /** Multiverse: how far the postseason went, e.g. "Won it" or "Semi-final". */
  round?: string
}

export type BestRow = {
  rank: number
  runId: string
  userId: string
  /** The name this person claimed — their manager in this league on a league
      board, their claim elsewhere on any other board — and their site display
      name if they have never claimed one. See boardIdentity.ts. */
  name: string
  /** Their manager avatar, on a league board only. */
  avatar?: string | null
  score: number
  display: RunDisplay
  at: string
}

export type CareerRow = {
  rank: number | null
  userId: string
  name: string
  avatar?: string | null
  runs: number
  /** 0..1 */
  rate: number
  best: number
  qualified: boolean
}

export type Board =
  | {
      kind: 'best' | 'weekly'
      key: BoardKey
      week?: string
      rows: BestRow[]
      you: BestRow | null
      /** Every run on the board, not just the page, so a rank has a scale. */
      total: number
    }
  | { kind: 'career'; key: BoardKey; rows: CareerRow[]; you: CareerRow | null; minRuns: number }

// ============================================================
// Weeks
// ============================================================

/**
 * The Monday of the week a moment falls in, as YYYY-MM-DD in UTC.
 *
 * UTC rather than local time on purpose: the week's seed is derived from
 * this string, and a board where a player in Los Angeles is dealt different
 * questions from one in New York is not a board.
 */
export function weekStartFor(when: Date = new Date()): string {
  const d = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()))
  // getUTCDay: 0 = Sunday. Shift so Monday is the start.
  const shift = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - shift)
  return d.toISOString().slice(0, 10)
}

/**
 * The seed everyone plays for one week on one board.
 *
 * Deterministic from the board identity and the week, so it needs no storage
 * and no cron: the same string is derived on every server, every request,
 * for as long as that week lasts. Same alphabet as a free-play seed
 * (`newSeed` in roulette.ts) so nothing downstream can tell them apart.
 */
export function weeklySeed(key: BoardKey, week: string): string {
  const input = `${week}|${key.game}|${key.mode ?? ''}|${key.poolId}`
  // xmur3, the same hash the games' PRNG is built on. Two passes with
  // different salts so eight characters come off 64 bits rather than 32.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  for (const salt of ['a', 'b']) {
    let h = 1779033703 ^ (input.length + salt.charCodeAt(0))
    for (let i = 0; i < input.length; i++) {
      h = Math.imul(h ^ input.charCodeAt(i), 3432918353)
      h = (h << 13) | (h >>> 19)
    }
    h = (h ^= h >>> 16) >>> 0
    for (let i = 0; i < 4; i++) {
      out += alphabet[h % alphabet.length]
      h = Math.floor(h / alphabet.length) + 1
    }
  }
  return out
}

// ============================================================
// Reading a board
// ============================================================

type BestRpcRow = {
  rank: number
  run_id: string
  user_id: string
  name: string | null
  score: number
  display: RunDisplay | null
  created_at: string
}

type CareerRpcRow = {
  rank: number | null
  user_id: string
  name: string | null
  runs: number
  rate: number
  best: number
  qualified: boolean
}

/**
 * Swap in the name the player claimed: their manager in this league on a
 * league board, their most recent claim anywhere on any other board. Applied
 * over the top of whatever the SQL resolved, so a player who has never
 * claimed anything keeps the site display name with no branching at the call
 * site. See boardIdentity.ts.
 */
function withIdentities<T extends { userId: string; name: string; avatar?: string | null }>(
  rows: T[],
  ids: Map<string, BoardIdentity>
): T[] {
  if (ids.size === 0) return rows
  return rows.map((r) => {
    const found = ids.get(r.userId)
    return found ? { ...r, name: found.name, avatar: found.avatar } : r
  })
}

function toBestRow(r: BestRpcRow): BestRow {
  return {
    rank: Number(r.rank),
    runId: r.run_id,
    userId: r.user_id,
    name: r.name ?? 'Manager',
    score: Number(r.score),
    display: r.display ?? {},
    at: r.created_at,
  }
}

/**
 * One board, plus the viewer's own place on it.
 *
 * The viewer's row is fetched separately and pinned, rather than being found
 * in the page of rows, because the whole point of the pin is the case where
 * it ISN'T in the page: the board shows fifty and your best run is 77th.
 */
export async function loadBoard(
  kind: BoardKind,
  key: BoardKey,
  viewerId: string | null,
  opts: { limit?: number; offset?: number; week?: string } = {}
): Promise<Board> {
  const db = createAdminClient()
  const limit = opts.limit ?? boardRowsFor(key.poolId)
  const offset = opts.offset ?? 0

  if (kind === 'career') {
    const { data } = await db.rpc('game_board_career', {
      p_game: key.game,
      p_pool: key.poolId,
      p_mode: key.mode,
      p_min_runs: CAREER_MIN_RUNS,
      p_limit: limit,
    })
    const raw: CareerRow[] = ((data ?? []) as CareerRpcRow[]).map((r) => ({
      rank: r.rank == null ? null : Number(r.rank),
      userId: r.user_id,
      name: r.name ?? 'Manager',
      runs: Number(r.runs),
      rate: Number(r.rate),
      best: Number(r.best),
      qualified: r.qualified,
    }))
    const rows = withIdentities(
      raw,
      await resolveBoardIdentities(
        key.poolId,
        raw.map((r) => r.userId)
      )
    )
    return {
      kind,
      key,
      rows,
      you: viewerId ? (rows.find((r) => r.userId === viewerId) ?? null) : null,
      minRuns: CAREER_MIN_RUNS,
    }
  }

  if (kind === 'weekly') {
    const week = opts.week ?? weekStartFor()
    const { data } = await db.rpc('game_board_weekly', {
      p_game: key.game,
      p_pool: key.poolId,
      p_mode: key.mode,
      p_week: week,
      p_limit: limit,
    })
    const raw = ((data ?? []) as BestRpcRow[]).map(toBestRow)
    const [ids, total, found] = await Promise.all([
      resolveBoardIdentities(key.poolId, [...raw.map((r) => r.userId), ...(viewerId ? [viewerId] : [])]),
      boardSize(key, week),
      // One attempt each means a player is on this board at most once, so if
      // they're in the page that IS their row. Only look one up when the
      // board runs longer than the page.
      viewerId && !raw.some((r) => r.userId === viewerId)
        ? loadYourWeekly(key, week, viewerId)
        : null,
    ])
    const rows = withIdentities(raw, ids)
    const inPage = viewerId ? (rows.find((r) => r.userId === viewerId) ?? null) : null
    const you = inPage ?? (found ? withIdentities([found], ids)[0] : null)
    return { kind, key, week, rows, you, total }
  }

  const { data } = await db.rpc('game_board_best', {
    p_game: key.game,
    p_pool: key.poolId,
    p_mode: key.mode,
    p_limit: limit,
    p_offset: offset,
  })
  const raw = ((data ?? []) as BestRpcRow[]).map(toBestRow)
  const [mine, total, ids] = await Promise.all([
    viewerId ? loadYourBest(key, viewerId) : null,
    boardSize(key, null),
    resolveBoardIdentities(key.poolId, [
      ...raw.map((r) => r.userId),
      ...(viewerId ? [viewerId] : []),
    ]),
  ])

  return {
    kind: 'best',
    key,
    rows: withIdentities(raw, ids),
    you: mine ? withIdentities([mine], ids)[0] : null,
    total,
  }
}

/**
 * The viewer's best run on the free-play board, at its TRUE rank — 77th out
 * of however many, not "not in the top fifty". This is the whole reason the
 * pinned row exists, so it is always a real lookup rather than a search of
 * the page that was already fetched.
 */
export function loadYourBest(key: BoardKey, viewerId: string): Promise<BestRow | null> {
  return loadYourRow(key, null, viewerId)
}

/** The viewer's run on one week's board. One attempt, so at most one row. */
export function loadYourWeekly(
  key: BoardKey,
  week: string,
  viewerId: string
): Promise<BestRow | null> {
  return loadYourRow(key, week, viewerId)
}

async function loadYourRow(
  key: BoardKey,
  week: string | null,
  viewerId: string
): Promise<BestRow | null> {
  const db = createAdminClient()
  let q = db
    .from('game_runs')
    .select('id, user_id, score, display, created_at')
    .eq('game', key.game)
    .eq('pool_id', key.poolId)
    .eq('user_id', viewerId)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
  q = week == null ? q.is('week_start', null) : q.eq('week_start', week)
  q = key.mode == null ? q.is('mode', null) : q.eq('mode', key.mode)

  const { data } = await q
  const mine = (data ?? [])[0] as
    | { id: string; user_id: string; score: number; display: RunDisplay | null; created_at: string }
    | undefined
  if (!mine) return null

  const [{ data: rank }, { data: profile }] = await Promise.all([
    db.rpc('game_rank', {
      p_game: key.game,
      p_pool: key.poolId,
      p_mode: key.mode,
      p_week: week,
      p_run: mine.id,
    }),
    db.from('profiles').select('display_name, member_code').eq('id', viewerId).maybeSingle(),
  ])

  const shown = (profile?.display_name ?? '').trim()
  return {
    rank: Number(rank ?? 0),
    runId: mine.id,
    userId: mine.user_id,
    // Same rule the board functions use: an email address never appears on
    // a public board, so the member code stands in for one.
    name: shown && !shown.includes('@') ? shown : (profile?.member_code ?? 'You'),
    score: Number(mine.score),
    display: mine.display ?? {},
    at: mine.created_at,
  }
}

/** How many runs the board holds, so a rank reads as "77th of 812". */
export async function boardSize(key: BoardKey, week: string | null): Promise<number> {
  const db = createAdminClient()
  const { data } = await db.rpc('game_board_size', {
    p_game: key.game,
    p_pool: key.poolId,
    p_mode: key.mode,
    p_week: week,
  })
  return Number(data ?? 0)
}
