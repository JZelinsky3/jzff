// POST /api/hub/analyzer — run a Trade Room analysis. Signed-in only.
// Pure computation (no writes): resolves the chosen settings against the
// consensus value engine and grades the swap. See src/lib/hub/analyzer.ts.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AnalyzeBody, analyzeHubTrade, validateRosterMode } from '@/lib/hub/analyzer'

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

  try {
    const analysis = await analyzeHubTrade({
      settings: body.settings,
      sideA: body.sideA,
      sideB: body.sideB,
      rosterA: usesRosters ? body.rosterA : null,
      rosterB: usesRosters ? body.rosterB : null,
      slots: body.slots ?? null,
    })
    return NextResponse.json({ analysis })
  } catch {
    return NextResponse.json({ error: 'Valuation engine unavailable — try again shortly.' }, { status: 502 })
  }
}
