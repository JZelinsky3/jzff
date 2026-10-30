// POST /api/games/runs/claim  { key }
//
// Moves the runs a device posted under a guest name onto the account that just
// signed in on it. The key is the proof: only its hash is on the row, and the
// browser that made it is the only thing holding the original. The cards come
// with them, because a run on an account is what syncBinder files.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncBinder } from '@/lib/packEmpire/binder'
import { hashKey } from '@/lib/packEmpire/people'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE })

  const body = (await req.json().catch(() => null)) as { key?: unknown } | null
  const guestKey = hashKey(body?.key)
  if (!guestKey) return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE })

  const db = createAdminClient()
  const { data: runs } = await db.from('game_runs').select('id').eq('guest_key', guestKey)

  let moved = 0
  for (const run of (runs ?? []) as { id: string }[]) {
    const { error } = await db
      .from('game_runs')
      .update({ user_id: user.id, guest_key: null, guest_name: null })
      .eq('id', run.id)
    if (!error) moved += 1
    // The account already posted this exact deal, so the guest copy goes.
    else if (error.code === '23505') await db.from('game_runs').delete().eq('id', run.id)
  }

  if (moved > 0) await syncBinder(user.id)
  return NextResponse.json({ ok: true, moved }, { headers: NO_STORE })
}
