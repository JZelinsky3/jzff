// POST /leagues/<slug>/pickems/submit — record one picker's picks + high/low
// for the current week. Honor-system identity: the picker just claims a profile.
//
// Guards:
//  - profile must be a non-hidden profile in this league
//  - the week must be the current (open) week — locked weeks reject
//  - picks must cover every matchup in the week except the picker's own
//  - each picked manager must be a participant of its matchup
//  - high/low must be two different teams playing that week
//  - one submission per (profile, week) — unique constraints + a precheck

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPickemsState } from '@/lib/pickems'

const Body = z.object({
  profile_id: z.string().uuid(),
  week: z.number().int().min(1).max(25),
  picks: z
    .array(
      z.object({
        matchup_id: z.string().uuid(),
        picked_manager_id: z.string().uuid(),
      }),
    )
    .min(1),
  hl: z.object({
    highest: z.string().uuid(),
    lowest: z.string().uuid(),
  }),
})

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return fail('Invalid request body.')
  }
  const parsed = Body.safeParse(json)
  if (!parsed.success) return fail('Malformed submission.')
  const { profile_id, week, picks, hl } = parsed.data

  const state = await getPickemsState(slug)
  if (state === null) return fail('League not found.', 404)
  if (state.status !== 'ok') return fail('Pick’ems are not open right now.', 409)

  if (week !== state.currentWeek) {
    return fail('That week is locked — only the current week is open for picks.', 409)
  }
  const weekObj = state.weeks.find((w) => w.week === week)
  if (!weekObj) return fail('No matchups for that week.', 409)

  const picker = state.profiles.find((p) => p.profileId === profile_id)
  if (!picker) return fail('Unknown picker.')

  // Matchups the picker must pick — everything except their own game.
  const matchupById = new Map(weekObj.matchups.map((m) => [m.id, m]))
  const ownMatchupIds = new Set(
    weekObj.matchups
      .filter((m) => picker.teamId && (m.home === picker.teamId || m.away === picker.teamId))
      .map((m) => m.id),
  )
  const required = weekObj.matchups.filter((m) => !ownMatchupIds.has(m.id)).map((m) => m.id)

  for (const pick of picks) {
    const m = matchupById.get(pick.matchup_id)
    if (!m) return fail('A pick references a matchup outside this week.')
    if (ownMatchupIds.has(pick.matchup_id)) return fail('You can’t pick your own matchup.')
    if (pick.picked_manager_id !== m.home && pick.picked_manager_id !== m.away) {
      return fail('A pick references a team not in that matchup.')
    }
  }
  const pickedIds = new Set(picks.map((p) => p.matchup_id))
  if (pickedIds.size !== picks.length) return fail('Duplicate matchup in submission.')
  if (pickedIds.size !== required.length || !required.every((id) => pickedIds.has(id))) {
    return fail('Pick every matchup before submitting.')
  }

  // High/low must be two distinct teams playing this week.
  const weekTeamIds = new Set<string>()
  for (const m of weekObj.matchups) { weekTeamIds.add(m.home); weekTeamIds.add(m.away) }
  if (!weekTeamIds.has(hl.highest) || !weekTeamIds.has(hl.lowest)) {
    return fail('High/low picks must be teams playing this week.')
  }
  if (hl.highest === hl.lowest) return fail('Highest and lowest must be different teams.')

  const db = createAdminClient()

  const { count } = await db
    .from('pickems_picks')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', state.league_id)
    .eq('season_id', state.season_id)
    .eq('week', week)
    .eq('profile_id', profile_id)
  if ((count ?? 0) > 0) {
    return fail('You’ve already submitted picks for this week.', 409)
  }

  const pickRows = picks.map((p) => ({
    league_id: state.league_id,
    season_id: state.season_id,
    week,
    profile_id,
    matchup_id: p.matchup_id,
    picked_manager_id: p.picked_manager_id,
  }))
  const { error: pickErr } = await db.from('pickems_picks').insert(pickRows)
  if (pickErr) {
    if (pickErr.code === '23505') return fail('You’ve already submitted picks for this week.', 409)
    return fail(pickErr.message, 500)
  }

  const { error: hlErr } = await db.from('pickems_hl_picks').insert({
    league_id: state.league_id,
    season_id: state.season_id,
    week,
    profile_id,
    highest_manager_id: hl.highest,
    lowest_manager_id: hl.lowest,
  })
  if (hlErr && hlErr.code !== '23505') {
    return fail(`Picks saved, but high/low failed: ${hlErr.message}`, 500)
  }

  return NextResponse.json({ ok: true, week })
}
