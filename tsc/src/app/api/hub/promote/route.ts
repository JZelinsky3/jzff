// POST /api/hub/promote — opt a league onto (or off of) the Newsstand's
// "On the market" board.
//   { leagueId, action: 'set', text, link? }  — promote / update the pitch
//   { leagueId, action: 'clear' }             — take it down
//
// Writes go through the caller's own Supabase client so the existing
// "leagues update if owner" RLS policy is the authorization check — no
// admin client, no extra ownership lookup to get wrong.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Body = z.object({
  leagueId: z.string().uuid(),
  action: z.enum(['set', 'clear']),
  text: z.string().trim().max(280).optional(),
  link: z.string().trim().max(300).optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  const { leagueId, action, text, link } = parsed.data

  // RLS scopes this select to leagues the user can access; the owner check
  // keeps co-commish viewers from promoting someone else's league.
  const { data: league } = await supabase
    .from('leagues')
    .select('id, owner_id, published_at')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league || league.owner_id !== user.id) {
    return NextResponse.json({ error: 'League not found.' }, { status: 404 })
  }

  if (action === 'clear') {
    const { error } = await supabase
      .from('leagues')
      .update({ promoted_at: null, promo_text: null, promo_link: null })
      .eq('id', leagueId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!league.published_at) {
    return NextResponse.json({ error: 'Publish the league first — only public almanacs can be promoted.' }, { status: 400 })
  }
  const pitch = (text ?? '').trim()
  if (pitch.length < 10) {
    return NextResponse.json({ error: 'Give the pitch at least a sentence (10+ characters).' }, { status: 400 })
  }
  let cleanLink: string | null = null
  if (link) {
    try {
      const u = new URL(link)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad protocol')
      cleanLink = u.toString()
    } catch {
      return NextResponse.json({ error: 'Link must be a full http(s) URL.' }, { status: 400 })
    }
  }

  const { error } = await supabase
    .from('leagues')
    .update({ promoted_at: new Date().toISOString(), promo_text: pitch, promo_link: cleanLink })
    .eq('id', leagueId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // One ad slot per account: promoting this league takes down any other
  // listing the user has up. RLS (owner update) scopes the sweep.
  await supabase
    .from('leagues')
    .update({ promoted_at: null, promo_text: null, promo_link: null })
    .eq('owner_id', user.id)
    .neq('id', leagueId)
    .not('promoted_at', 'is', null)

  return NextResponse.json({ ok: true })
}
