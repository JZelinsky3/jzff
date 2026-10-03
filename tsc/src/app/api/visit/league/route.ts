// POST /api/visit/league
// Body: { slug: string, vid: string }
//
// One page view of a league's public pages (the almanac, Live Season, the
// recap, awards, games). Fired from the page by a small script the almanac
// route injects, and by <LeagueVisitPing /> on the React league pages.
// Read back on /admin/activity; see migration 0072 for what a row means.
//
// Fired from the browser rather than counted in the almanac route on
// purpose: crawlers fetch those pages constantly and almost never run the
// script, and a crawler that does still has no stored id to come back with.
//
// Public (no auth gate) because signed-out visitors are most of the count.
// Site admins are skipped, so checking on somebody's league from /admin
// doesn't make it look busier.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'

const SITE_TZ = 'America/New_York'
function siteDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SITE_TZ }).format(new Date())
}

const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|whatsapp|telegram/i

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  vid: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
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
  const { slug, vid } = parsed.data

  const db = createAdminClient()
  const supabase = await createClient()
  const [{ data: league }, { data: { user } }] = await Promise.all([
    db.from('leagues').select('id, owner_id, published_at').eq('slug', slug).maybeSingle(),
    supabase.auth.getUser(),
  ])
  if (!league?.published_at) return skipped()
  if (user && (await isSiteAdmin(user.id))) return skipped()

  const role = !user ? 'visitor' : user.id === league.owner_id ? 'owner' : 'member'
  const { error } = await db.rpc('record_league_visit', {
    p_league: league.id,
    p_day: siteDay(),
    p_visitor: user ? `u:${user.id}` : `a:${vid}`,
    p_role: role,
  })
  if (error) {
    // Logged so a missing migration 0072 is findable; never shown.
    console.error('[visit/league] record_league_visit failed:', error.message)
    return skipped()
  }
  return NextResponse.json({ ok: true, recorded: true })
}
