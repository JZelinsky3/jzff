// POST /api/bookmarks  { slug, action: 'add' | 'remove' }
// Toggles a user's bookmark of a public almanac. Caller must be signed in.
// Commissioners trying to bookmark their own league are rejected — they
// already have it on their dashboard via the leagues list.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const Body = z.object({
  slug: z.string().min(1).max(120),
  action: z.enum(['add', 'remove']),
})

export async function POST(req: Request) {
  // Auth-gate with the regular client so we get the cookie-derived user id.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const { slug, action } = parsed.data

  // Leagues RLS only allows SELECT for the owner or league members. Bookmarks
  // are explicitly for non-owners (people who DON'T have league access), so
  // the regular client can't find the league. Use the admin client to look
  // up the league row — safe because we still gate on the authenticated
  // user_id for the bookmark write below.
  const admin = createAdminClient()
  const { data: league } = await admin
    .from('leagues')
    .select('id, owner_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) return NextResponse.json({ error: 'League not found.' }, { status: 404 })
  if (league.owner_id === user.id) {
    return NextResponse.json({ error: 'You own this league.' }, { status: 400 })
  }

  // Bookmark writes go through the regular client so the RLS policies on
  // league_bookmarks (auth.uid() = user_id) enforce ownership of the row.
  if (action === 'add') {
    const { error } = await supabase
      .from('league_bookmarks')
      .upsert({ user_id: user.id, league_id: league.id }, { onConflict: 'user_id,league_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('league_bookmarks')
      .delete()
      .eq('user_id', user.id)
      .eq('league_id', league.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
