import { NextResponse } from 'next/server'
import { previewReportHtml, runReports } from '@/lib/report/run'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'

export const maxDuration = 300

// The Progress Report email, driven by .github/workflows/cron.yml on the
// Thursday after a report week (lib/report/build REPORT_WEEKS), with an
// afternoon pass for anything held or dropped. The job lives in
// src/lib/report/run.ts; this is auth and parameters.
//
// Query parameters, all optional, for running it by hand:
//   ?dry=1          build and report, send nothing
//   ?league=<slug>  only this league
//   ?preview=1      email the report to the site admins, marked [Preview];
//                   needs ?league=
//   ?week=N         another report week, with ?dry, ?preview or ?html only
//   ?html=1         the email itself, in the browser; needs ?league= and
//                   ?week=, sends nothing (&as=list for the list copy)
//   ?offset=N       resume point, returned as nextOffset when time runs out
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`, failing closed when unset.
// A signed-in site admin may open ?preview, ?dry or ?html from the browser;
// those can only ever email the admins themselves, or nobody.

export async function GET(req: Request) {
  const startedAt = Date.now()
  const params = new URL(req.url).searchParams
  const flag = (k: string) => params.get(k) === '1' || params.get(k) === 'true'
  const slug = params.get('league')
  const week = Number(params.get('week') ?? 0) || null

  const secret = process.env.CRON_SECRET
  const viaCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!viaCron) {
    const harmless = flag('preview') || flag('dry') || flag('html')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!harmless || !user || !(await isSiteAdmin(user.id))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  if (flag('html')) {
    if (!slug || !week) return NextResponse.json({ error: 'html needs ?league=<slug>&week=<n>' }, { status: 400 })
    const r = await previewReportHtml(slug, week, params.get('as') === 'list' ? 'subscriber' : 'owner')
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 })
    return new Response(r.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  if (flag('preview') && !slug) {
    return NextResponse.json({ error: 'preview needs ?league=<slug>' }, { status: 400 })
  }

  const report = await runReports({
    startedAt,
    dry: flag('dry'),
    slug,
    preview: flag('preview'),
    week,
    offset: Math.max(0, Number(params.get('offset') ?? 0) || 0),
  })

  if (!report.ok) return NextResponse.json(report, { status: 500 })
  return NextResponse.json({ ...report, elapsedMs: Date.now() - startedAt })
}
