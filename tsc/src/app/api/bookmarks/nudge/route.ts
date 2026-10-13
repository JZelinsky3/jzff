// POST /api/bookmarks/nudge
// Body: { slug: string, vid: string, event: 'shown' | 'tapped' | 'dismissed' | 'bookmarked' }
//
// One step of the "save this league" card on an almanac
// (public/pams-template/assets/js/follow-nudge.js), for the funnel on /admin.
// Public, because guests are most of who sees it. Skips crawlers, site admins
// and Joey's own accounts, the same way /api/visit/league does, and the
// league's own commissioner (the card never shows them anyway).
//
// 'bookmarked' is only recorded when the signed-in caller really has the
// bookmark, so a hand-made request can't fake a conversion.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { isOwnEmail } from '@/lib/ownAccounts'

const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|whatsapp|telegram/i

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  vid: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  event: z.enum(['shown', 'tapped', 'dismissed', 'bookmarked']),
})

const skipped = () => NextResponse.json({ ok: true, recorded: false })

export async function POST(req: NextRequest): Promise<Response> {
  if (BOT_UA.test(req.headers.get('user-agent') ?? '')) return skipped()
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return skipped()
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return skipped()
  const { slug, vid, event } = parsed.data

  const db = createAdminClient()
  const supabase = await createClient()
  const [{ data: league }, { data: { user } }] = await Promise.all([
    db.from('leagues').select('id, owner_id, published_at').eq('slug', slug).maybeSingle(),
    supabase.auth.getUser(),
  ])
  if (!league?.published_at) return skipped()
  if (user && (user.id === league.owner_id || isOwnEmail(user.email) || (await isSiteAdmin(user.id)))) return skipped()

  if (event === 'bookmarked') {
    if (!user) return skipped()
    const { data: bm } = await db
      .from('league_bookmarks')
      .select('league_id')
      .eq('user_id', user.id)
      .eq('league_id', league.id)
      .maybeSingle()
    if (!bm) return skipped()
  }

  const { error } = await db.from('follow_nudge_events').upsert(
    { league_id: league.id, vid, user_id: user?.id ?? null, event, signed_in: !!user },
    { onConflict: 'league_id,vid,event', ignoreDuplicates: true },
  )
  if (error) {
    console.error('[bookmarks/nudge] insert failed:', error.message)
    return skipped()
  }
  return NextResponse.json({ ok: true, recorded: true })
}
