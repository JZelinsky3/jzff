// POST /api/leagues/[id]/trade-desk/mocks/vote
//
// Sign it / Shred it on a Rumor Mill mock. Anonymous by design: the
// device remembers its own vote in localStorage and tells us what it
// previously was (`prev`) so switches and un-votes adjust both counters
// in one atomic RPC. The hash must belong to the week's published
// column — that's the only thing standing between us and junk rows, and
// for a league paper it's enough.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

const Body = z.object({
  weekKey: z.string().regex(/^\d{4}-W\d{2}$/),
  hash: z.string().min(3).max(400),
  vote: z.enum(['sign', 'shred']).nullable(),
  prev: z.enum(['sign', 'shred']).nullable(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
  const { weekKey, hash, vote, prev } = parsed.data
  const db = createAdminClient()

  // The hash must be one this week's column actually printed.
  const { data: column } = await db
    .from('trade_desk_mock_trades')
    .select('trade_hashes')
    .eq('league_id', id)
    .eq('week_key', weekKey)
    .maybeSingle<{ trade_hashes: string[] }>()
  if (!column || !(column.trade_hashes ?? []).includes(hash)) {
    return NextResponse.json({ error: 'unknown trade' }, { status: 404 })
  }

  const signDelta = (vote === 'sign' ? 1 : 0) - (prev === 'sign' ? 1 : 0)
  const shredDelta = (vote === 'shred' ? 1 : 0) - (prev === 'shred' ? 1 : 0)
  if (signDelta !== 0 || shredDelta !== 0) {
    const { error } = await db.rpc('increment_mock_vote', {
      p_league_id: id,
      p_week_key: weekKey,
      p_trade_hash: hash,
      p_sign_delta: signDelta,
      p_shred_delta: shredDelta,
    })
    if (error) {
      return NextResponse.json({ error: 'vote failed' }, { status: 500 })
    }
  }

  const { data: row } = await db
    .from('trade_desk_mock_votes')
    .select('sign_count, shred_count')
    .eq('league_id', id)
    .eq('week_key', weekKey)
    .eq('trade_hash', hash)
    .maybeSingle<{ sign_count: number; shred_count: number }>()
  return NextResponse.json(
    { sign: row?.sign_count ?? 0, shred: row?.shred_count ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
