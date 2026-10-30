// The record book on a player's profile. SERVER ONLY.
//
// Every game that keeps a board, with the player's best run on each board
// they've played it on, where that run stands (its TRUE rank, the same lookup
// the board's pinned row uses), how many runs they've posted there, and the
// best any of their friends has done on that same board. Pack Empire adds its
// head-to-head modes, which never touch a board.
//
// Boards are never merged across pools or modes, so neither is this: a 15-2
// on the whole-site wheel and a 15-2 on one league's wheel are two lines.
//
// Games with no run verifier (Guess the Draft, The Gauntlet, The Over/Under,
// Redraft) post nothing anywhere, so they have nothing to show here yet. They
// join the moment their `hasBoard` flips.

import { createAdminClient } from '@/lib/supabase/admin'
import { GAMES } from '@/app/games/gameDefs'
import { DEMO_POOL_ID } from './demoPool'
import { publicNames } from './boardIdentity'
import { runStat } from './runStat'
import type { GameId, RunDisplay } from './leaderboard'

export type RecordLine = {
  /** Which board: "Whole site", a league's name, "3 leagues", "Demo league". */
  board: string
  big: string
  small: string
  /** Null if the rank lookup failed; the line still shows. */
  rank: number | null
  of: number
  runs: number
  at: string
  href: string
  /** The best any friend has posted on this same board. */
  friend: { name: string; big: string; small: string; ahead: boolean } | null
}

export type RecordExtra = { label: string; value: string; note?: string }

export type GameRecord = {
  id: GameId
  title: string
  titleEm: string
  accent: string
  href: string
  runs: number
  lines: RecordLine[]
  extras: RecordExtra[]
}

type RunRow = {
  id: string
  user_id: string
  game: GameId
  mode: string | null
  pool_id: string
  score: number
  display: RunDisplay | null
  created_at: string
}

/** Boards shown per game. A player on six league wheels sees their busiest. */
const LINES_PER_GAME = 4

const groupKey = (r: { game: string; mode: string | null; pool_id: string }) =>
  `${r.game}|${r.mode ?? ''}|${r.pool_id}`

function boardHref(href: string, game: GameId, poolId: string): string {
  // Pack Empire has the one board, and its page takes no pool.
  if (game === 'pack-empire') return `${href}board/`
  return `${href}board/?pool=${encodeURIComponent(poolId)}`
}

/** W-L, with the ties only when there are any. */
export function wlt(w: number, l: number, t: number): string {
  return t ? `${w}-${l}-${t}` : `${w}-${l}`
}

async function poolLabels(poolIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const slugs = new Set<string>()
  for (const p of poolIds) {
    if (p === 'site') out.set(p, 'Whole site')
    else if (p === DEMO_POOL_ID) out.set(p, 'Demo league')
    else if (p.includes(',')) out.set(p, `${p.split(',').filter(Boolean).length} leagues`)
    else slugs.add(p)
  }
  if (slugs.size) {
    const { data } = await createAdminClient().from('leagues').select('slug, name').in('slug', [...slugs])
    for (const l of (data ?? []) as { slug: string; name: string }[]) out.set(l.slug, l.name)
  }
  for (const s of slugs) if (!out.has(s)) out.set(s, s)
  return out
}

async function packEmpireExtras(userId: string): Promise<RecordExtra[]> {
  const [{ versusResults }, { megaResults }] = await Promise.all([
    import('@/lib/packEmpire/versus'),
    import('@/lib/packEmpire/mega'),
  ])
  const db = createAdminClient()
  const [vs, mega, members, drafts] = await Promise.all([
    versusResults(userId),
    megaResults(userId),
    db.from('pe_league_members').select('titles').eq('user_id', userId),
    db
      .from('pe_league_drafts')
      .select('league_id, season_number, final_score')
      .eq('user_id', userId)
      .eq('status', 'submitted')
      .limit(2000),
  ])

  const tally = (rows: { yours: number; theirs: number }[]) => {
    let w = 0
    let l = 0
    let t = 0
    for (const r of rows) {
      if (r.yours > r.theirs) w++
      else if (r.yours < r.theirs) l++
      else t++
    }
    return { w, l, t }
  }

  const out: RecordExtra[] = []
  if (vs.length) {
    const { w, l, t } = tally(vs)
    const best = Math.max(...vs.map((r) => r.yours))
    out.push({ label: 'Versus', value: wlt(w, l, t), note: `Best ${best.toLocaleString()}` })
  }
  if (mega.length) {
    const { w, l, t } = tally(mega)
    out.push({ label: 'Mega Draft', value: wlt(w, l, t), note: `${mega.length} played` })
  }
  const weeks = (drafts.data ?? []) as { league_id: string; season_number: number; final_score: number | null }[]
  if (weeks.length) {
    const seasons = new Set(weeks.map((d) => `${d.league_id}|${d.season_number}`)).size
    const titles = ((members.data ?? []) as { titles: number | null }[]).reduce((n, m) => n + (m.titles ?? 0), 0)
    const best = Math.max(...weeks.map((d) => d.final_score ?? 0))
    out.push({
      label: 'League Mode',
      value: titles ? `${titles} ${titles === 1 ? 'title' : 'titles'}` : `${seasons} ${seasons === 1 ? 'season' : 'seasons'}`,
      note: titles
        ? `${seasons} ${seasons === 1 ? 'season' : 'seasons'} · best week ${best.toLocaleString()}`
        : `Best week ${best.toLocaleString()}`,
    })
  }
  return out
}

