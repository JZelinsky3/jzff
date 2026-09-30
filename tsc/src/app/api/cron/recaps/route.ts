import { NextResponse } from 'next/server'
import { runRecaps } from '@/lib/recap/run'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'

export const maxDuration = 300

// Weekly recaps, driven by .github/workflows/cron.yml on Tuesday right after
// the live refresh, with a Wednesday pass that picks up anything held. The
// job itself lives in src/lib/recap/run.ts; this is auth and parameters.
//
// Query parameters, all optional, for running it by hand:
//   ?dry=1          build and report, write nothing, send nothing
//   ?league=<slug>  only this league
//   ?force=1        rebuild an existing recap's facts and intro (never re-sends)
//   ?preview=1      email the recap to the site admins, marked [Preview];
//                   needs ?league=, logs nothing
//   ?offset=N       resume point, returned as nextOffset when time runs out
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`, failing closed when unset.
// A signed-in site admin may also open ?preview=1 or ?dry=1 straight from the
// browser, so checking an email doesn't mean pasting the cron secret into a
// terminal. Those two can only ever email the admins themselves, or nobody.

export async function GET(req: Request) {
  const startedAt = Date.now()
  const params = new URL(req.url).searchParams
  const flag = (k: string) => params.get(k) === '1' || params.get(k) === 'true'
  const slug = params.get('league')

  const secret = process.env.CRON_SECRET
  const viaCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!viaCron) {
    const harmless = flag('preview') || flag('dry')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!harmless || !user || !(await isSiteAdmin(user.id))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  if (flag('preview') && !slug) {
    return NextResponse.json({ error: 'preview needs ?league=<slug>' }, { status: 400 })
  }

  const report = await runRecaps({
    startedAt,
    dry: flag('dry'),
    slug,
    force: flag('force'),
    preview: flag('preview'),
    offset: Math.max(0, Number(params.get('offset') ?? 0) || 0),
  })

  if (!report.ok) return NextResponse.json(report, { status: 500 })
  return NextResponse.json({ ...report, elapsedMs: Date.now() - startedAt })
}
