// Vercel Cron — daily automatic trade grading + 4-week revisits.
//
// This is how grades happen in production: no buttons. Any trade that
// landed on the wire in the last GRADE_WINDOW_DAYS and hasn't been graded
// yet gets a grade on the next daily run, so a Tuesday-night trade is
// marked up by Wednesday morning. Old archives imported with a new league
// are deliberately left alone — the executed_at window means only trades
// made while the league is on TSC ever auto-grade.
//
// Revisits ride the same run: any auto-or-manually graded trade whose
// grade is 4+ weeks old and hasn't been revisited gets its verdict pass.
//
// Eligibility: the league owner must have Veteran-tier trades access
// (tier2+/comp) — same gate the trades page enforces — so free leagues
// don't consume Groq quota for a page they can't see.
//
// Budgets: Groq free tier is paced at ~5s/call inside gradeTrade's batch
// loop; MAX_GRADES + MAX_REVISITS keep the whole run safely inside
// maxDuration. A backlog simply drains across consecutive days.
//
// Schedule: daily 14:00 UTC (see vercel.json), after the Monday value
// refresh so grades quote fresh ranks.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gradeTrade, revisitTrade } from '@/lib/tradeGrader'
import { ownerHasTradesAccess } from '@/lib/trades'

export const maxDuration = 300

const GRADE_WINDOW_DAYS = 14
const REVISIT_AGE_DAYS = 28
const MAX_GRADES = 25
const MAX_REVISITS = 15
const PER_CALL_DELAY_MS = 5000

type TradeRow = { id: string; league_id: string }

// Filter candidate trades down to leagues whose owner has trades access.
// Owner lookups are cached per run so a league with 5 new trades costs one
// Stripe/comp check, not five.
async function filterEligible(
  db: ReturnType<typeof createAdminClient>,
  rows: TradeRow[],
): Promise<{ eligible: TradeRow[]; leaguesChecked: number }> {
  const leagueIds = [...new Set(rows.map((r) => r.league_id))]
  if (leagueIds.length === 0) return { eligible: [], leaguesChecked: 0 }
  const { data: leagues } = await db
    .from('leagues')
    .select('id, owner_id')
    .in('id', leagueIds)
  const accessByLeague = new Map<string, boolean>()
  const accessByOwner = new Map<string, boolean>()
  for (const lg of leagues ?? []) {
    let ok = accessByOwner.get(lg.owner_id)
    if (ok === undefined) {
      ok = await ownerHasTradesAccess(lg.owner_id)
      accessByOwner.set(lg.owner_id, ok)
    }
    accessByLeague.set(lg.id, ok)
  }
  return {
    eligible: rows.filter((r) => accessByLeague.get(r.league_id) === true),
    leaguesChecked: leagueIds.length,
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const warnings: string[] = []
  const now = Date.now()

  // ── Fresh trades → initial grades ─────────────────────────────────────
  const windowStart = new Date(now - GRADE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: freshRows, error: freshErr } = await db
    .from('trades')
    .select('id, league_id')
    .eq('status', 'completed')
    .is('ai_summary', null)
    .gte('executed_at', windowStart)
    .order('executed_at', { ascending: false })
    .limit(MAX_GRADES * 3)
  if (freshErr) warnings.push(`load fresh trades: ${freshErr.message}`)

  const fresh = await filterEligible(db, (freshRows ?? []) as TradeRow[])
  const toGrade = fresh.eligible.slice(0, MAX_GRADES)

  let graded = 0
  for (let i = 0; i < toGrade.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS))
    const r = await gradeTrade(toGrade[i].id)
    if (r.graded_sides > 0) graded += 1
    warnings.push(...r.warnings)
  }

  // ── Month-old grades → verdict revisits ───────────────────────────────
  const revisitCutoff = new Date(now - REVISIT_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: staleRows, error: staleErr } = await db
    .from('trades')
    .select('id, league_id')
    .eq('status', 'completed')
    .not('ai_summary', 'is', null)
    .is('revisited_at', null)
    .lte('ai_summary_at', revisitCutoff)
    .order('ai_summary_at', { ascending: true })
    .limit(MAX_REVISITS * 3)
  if (staleErr) warnings.push(`load revisit candidates: ${staleErr.message}`)

  const stale = await filterEligible(db, (staleRows ?? []) as TradeRow[])
  const toRevisit = stale.eligible.slice(0, MAX_REVISITS)

  let revisited = 0
  for (let i = 0; i < toRevisit.length; i++) {
    if (i > 0 || graded > 0) await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS))
    const r = await revisitTrade(toRevisit[i].id)
    if (r.graded_sides > 0) revisited += 1
    warnings.push(...r.warnings)
  }

  return NextResponse.json({
    graded,
    gradeCandidates: fresh.eligible.length,
    revisited,
    revisitCandidates: stale.eligible.length,
    warnings,
  })
}
