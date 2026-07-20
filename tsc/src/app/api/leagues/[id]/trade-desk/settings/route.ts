// /api/leagues/[id]/trade-desk/settings
//
// GET  — public read. Returns the league's Trade Desk override settings
//        merged on top of EMPTY_SETTINGS, plus the viewer's commish status
//        so the drawer knows whether to render the editable form or the
//        read-only summary.
// POST — owner or editor only. Validates the body against
//        TradeDeskSettingsSchema, stamps confirmedAt + confirmedBy, writes
//        the column, busts the league cache tag. Body must NOT include
//        confirmedAt / confirmedBy — those are stamped server-side.
//
// We don't gate the public read on auth because the drawer is meant to be
// transparent: any league member should be able to see what the commish
// has configured ("PPR · Superflex · 12 teams") to confirm grades they're
// looking at were calibrated correctly.

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { devCacheBust } from '@/lib/devCache'
import {
  parseSettings,
  validateSettingsForWrite,
  type TradeDeskSettings,
} from '@/lib/tradeDesk/settings'

type LeagueRow = {
  id: string
  owner_id: string | null
  trade_desk_settings: unknown
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  // Admin client for the league row read — the leagues table has RLS that
  // filters by owner, so an anon viewer reading their own league would 404
  // through the user-scoped client. The drawer is public-read, so we bypass
  // RLS here. Auth is still required to set isCommish (next block).
  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, owner_id, trade_desk_settings')
    .eq('id', id)
    .maybeSingle<LeagueRow>()
  if (!league) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Viewer's commish status — used by the drawer to decide which form
  // surface to render. owner OR editor counts as a writer, matching the
  // POST route's gate. The user-scoped client reads the session cookie.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let isCommish = false
  if (user) {
    if (league.owner_id && user.id === league.owner_id) {
      isCommish = true
    } else {
      const { data: member } = await db
        .from('league_members')
        .select('role')
        .eq('league_id', id)
        .eq('user_id', user.id)
        .maybeSingle<{ role: string }>()
      isCommish = !!member && ['owner', 'editor'].includes(member.role)
      if (!isCommish) isCommish = await isSiteAdmin(user.id)
    }
  }

  const settings: TradeDeskSettings = parseSettings(league.trade_desk_settings)
  return NextResponse.json(
    { settings, isCommish, leagueId: id },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: league } = await supabase
    .from('leagues')
    .select('id, owner_id')
    .eq('id', id)
    .maybeSingle<{ id: string; owner_id: string | null }>()
  if (!league) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (league.owner_id !== user.id) {
    const { data: member } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', id)
      .eq('user_id', user.id)
      .maybeSingle<{ role: string }>()
    if (!member || !['owner', 'editor'].includes(member.role)) {
      if (!(await isSiteAdmin(user.id))) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    }
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const validation = validateSettingsForWrite(raw)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const next: TradeDeskSettings = {
    ...validation.value,
    confirmedAt: new Date().toISOString(),
    confirmedBy: user.id,
  }

  const db = createAdminClient()
  const { error } = await db
    .from('leagues')
    .update({ trade_desk_settings: next })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Bust the per-league cache tag so any unstable_cache-backed reads
  // (bundle export, future Analyzer caches) pick up the new settings.
  revalidateTag(`league-${id}`, 'max')
  devCacheBust(id)

  return NextResponse.json({ settings: next, isCommish: true, leagueId: id })
}
