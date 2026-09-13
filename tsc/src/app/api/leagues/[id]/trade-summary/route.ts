// GET  /api/leagues/[id]/trade-summary — recent trades with their write-ups
// PATCH /api/leagues/[id]/trade-summary — replace one trade's write-up
//
// The write-up has always been a column with no way to touch it: the only
// way to change one word was to re-grade the trade, which spends an AI call
// and comes back with a different paragraph, so a write-up that was 95% right
// had to be thrown away to fix the other 5%. This is the missing edit.
//
// Hand edits are stamped ai_summary_model = 'hand' so a paragraph a person
// wrote can never be mistaken for one the model wrote. A later Re-grade still
// overwrites it, which is correct: asking for a re-grade is asking for new
// copy.

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { stripDashes } from '@/lib/tradeGrader'
import { devCacheBust } from '@/lib/devCache'

// Same ceiling gradeTrade stores at, so a hand-edited write-up can't be
// longer than one the model could have produced.
const MAX_SUMMARY = 1500

async function authorize(leagueId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }

  const { data: league } = await supabase
    .from('leagues')
    .select('id, owner_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) }

  if (league.owner_id !== user.id) {
    const { data: member } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member || !['owner', 'editor'].includes(member.role)) {
      if (!(await isSiteAdmin(user.id))) {
        return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
      }
    }
  }
  return { error: null }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { error } = await authorize(id)
  if (error) return error

  const url = new URL(req.url)
  const limit = Math.max(1, Math.min(25, Number(url.searchParams.get('limit')) || 10))

  const db = createAdminClient()
  const { data: trades, error: tErr } = await db
    .from('trades')
    .select('id, week, executed_at, ai_summary, ai_summary_model, seasons!inner(year)')
    .eq('league_id', id)
    .eq('status', 'completed')
    .order('executed_at', { ascending: false })
    .limit(limit)
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  // Who was in each deal, so the list is readable without opening anything.
  const ids = (trades ?? []).map((t) => t.id as string)
  const { data: sides } = ids.length > 0
    ? await db
        .from('trade_sides')
        .select('trade_id, managers!inner(display_name, team_name)')
        .in('trade_id', ids)
    : { data: [] }

  const namesByTrade = new Map<string, string[]>()
  for (const s of sides ?? []) {
    const mgr = Array.isArray(s.managers) ? s.managers[0] : s.managers
    const who = (mgr?.team_name as string | null) || (mgr?.display_name as string) || 'Manager'
    const list = namesByTrade.get(s.trade_id as string) ?? []
    list.push(who)
    namesByTrade.set(s.trade_id as string, list)
  }

  return NextResponse.json({
    trades: (trades ?? []).map((t) => {
      const season = Array.isArray(t.seasons) ? t.seasons[0] : t.seasons
      return {
        id: t.id,
        week: t.week,
        executed_at: t.executed_at,
        season_year: season?.year ?? null,
        summary: t.ai_summary ?? '',
        hand_edited: t.ai_summary_model === 'hand',
        managers: namesByTrade.get(t.id as string) ?? [],
      }
    }),
  })
}

const Patch = z.object({
  tradeId: z.string().uuid(),
  summary: z.string().max(MAX_SUMMARY * 2),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { error } = await authorize(id)
  if (error) return error

  let body: z.infer<typeof Patch>
  try {
    body = Patch.parse(await req.json())
  } catch (e) {
    return NextResponse.json({ error: `bad body: ${(e as Error).message}` }, { status: 400 })
  }

  const db = createAdminClient()
  // The trade has to belong to THIS league. Without this check, anyone who
  // owns any league could edit any trade in the database by passing its id.
  const { data: trade } = await db
    .from('trades')
    .select('id, league_id')
    .eq('id', body.tradeId)
    .maybeSingle()
  if (!trade || trade.league_id !== id) {
    return NextResponse.json({ error: 'trade not found in this league' }, { status: 404 })
  }

  // House style is enforced on the way in, same as it is for the model: an
  // em dash typed by hand is still an em dash on the page.
  const summary = stripDashes(body.summary).slice(0, MAX_SUMMARY)

  const { error: upErr } = await db
    .from('trades')
    .update({
      ai_summary: summary || null,
      ai_summary_model: 'hand',
      ai_summary_at: new Date().toISOString(),
    })
    .eq('id', body.tradeId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  revalidateTag(`league-${id}`, 'max')
  devCacheBust(id)
  return NextResponse.json({ ok: true, summary })
}
