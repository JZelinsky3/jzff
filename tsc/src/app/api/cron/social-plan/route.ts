import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { planWeek } from '@/lib/social/plan'
import { sendDigest } from '@/lib/social/digest'
import { refreshThreadsToken } from '@/lib/social/threads'

export const maxDuration = 120

// Saturday morning, from .github/workflows/cron.yml: write next week's social
// posts, email Joey the list, and refresh the Threads token so it never
// reaches its 60-day expiry. See src/lib/social/plan.ts for the week.
//
// Query parameters, all optional:
//   ?dry=1             build and report, write nothing, email nobody
//   ?monday=YYYY-MM-DD plan that week instead of the next one
//   ?digest=0          plan without emailing
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`, or a signed-in site admin
// for ?dry=1 straight from the browser.

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const dry = params.get('dry') === '1'

  const secret = process.env.CRON_SECRET
  const viaCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!viaCron) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!dry || !user || !(await isSiteAdmin(user.id))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const db = createAdminClient()
  try {
    const plan = await planWeek(db, { monday: params.get('monday') ?? undefined, dry })
    const digest = dry || params.get('digest') === '0' ? ['not sent'] : await sendDigest(db, plan.monday)
    const threadsToken = dry ? null : await refreshThreadsToken(db)
    return NextResponse.json({ ok: true, dry, ...plan, digest, threadsToken })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
