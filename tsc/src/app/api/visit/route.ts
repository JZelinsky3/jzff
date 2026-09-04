// POST /api/visit
// Body: { path?: string }
//
// Marks the signed-in user as present today. Fired once per browser tab
// session by VisitPing in the root layout, which is why this is a POST to a
// route and not something in middleware: middleware runs on every request,
// including image and data fetches, and would turn one visit into fifty
// writes.
//
// Signed-out callers are a silent no-op. The route is exempt from the auth
// gate for the same reason /api/attribution is: it fires on public pages too,
// and a fetch() bounced to /login as HTML is noise in the console for no gain.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// The day boundary that matters is Joey's, not UTC's. A Sunday 9pm ET visit
// is already Monday in UTC, which would scatter one evening across two days
// and make Sunday -- the busiest day this site has -- look half as active.
const SITE_TZ = 'America/New_York'
function siteDay(): string {
  // en-CA formats as YYYY-MM-DD, which is what the date column wants.
  return new Intl.DateTimeFormat('en-CA', { timeZone: SITE_TZ }).format(new Date())
}

const schema = z.object({ path: z.string().trim().max(200).optional() })

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const parsed = schema.safeParse(body)
  const path = parsed.success ? parsed.data.path ?? null : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: true, recorded: false })

  const db = createAdminClient()
  const { error } = await db.rpc('record_visit', {
    p_user: user.id,
    p_day: siteDay(),
    p_path: path,
  })
  if (error) {
    // Never surface this: a failed analytics write must not colour a page
    // load. Logged so a missing migration 0066 is findable.
    console.error('[visit] record_visit failed:', error.message)
    return NextResponse.json({ ok: true, recorded: false })
  }

  return NextResponse.json({ ok: true, recorded: true })
}
