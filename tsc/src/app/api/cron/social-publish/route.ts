import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishDue } from '@/lib/social/publish'

export const maxDuration = 120

// Hourly through the day, from .github/workflows/cron.yml: send every social
// post that is due and not vetoed. Does nothing but report until SOCIAL_LIVE=1.
// See src/lib/social/publish.ts for the rules.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` only. This one posts in
// public, so there is no browser path; "Send now" on /admin/social is.

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await publishDue(createAdminClient())) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
