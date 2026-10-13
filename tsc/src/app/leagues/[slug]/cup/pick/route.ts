// POST /leagues/<slug>/cup/pick: save one bracket-challenge pick.
//
// Honor-system identity, the same as pick'ems: the picker names a profile in
// this league. A pick can be changed until its round locks at Thursday
// kickoff, so this upserts. Body:
//   { profile_id, round, slot, picked_manager_id }   round -1 = champion
//
// Guards: published league with a Cup; a visible profile in the league; the
// game exists with both sides known, isn't finished, and hasn't locked; the
// pick is one of its two teams (or, for the champion, any team in the Cup).

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveWeekLockAt } from '@/lib/liveSeason'
import { loadCup } from '@/lib/cup/load'

const Body = z.object({
  profile_id: z.string().uuid(),
  round: z.number().int().min(-1).max(7),
  slot: z.number().int().min(0).max(63),
  picked_manager_id: z.string().uuid(),
})

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return fail('League not found.', 404)
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return fail('Invalid request body.')
  }
  const parsed = Body.safeParse(json)
  if (!parsed.success) return fail('Malformed pick.')
  const { profile_id, round, slot, picked_manager_id } = parsed.data

  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id, published_at').eq('slug', slug).maybeSingle()
  if (!league || !league.published_at) return fail('League not found.', 404)
  const view = await loadCup(league.id as string)
  if (!view) return fail('This league has no Cup.', 404)

  const { data: profile } = await db
    .from('manager_profiles')
    .select('id, is_hidden')
    .eq('id', profile_id)
    .eq('league_id', league.id)
    .maybeSingle()
  if (!profile || profile.is_hidden) return fail('Unknown picker.')

  const now = Date.now()
  if (round === -1) {
    if (slot !== 0) return fail('Malformed pick.')
    if (!view.cup.seeds.some((s) => s.manager_id === picked_manager_id)) return fail('That team is not in the Cup.')
    const lockAt = resolveWeekLockAt(view.season.settings, view.cup.start_week)
    const started = view.bracket.rounds[0]?.matches.some((m) => m.state === 'final')
    if ((lockAt && now >= Date.parse(lockAt)) || (!lockAt && started)) {
      return fail('Champion picks closed at kickoff of round one.', 409)
    }
  } else {
    const r = view.bracket.rounds[round]
    const m = r?.matches.find((x) => x.slot === slot)
    if (!r || !m) return fail('No such Cup game.')
    if (m.a.kind !== 'team' || m.b.kind !== 'team') return fail('That game is not set yet.', 409)
    if (picked_manager_id !== m.a.entrant.managerId && picked_manager_id !== m.b.entrant.managerId) {
      return fail('Pick one of the two teams in that game.')
    }
    if (m.state === 'final' || m.state === 'waiting') return fail('That game is over.', 409)
    const lockAt = resolveWeekLockAt(view.season.settings, m.week)
    if (lockAt && now >= Date.parse(lockAt)) return fail('Picks for this round closed at kickoff Thursday night.', 409)
  }

  const { error } = await db.from('cup_picks').upsert(
    {
      cup_id: view.cup.id,
      profile_id,
      round,
      slot,
      picked_manager_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'cup_id,profile_id,round,slot' },
  )
  if (error) return fail('The pick did not save. Try again.', 500)
  return NextResponse.json({ ok: true })
}
