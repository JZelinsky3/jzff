// POST /api/hub/analyzer/publish — post a Trade Room analysis to the public
// board. Signed-in only. Takes the same body as /api/hub/analyzer and
// RE-RUNS the analysis server-side so posted values/grades can't be spoofed
// by editing the client payload.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AnalyzeBody, analyzeHubTrade, validateRosterMode } from '@/lib/hub/analyzer'
import { getUserSubscription, isCompUser, isSubscriptionActive } from '@/lib/stripe'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const parsed = AnalyzeBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const body = parsed.data

  const rosterError = validateRosterMode(body)
  if (rosterError) return NextResponse.json({ error: rosterError }, { status: 400 })
  const usesRosters = !!(body.rosterA?.length && body.rosterB?.length)

  // Self-heal: make sure the caller has a profiles row before the FK insert.
  // Accounts that predated the on_auth_user_created trigger (or where it
  // failed) have none, which used to blow up on hub_trades_owner_id_fkey.
  // No-op when the profile already exists.
  await supabase.rpc('ensure_profile')

  // Daily board limit: 2 posts for free members, 5 for paid / comp.
  const paid =
    (await isCompUser(user.id)) || isSubscriptionActive(await getUserSubscription(user.id))
  const dailyLimit = paid ? 5 : 2
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recent } = await supabase
    .from('hub_trades')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .gte('created_at', dayAgo)
  if ((recent ?? 0) >= dailyLimit) {
    return NextResponse.json(
      {
        error: paid
          ? 'Board limit reached — 5 posted trades per day.'
          : 'Board limit reached — 2 posted trades per day. Upgrade for 5.',
      },
      { status: 429 },
    )
  }

  let analysis
  try {
    analysis = await analyzeHubTrade({
      settings: body.settings,
      sideA: body.sideA,
      sideB: body.sideB,
      rosterA: usesRosters ? body.rosterA : null,
      rosterB: usesRosters ? body.rosterB : null,
      slots: body.slots ?? null,
      // The docket shows a brief, single-sentence read per side; the studio
      // (analyze route) keeps the full-length advice.
      verdictLength: 'brief',
    })
  } catch {
    return NextResponse.json({ error: 'Valuation engine unavailable — try again shortly.' }, { status: 502 })
  }

  // Writes go through the user's own client so hub_trades RLS (insert own)
  // is the authorization check.
  const { data: row, error } = await supabase
    .from('hub_trades')
    .insert({
      owner_id: user.id,
      mode: analysis.mode,
      qb_starters: analysis.qbStarters,
      team_count: analysis.teamCount,
      uses_rosters: analysis.usesRosters,
      side_a: { assets: analysis.sideA.assets, total: analysis.sideA.total },
      side_b: { assets: analysis.sideB.assets, total: analysis.sideB.total },
      // Roster context (name/position only — values would go stale) so the
      // docket can render team trades with the rosters the poster entered.
      roster_a: analysis.rosterAssetsA
        ? { players: analysis.rosterAssetsA.map((a) => ({ name: a.name, position: a.position })) }
        : null,
      roster_b: analysis.rosterAssetsB
        ? { players: analysis.rosterAssetsB.map((a) => ({ name: a.name, position: a.position })) }
        : null,
      delta_pct: Math.round(analysis.deltaPct * 10000) / 10000,
      grade_a: analysis.sideA.grade,
      grade_b: analysis.sideB.grade,
      verdict_a: analysis.sideA.verdict,
      verdict_b: analysis.sideB.verdict,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: row.id })
}
