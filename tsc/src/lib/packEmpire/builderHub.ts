// Empire Builder's front page: every board at a glance, and the best of late. SERVER ONLY.
//
// Eight boards, Classic and Mystery at each difficulty. For each: the runs posted
// since the span began (BUILDER_HUB_SPAN: midnight Eastern today, or Monday's), one
// per person, best first, and the viewer's best ever. The day is the Daily's day,
// so both turn over at the same moment. The fields still say `today`: they hold
// whichever span is on.

import type { BestRow, RunDisplay } from '@/lib/minigames/leaderboard'
import { publicNames } from '@/lib/minigames/boardIdentity'
import { createAdminClient } from '@/lib/supabase/admin'
import { dayKey } from './daily'
import { BUILDER_FORMATS, BUILDER_HUB_SPAN, DIFFICULTIES, boardMode, type BuilderFormat, type Difficulty } from './rules'

export type HubBoard = {
  diff: Difficulty
  format: BuilderFormat
  /** The span's best run by each person, best first. */
  today: BestRow[]
  /** Every run posted in the span, repeats included. */
  runsToday: number
  /** The viewer's best ever on this board. */
  yourBest: number | null
}

/** Midnight in New York on a date, as an instant. */
function midnightET(y: number, m: number, d: number): Date {
  // Noon UTC on that date reads as 7 or 8 in the morning there: that gap is the offset.
  const noon = new Date(Date.UTC(y, m - 1, d, 12))
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(noon))
  return new Date(Date.UTC(y, m - 1, d, 12 - hour))
}

/** When today began in New York, as an instant. */
export function startOfToday(now = new Date()): Date {
  const [y, m, d] = dayKey(now).split('-').map(Number)
  return midnightET(y, m, d)
}

/** When this week began in New York: Monday at midnight. */
export function startOfWeek(now = new Date()): Date {
  const [y, m, d] = dayKey(now).split('-').map(Number)
  const back = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(y, m - 1, d - back))
  return midnightET(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate())
}

const startOfSpan = () => (BUILDER_HUB_SPAN === 'week' ? startOfWeek() : startOfToday())

/** Runs a board shows from the span. */
const TODAY_TOP = 5

type Row = {
  id: string
  mode: string
  user_id: string | null
  guest_name: string | null
  score: number
  display: RunDisplay | null
  created_at: string
}

export async function loadBuilderHub(viewerId: string | null): Promise<HubBoard[]> {
  const db = createAdminClient()
  const boards = BUILDER_FORMATS.flatMap((format) => DIFFICULTIES.map((diff) => ({ diff, format, mode: boardMode(diff, format) })))
  const modes = boards.map((b) => b.mode)

  const [{ data: todayRows }, { data: mineRows }] = await Promise.all([
    db
      .from('game_runs')
      .select('id, mode, user_id, guest_name, score, display, created_at')
      .eq('game', 'pack-empire')
      .eq('pool_id', 'site')
      .in('mode', modes)
      .gte('created_at', startOfSpan().toISOString())
      .order('score', { ascending: false })
      .limit(1000),
    viewerId
      ? db
          .from('game_runs')
          .select('mode, score')
          .eq('game', 'pack-empire')
          .eq('pool_id', 'site')
          .eq('user_id', viewerId)
          .in('mode', modes)
          .order('score', { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] }),
  ])

  const rows = (todayRows ?? []) as Row[]
  const names = await publicNames(rows.flatMap((r) => r.user_id ?? []))
  const best = new Map<string, number>()
  for (const r of (mineRows ?? []) as { mode: string; score: number }[]) {
    best.set(r.mode, Math.max(best.get(r.mode) ?? 0, Number(r.score)))
  }

  return boards.map(({ diff, format, mode }) => {
    const here = rows.filter((r) => r.mode === mode)
    const seen = new Set<string>()
    const today: BestRow[] = []
    for (const r of here) {
      const who = r.user_id ?? `g:${r.guest_name}`
      if (seen.has(who)) continue
      seen.add(who)
      today.push({
        rank: today.length + 1,
        runId: r.id,
        userId: r.user_id,
        name: (r.user_id ? names.get(r.user_id) : r.guest_name) ?? 'Manager',
        score: Number(r.score),
        display: r.display ?? {},
        at: r.created_at,
      })
      if (today.length === TODAY_TOP) break
    }
    return { diff, format, today, runsToday: here.length, yourBest: best.get(mode) ?? null }
  })
}
