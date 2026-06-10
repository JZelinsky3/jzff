// POST /api/hub/analyzer/vote — vote on a posted Trade Room trade.
//   { tradeId, vote: 'a' | 'fair' | 'b' }  — cast / change a vote
//   { tradeId, vote: null }                — retract
// Signed-in only; one vote per (trade, member), enforced by the PK +
// own-scoped RLS on hub_trade_votes.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Body = z.object({
  tradeId: z.string().uuid(),
  vote: z.enum(['a', 'fair', 'b']).nullable(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const { tradeId, vote } = parsed.data

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
