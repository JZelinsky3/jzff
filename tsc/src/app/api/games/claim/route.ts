// GET  /api/games/claim?pool=<league-slug>   who you are in this league
// POST /api/games/claim  { pool, managerId }  say who you are
//
// Asked once, at the first post to a league board, because that is the
// moment the answer is worth something: the board is about to print a name
// and the site one is wrong. Not a settings page, which nobody visits.
//
// Only ever a single league. The site pool and combined wheels have no
// manager identity to claim, since there is no such thing as one person
// across two leagues here.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadManagerOptions } from '@/lib/managerOptions'
import { soleLeagueSlug } from '@/lib/minigames/boardIdentity'

export const dynamic = 'force-dynamic'

async function leagueFor(slug: string) {
  const db = createAdminClient()
  const { data } = await db.from('leagues').select('id, name, slug').eq('slug', slug).maybeSingle()
  return data as { id: string; name: string; slug: string } | null
}

export async function GET(req: NextRequest) {
  const slug = soleLeagueSlug((req.nextUrl.searchParams.get('pool') ?? '').trim().toLowerCase())
  if (!slug) {
    return NextResponse.json({ ok: false, error: 'Not a league board.' }, { status: 400 })
  }

  const league = await leagueFor(slug)
  if (!league) {
    return NextResponse.json({ ok: false, error: 'No league by that name.' }, { status: 404 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const db = createAdminClient()
  const [{ data: claims }, options] = await Promise.all([
    db.from('league_claims').select('profile_id, manager_id').eq('league_id', league.id),
    loadManagerOptions(db, league.id),
  ])

  const rows = (claims ?? []) as { profile_id: string; manager_id: string }[]
  const mine = user ? (rows.find((c) => c.profile_id === user.id) ?? null) : null
  // Managers somebody else has already claimed. Shown as taken rather than
  // hidden: "that one is spoken for" is information, a name silently missing
  // from the list is a bug report.
  const takenBy = new Set(rows.filter((c) => c.profile_id !== user?.id).map((c) => c.manager_id))

  return NextResponse.json(
    {
      ok: true,
      signedIn: !!user,
      league: { slug: league.slug, name: league.name },
      claimed: mine?.manager_id ?? null,
      options: options.map((o) => ({ id: o.id, name: o.name, taken: takenBy.has(o.id) })),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Sign in first.' }, { status: 401 })
  }

  let body: { pool?: unknown; managerId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 })
  }

  const slug = soleLeagueSlug(
    typeof body.pool === 'string' ? body.pool.trim().toLowerCase() : ''
  )
  const managerId = typeof body.managerId === 'string' ? body.managerId : ''
  if (!slug || !managerId) {
    return NextResponse.json({ ok: false, error: 'Missing league or manager.' }, { status: 400 })
  }

  const league = await leagueFor(slug)
  if (!league) {
    return NextResponse.json({ ok: false, error: 'No league by that name.' }, { status: 404 })
  }

  // The manager has to actually be in that league. Without this check the
  // body could name any manager row on the site and the board would print a
  // name from a league the player has never been in.
  const db = createAdminClient()
  const { data: manager } = await db
    .from('managers')
    .select('id')
    .eq('id', managerId)
    .eq('league_id', league.id)
    .maybeSingle()
  if (!manager) {
    return NextResponse.json(
      { ok: false, error: 'That manager is not in this league.' },
      { status: 400 }
    )
  }

  const { error } = await db.from('league_claims').upsert(
    {
      profile_id: user.id,
      league_id: league.id,
      manager_id: managerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,league_id' }
  )

  if (error) {
    // The other unique index: somebody already claimed that manager. First
    // come, and it says so rather than failing silently.
    if (error.code === '23505') {
      return NextResponse.json(
        { ok: false, error: 'Somebody has already claimed that manager.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ ok: false, error: 'Could not save that.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
