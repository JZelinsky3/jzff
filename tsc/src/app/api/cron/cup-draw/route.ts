import { NextResponse } from 'next/server'
import { runCupDraw } from '@/lib/cup/draw'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'

export const maxDuration = 300

// The League Cup draw (src/lib/cup/draw.ts), driven by
// .github/workflows/cron.yml: just after the announced draw time on draw
// day, after the Wednesday refresh, and Thursday morning. Before the draw
// time it does nothing; on draw day it makes each league's Cup once.
//
// Query parameters, optional, for running it by hand:
//   ?dry=1          work out every league's draw and write nothing (any day,
//                   so it can be checked ahead of the draw)
//   ?league=<slug>  only this league
//   ?through=N      with ?dry=1: seed through week N instead of the launch's
//                   (the draw as it would come out today)
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`, failing closed when unset.
// A signed-in site admin may open ?dry=1 from the browser.

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const dry = params.get('dry') === '1' || params.get('dry') === 'true'

  const secret = process.env.CRON_SECRET
  const viaCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!viaCron) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!dry || !user || !(await isSiteAdmin(user.id))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  // Per-league trouble goes in the body (waiting / warnings). It runs last
  // in the shared Wednesday and Thursday chains, so a failure here shows up
  // red without holding back the recaps or the reports.
  const result = await runCupDraw({ dry, slug: params.get('league'), through: Number(params.get('through')) || null })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
