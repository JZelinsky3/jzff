// POST /api/bookmarks  { slug, action: 'add' | 'remove' }
// Toggles a user's bookmark of a public almanac. Caller must be signed in.
// Commissioners trying to bookmark their own league are rejected — they
// already have it on their dashboard via the leagues list.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Body = z.object({
  slug: z.string().min(1).max(120),
  action: z.enum(['add', 'remove']),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const { slug, action } = parsed.data

  const { data: league } = await supabase
    .from('leagues')
    .select('id, owner_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) return NextResponse.json({ error: 'League not found.' }, { status: 404 })
  if (league.owner_id === user.id) {
    return NextResponse.json({ error: 'You own this league.' }, { status: 400 })
  }

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
