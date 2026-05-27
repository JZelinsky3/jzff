// POST /api/admin/refresh-player-values — manual trigger for the player_values
// refresh that the Monday cron does automatically.
//
// Why this exists: the cron only fires weekly, but for testing (or right
// after applying migration 0025) we need values populated immediately so
// the grader has something to read. This route lets any signed-in user
// (with a league they own — same gate as sync) kick the refresh.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { refreshSleeperPlayerValues } from '@/lib/playerValues'

export const maxDuration = 300

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Cheap permission gate: signed-in users who own at least one league.
  // player_values is global reference data, so we don't need a per-league
  // check — owning any league is enough to prove this isn't a random
  // visitor.
  const { count } = await supabase
    .from('leagues')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    const result = await refreshSleeperPlayerValues()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'refresh failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
