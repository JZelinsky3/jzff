// POST /api/attribution
// Body: { utm_source?, utm_medium?, utm_campaign?, first_referrer? }
//
// Write-once first-touch attribution for the signed-in user. Called by
// AttributionCapture on mount, which means it fires for signed-out visitors
// too — those are a no-op, because the row we would write to doesn't exist
// until they have an account.
//
// Idempotent by construction: a column is only filled when it is still null,
// so re-posting on every page load never rewrites history, and the ad that
// originally found someone keeps the credit.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const field = z.string().trim().max(120).optional()
const schema = z.object({
  utm_source: field,
  utm_medium: field,
  utm_campaign: field,
  first_referrer: field,
})

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 })

  const input = parsed.data
  if (!input.utm_source && !input.utm_medium && !input.utm_campaign && !input.first_referrer) {
    return NextResponse.json({ ok: true, stored: false })
  }

  // Signed out is the common case (this runs on public pages too). Nothing to
  // attribute yet; the cookie keeps the value until they have an account.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: true, stored: false })

  const db = createAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('utm_source, utm_medium, utm_campaign, first_referrer')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) return NextResponse.json({ ok: true, stored: false })

  // Only fill blanks. A user who arrived from an ad in August and comes back
  // via Google search in October stays credited to August.
  const patch: Record<string, string> = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'first_referrer'] as const) {
    const incoming = input[k]
    if (incoming && !profile[k]) patch[k] = incoming
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, stored: false })
  }

  const { error } = await db.from('profiles').update(patch).eq('id', user.id)
  if (error) {
    console.error('[attribution] update failed:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  return NextResponse.json({ ok: true, stored: true, fields: Object.keys(patch) })
}
