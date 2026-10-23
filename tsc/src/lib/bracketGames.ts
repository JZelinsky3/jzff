// Which playoff games count as real meetings: the championship bracket only,
// the almanac's rule (export/pams.ts isChampionshipBracketGame). A playoff
// game counts when either side finished top 4 that season: the first round,
// the semis, the final and the 3rd-place game. A 5th-place or other placement
// game, where both sides finish 5th or lower (lost in the first round, or
// never made the bracket), doesn't count, for the series, the last meeting or
// the record book.
//
// A season with no final ranks yet (still being played) keeps its playoff
// games: there's nothing to judge them by.

import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

export type PlayoffGameLike = {
  season_id: string
  manager_a_id: string
  manager_b_id: string
  is_playoff: boolean | null
  is_championship?: boolean | null
}

export async function bracketGameFilter(db: Db, seasonIds: string[]): Promise<(g: PlayoffGameLike) => boolean> {
  const rank = new Map<string, number>()
  const ranked = new Set<string>()
  for (let i = 0; i < seasonIds.length; i += 200) {
    const { data } = await db
      .from('manager_seasons')
      .select('season_id, manager_id, final_rank')
      .in('season_id', seasonIds.slice(i, i + 200))
      .not('final_rank', 'is', null)
    for (const r of data ?? []) {
      rank.set(`${r.season_id}|${r.manager_id}`, Number(r.final_rank))
      ranked.add(r.season_id as string)
    }
  }
  return (g) => {
    if (!g.is_playoff || g.is_championship || !ranked.has(g.season_id)) return true
    const a = rank.get(`${g.season_id}|${g.manager_a_id}`)
    const b = rank.get(`${g.season_id}|${g.manager_b_id}`)
    return (a != null && a <= 4) || (b != null && b <= 4)
  }
}