export async function loadRecords(userId: string, friends: string[] = []): Promise<GameRecord[]> {
  const db = createAdminClient()
  const games = GAMES.filter((g) => g.hasBoard)
  const ids = games.map((g) => g.id)

  // Best first, earliest first among equals: the same order the boards use,
  // so the first row seen for a board IS the player's best run on it.
  const cols = 'id, user_id, game, mode, pool_id, score, display, created_at'
  const [{ data: mine }, { data: theirs }, peExtras] = await Promise.all([
    db
      .from('game_runs')
      .select(cols)
      .eq('user_id', userId)
      .in('game', ids)
      .is('week_start', null)
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(5000),
    friends.length
      ? db
          .from('game_runs')
          .select(cols)
          .in('user_id', friends)
          .in('game', ids)
          .is('week_start', null)
          .order('score', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(2000)
      : Promise.resolve({ data: [] as RunRow[] }),
    games.some((g) => g.id === 'pack-empire') ? packEmpireExtras(userId) : Promise.resolve([]),
  ])

  type Group = { best: RunRow; runs: number }
  const groups = new Map<string, Group>()
  for (const r of (mine ?? []) as RunRow[]) {
    const k = groupKey(r)
    const g = groups.get(k)
    if (g) g.runs++
    else groups.set(k, { best: r, runs: 1 })
  }
  const friendBest = new Map<string, RunRow>()
  for (const r of (theirs ?? []) as RunRow[]) {
    const k = groupKey(r)
    if (groups.has(k) && !friendBest.has(k)) friendBest.set(k, r)
  }

  // Each game's busiest boards, then one rank lookup apiece.
  const shown = games.flatMap((g) =>
    [...groups.values()]
      .filter((x) => x.best.game === g.id)
      .sort((a, b) => b.runs - a.runs)
      .slice(0, LINES_PER_GAME)
  )
  const [labels, friendNames, ranked] = await Promise.all([
    poolLabels([...new Set(shown.map((x) => x.best.pool_id))]),
    publicNames([...new Set([...friendBest.values()].map((r) => r.user_id))]),
    Promise.all(
      shown.map(async (x) => {
        const args = { p_game: x.best.game, p_pool: x.best.pool_id, p_mode: x.best.mode, p_week: null }
        const [rank, size] = await Promise.all([
          db.rpc('game_rank', { ...args, p_run: x.best.id }),
          db.rpc('game_board_size', args),
        ])
        return { x, rank: rank.data == null ? null : Number(rank.data), of: Number(size.data ?? 0) }
      })
    ),
  ])

  return games.map((g) => {
    const lines: RecordLine[] = ranked
      .filter(({ x }) => x.best.game === g.id)
      .map(({ x, rank, of }) => {
        const r = x.best
        const stat = runStat(g.id as GameId, r.display ?? {}, Number(r.score))
        const f = friendBest.get(groupKey(r))
        const fStat = f ? runStat(g.id as GameId, f.display ?? {}, Number(f.score)) : null
        return {
          board: g.id === 'pack-empire' ? 'The board' : (labels.get(r.pool_id) ?? r.pool_id),
          ...stat,
          rank,
          of,
          runs: x.runs,
          at: r.created_at,
          href: boardHref(g.href, g.id as GameId, r.pool_id),
          friend:
            f && fStat
              ? { name: friendNames.get(f.user_id) ?? 'A friend', ...fStat, ahead: Number(f.score) > Number(r.score) }
              : null,
        }
      })
    const runs = [...groups.values()].filter((x) => x.best.game === g.id).reduce((n, x) => n + x.runs, 0)
    return {
      id: g.id as GameId,
      title: g.title,
      titleEm: g.titleEm,
      accent: g.accent,
      href: g.href,
      runs,
      lines,
      extras: g.id === 'pack-empire' ? peExtras : [],
    }
  })
}
