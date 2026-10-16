// Every Cup a league has played, for what reaches across Cups: the stamps
// (a stamp book is all-time, and Repeat looks back a year) and the Cup panel
// in the Season Archives.
//
// Cups before CUP_LAUNCH.year are left out. The Cup started in 2026; an
// earlier league_cups row is a test draw (pams has one for 2025), and
// counting it would hand out a champion and stamps for a Cup nobody played.

import { createAdminClient } from '@/lib/supabase/admin'
import { leagueName } from '@/lib/pamsNames'
import { CHAMPION_BONUS, roundPoints } from './extras'
import { CUP_LAUNCH } from './launch'
import { loadCup, type CupView } from './load'
import { cupStamps, type StampAward, type StampPick } from './stamps'

export type LeagueCup = { view: CupView; picks: StampPick[] }

export type LeagueCups = {
  // Oldest first.
  cups: LeagueCup[]
  stamps: StampAward[]
  // A person's name (profile id, or manager id for a team with no profile).
  nameOf: (person: string) => string
}

type Db = ReturnType<typeof createAdminClient>

async function picksOf(db: Db, cupId: string): Promise<StampPick[]> {
  const { data, error } = await db.from('cup_picks').select('profile_id, round, slot, picked_manager_id').eq('cup_id', cupId)
  if (error || !data) return []
  return data.map((p) => ({ profileId: p.profile_id as string, round: p.round as number, slot: p.slot as number, picked: p.picked_manager_id as string }))
}

// `current` is the Cup the caller has already loaded (the Cup page), so it
// isn't loaded twice.
export async function loadLeagueCups(leagueId: string, current?: LeagueCup): Promise<LeagueCups> {
  const db = createAdminClient()
  const [{ data: rows, error }, { data: managers }, { data: profiles }, { data: seasons }] = await Promise.all([
    db.from('league_cups').select('id, season_year').eq('league_id', leagueId).gte('season_year', CUP_LAUNCH.year).order('season_year', { ascending: true }),
    db.from('managers').select('id, profile_id, display_name').eq('league_id', leagueId),
    db.from('manager_profiles').select('id, canonical_name').eq('league_id', leagueId),
    db.from('seasons').select('year, champion_manager_id').eq('league_id', leagueId),
  ])
  const profileOf = new Map((managers ?? []).map((m) => [m.id as string, (m.profile_id as string | null) ?? null]))
  const profileName = new Map((profiles ?? []).map((p) => [p.id as string, p.canonical_name as string]))
  const managerName = new Map((managers ?? []).map((m) => [m.id as string, leagueName(m.id as string, (m.display_name as string) ?? 'Unknown')]))
  const personOf = (managerId: string) => profileOf.get(managerId) ?? managerId
  const nameOf = (person: string) => profileName.get(person) ?? managerName.get(person) ?? 'Unknown'
  if (error || !rows?.length) return { cups: current ? [current] : [], stamps: [], nameOf }

  const cups: LeagueCup[] = []
  for (const row of rows) {
    if (current && current.view.cup.id === row.id) {
      cups.push(current)
      continue
    }
    const view = await loadCup(leagueId, row.season_year as number)
    if (!view || view.cup.id !== row.id) continue
    cups.push({ view, picks: await picksOf(db, view.cup.id) })
  }

  const champOf = new Map((seasons ?? []).map((s) => [s.year as number, (s.champion_manager_id as string | null) ?? null]))

  const stamps = cupStamps(
    cups.map(({ view, picks }) => ({
      cup: { id: view.cup.id, year: view.cup.season_year },
      bracket: view.bracket,
      picks,
      personOf,
      nameOf,
      points: roundPoints(view.bracket.rounds.length),
      championBonus: CHAMPION_BONUS,
      leagueChampion: champOf.get(view.cup.season_year) ?? null,
    })),
  )
  return { cups, stamps, nameOf }
}
