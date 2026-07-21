// POST /api/hub/analyzer/vote — vote on a posted Trade Room trade.
//   { tradeId, vote: 'sign' | 'shred' }  — cast / change a vote
//   { tradeId, vote: null }              — retract
// Same ballot semantics as the Rumor Mill: sign = you'd do the deal,
// shred = into the bin. Signed-in only; one vote per (trade, member),
// enforced by the PK + own-scoped RLS on hub_trade_votes.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Body = z.object({
  tradeId: z.string().uuid(),
  vote: z.enum(['sign', 'shred']).nullable(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const { tradeId, vote } = parsed.data

  // Self-heal a missing profiles row so the hub_trade_votes.user_id FK holds
  // for accounts created before the profile trigger. No-op when the profile
  // already exists (and on retract, but harmless).
  await supabase.rpc('ensure_profile')

  if (vote === null) {
    const { error } = await supabase
      .from('hub_trade_votes')
      .delete()
      .eq('trade_id', tradeId)
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase
    .from('hub_trade_votes')
    .upsert({ trade_id: tradeId, user_id: user.id, vote }, { onConflict: 'trade_id,user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
