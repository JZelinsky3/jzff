// GET  /api/me/whats-new/?league=<slug>[&force=1]
//      Should the signed-in owner see the "what's new" popup right now, and
//      if so, what it says about their league. `league` is the league whose
//      setup pages they're on; without it (the dashboard) the newest league
//      with a live season is used, else the newest. `force` skips the
//      how-often rules, for checking the popup by hand (?whatsnew in a URL).
//
// POST /api/me/whats-new/   { action: 'shown' | 'done' }
//      Records a showing, or that they're finished with it.
//
// State lives on auth.users.user_metadata.notices[WHATS_NEW_ID], the same
// way /api/me/tutorial keeps tour state, so it follows the user between
// devices without a table. The rules themselves are in lib/whatsNew.ts.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveLeagueTier } from '@/lib/leagueTier'
import { latestRecapWeek } from '@/lib/recap/load'
import {
  WHATS_NEW_ID,
  whatsNewGate,
  type WhatsNewPayload,
  type WhatsNewResponse,
  type WhatsNewState,
} from '@/lib/whatsNew'

const HOUR_MS = 60 * 60 * 1000

function noShow(retry: string | null) {
  return NextResponse.json({ show: false, retry } satisfies WhatsNewResponse)
}

function stateOf(meta: Record<string, unknown> | undefined): WhatsNewState | undefined {
  const notices = (meta?.notices ?? {}) as Record<string, WhatsNewState | undefined>
  return notices[WHATS_NEW_ID]
}

// The paper's headline, off the stored subject line ("Week 4 in PAMS: Joey
// snaps five-game skid against Mason", or "Connie wins the 2026 title.
// PAMS, week 17" for a final). See recapSubject in lib/recap/intro.ts.
function headlineFrom(subject: string | null | undefined): string | null {
  if (!subject) return null
  const lead = subject.match(/^(?:Week|Playoffs, week) \d+ in .+?: (.+)$/)
  if (lead) return lead[1].trim() || null
  const title = subject.match(/^(.+ wins the \d{4} title)\. /)
  return title ? title[1] : null
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const url = new URL(req.url)
  const force = url.searchParams.get('force') === '1'
  const slug = url.searchParams.get('league')

  if (!force) {
    const gate = whatsNewGate(stateOf(user.user_metadata), Date.now())
    if (!gate.ok) return noShow(gate.retry)
  }

  // Owned leagues only: the popup talks about "your league", and a site
  // admin assisting someone else's league isn't its commissioner.
  let league: { id: string; name: string; slug: string; owner_id: string; last_synced_at: string | null } | null = null
  if (slug) {
    const { data } = await supabase
      .from('leagues')
      .select('id, name, slug, owner_id, last_synced_at')
      .eq('slug', slug)
      .eq('owner_id', user.id)
      .maybeSingle()
    league = data
  } else {
    const { data: owned } = await supabase
      .from('leagues')
      .select('id, name, slug, owner_id, last_synced_at')
      .eq('owner_id', user.id)
      .eq('manager_view', false)
      .order('created_at', { ascending: false })
    const rows = owned ?? []
    if (rows.length > 1) {
      const { data: live } = await supabase
        .from('seasons')
        .select('league_id')
        .in('league_id', rows.map((r) => r.id))
        .eq('is_live', true)
      const liveIds = new Set((live ?? []).map((r) => r.league_id as string))
      league = rows.find((r) => liveIds.has(r.id)) ?? rows[0]
    } else {
      league = rows[0] ?? null
    }
  }
  // No league yet (a brand-new account), or not theirs: ask again later
  // rather than never, so it still reaches them once they've made one.
  if (!league) return noShow(new Date(Date.now() + HOUR_MS).toISOString())
  // A league whose first sync hasn't finished: its hub is asking them to
  // stay put until it does, so the popup waits for a later visit.
  if (!league.last_synced_at && !force) return noShow(new Date(Date.now() + HOUR_MS / 4).toISOString())

  const [tier, latest] = await Promise.all([
    resolveLeagueTier(league.id, league.owner_id),
    latestRecapWeek(league.id),
  ])

  let recap: WhatsNewPayload['recap'] = null
  if (latest) {
    const { data: stored } = await createAdminClient()
      .from('weekly_recaps')
      .select('subject')
      .eq('league_id', league.id)
      .eq('season_year', latest.year)
      .eq('week', latest.week)
      .maybeSingle()
    recap = { ...latest, headline: headlineFrom(stored?.subject as string | null | undefined) }
  }

  const payload: WhatsNewPayload = {
    league: { name: league.name, slug: league.slug },
    full: tier !== 'udfa',
    recap,
  }
  return NextResponse.json({ show: true, payload } satisfies WhatsNewResponse)
}

const Body = z.object({ action: z.enum(['shown', 'done']) })

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })

  const notices = { ...((user.user_metadata?.notices ?? {}) as Record<string, WhatsNewState>) }
  const cur = notices[WHATS_NEW_ID] ?? {}
  const now = new Date().toISOString()
  notices[WHATS_NEW_ID] =
    parsed.data.action === 'shown'
      ? { ...cur, n: (cur.n ?? 0) + 1, at: now }
      : { ...cur, done: now }

  const { error } = await supabase.auth.updateUser({ data: { notices } })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
