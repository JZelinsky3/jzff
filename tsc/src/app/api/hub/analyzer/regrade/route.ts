// POST /api/hub/analyzer/regrade — site-admin only. Re-grades every posted
// docket trade from its stored per-side asset values using the current
// grading logic (consolidation-adjusted value + the composeVerdict writer),
// so the board reflects engine changes without re-running the value engine.
// Values themselves stay frozen at publish time; only grades/verdicts/delta
// are refreshed.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { regradeStoredTrade, type HubAsset } from '@/lib/hub/analyzer'
import type { LeagueMode } from '@/lib/values'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await isSiteAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const db = createAdminClient()
  const { data: rows, error } = await db
    .from('hub_trades')
    .select('id, mode, side_a, side_b')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let updated = 0
  const warnings: string[] = []
  for (const row of rows ?? []) {
    const sideA = (row.side_a as { assets?: HubAsset[] } | null)?.assets ?? []
    const sideB = (row.side_b as { assets?: HubAsset[] } | null)?.assets ?? []
    if (sideA.length === 0 || sideB.length === 0) {
      warnings.push(`trade ${row.id}: missing side assets, skipped`)
      continue
    }
    const g = regradeStoredTrade({ sideA, sideB, mode: (row.mode as LeagueMode) ?? 'redraft' })
    const { error: upErr } = await db
      .from('hub_trades')
      .update({
        delta_pct: Math.round(g.deltaPct * 10000) / 10000,
        grade_a: g.gradeA,
        grade_b: g.gradeB,
        verdict_a: g.verdictA,
        verdict_b: g.verdictB,
      })
      .eq('id', row.id)
    if (upErr) warnings.push(`trade ${row.id}: ${upErr.message}`)
    else updated += 1
  }

  return NextResponse.json({ ok: true, updated, total: rows?.length ?? 0, warnings })
}
