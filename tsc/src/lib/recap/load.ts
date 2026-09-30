// What the recap page shows for one league-week.
//
// A stored recap (written by the Tuesday job) always wins, because it is the
// exact snapshot the email was written from: the page and the inbox must
// never disagree about a score. Before the job has run, or for a league it
// skipped, the page builds the same facts on the fly, but only for a week
// that is actually over.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLockReason } from '@/lib/leagueTier'
import { getNflClock, weekIsFinal } from '@/lib/nflClock'
import { buildRecapFacts, recapTierFor, type RecapFacts, type RecapTier } from './facts'
import { templateIntro } from './intro'

export type LoadedRecap =
  | { status: 'ok'; facts: RecapFacts; intro: string; tier: RecapTier }
  | { status: 'not-final' }
  | { status: 'held'; reason: string }
  | { status: 'no-games' }

export async function loadRecap(
  league: { id: string; owner_id: string | null },
  year: number,
  week: number,
): Promise<LoadedRecap> {
  const tier = recapTierFor(await getLockReason(league.id, league.owner_id))

  const db = createAdminClient()
  // An error here is the table not existing yet (migration 0070 not
  // applied). The live build below still works, so carry on without it.
  const { data: stored } = await db
    .from('weekly_recaps')
    .select('facts, intro, status, hold_reason')
    .eq('league_id', league.id)
    .eq('season_year', year)
    .eq('week', week)
    .maybeSingle()

  const facts = stored?.facts as RecapFacts | null | undefined
  if (facts && facts.v === 1) {
    return { status: 'ok', facts, intro: (stored?.intro as string | null) || templateIntro(facts), tier }
  }

  if (!weekIsFinal(year, week, await getNflClock())) return { status: 'not-final' }

  const built = await unstable_cache(
    () => buildRecapFacts({ leagueId: league.id, year, week, tier }),
    ['recap-live', league.id, String(year), String(week), tier],
    { tags: [`league-${league.id}`], revalidate: 3600 },
  )()
  if (built.status === 'ok') return { status: 'ok', facts: built.facts, intro: templateIntro(built.facts), tier }
  if (built.status === 'incomplete') return { status: 'held', reason: built.reason }
  return { status: 'no-games' }
}

// The newest week this league has a recap for, stored or buildable.
export async function latestRecapWeek(leagueId: string): Promise<{ year: number; week: number } | null> {
  const db = createAdminClient()
  const { data: stored } = await db
    .from('weekly_recaps')
    .select('season_year, week')
    .eq('league_id', leagueId)
    .in('status', ['ready', 'sent'])
    .order('season_year', { ascending: false })
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle()

  const clock = await getNflClock()
  if (clock && (clock.seasonType === 'regular' || clock.seasonType === 'post')) {
    const week = clock.seasonType === 'regular' ? clock.week - 1 : 18
    const { data: season } = await db
      .from('seasons')
      .select('id')
      .eq('league_id', leagueId)
      .eq('year', clock.season)
      .maybeSingle()
    if (season && week >= 1) {
      const { data: last } = await db
        .from('matchups')
        .select('week')
        .eq('season_id', season.id)
        .lte('week', week)
        .not('score_a', 'is', null)
        .order('week', { ascending: false })
        .limit(1)
        .maybeSingle()
      const live = last ? { year: clock.season, week: last.week as number } : null
      if (live && (!stored || stored.season_year < live.year || (stored.season_year === live.year && stored.week < live.week))) {
        return live
      }
    }
  }
  return stored ? { year: stored.season_year as number, week: stored.week as number } : null
}
