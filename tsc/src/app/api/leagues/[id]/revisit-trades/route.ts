// POST /api/leagues/[id]/revisit-trades — run the 4-week revisit on up to
// N graded trades for this league. Owner/editor only.
//
// Body (optional):
//   { limit?: number,         // default 10, capped at 50
//     eligibleOnly?: boolean } // default false (test mode revisits any
//                              // graded trade); pass true to only revisit
//                              // trades graded ≥ 4 weeks ago (production
//                              // semantics).
//
// Returns: { scanned, revisited, warnings }

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { revisitForLeague } from '@/lib/tradeGrader'
import { devCacheBust } from '@/lib/devCache'

export const maxDuration = 300

const Body = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  eligibleOnly: z.boolean().optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: league } = await supabase
    .from('leagues')
    .select('id, slug, owner_id')
    .eq('id', id)
    .maybeSingle()
  if (!league) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // Manual revisits are a dev/backfill tool for Joey's own leagues only —
  // the daily cron handles production revisits.
  if (!['jake', 'pams'].includes(league.slug)) {
    return NextResponse.json({ error: 'manual revisits are not available for this league' }, { status: 403 })
  }
  if (league.owner_id !== user.id) {
    const { data: member } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member || !['owner', 'editor'].includes(member.role)) {
      if (!(await isSiteAdmin(user.id))) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    }
  }

  let body: z.infer<typeof Body> = {}
  try {
    const raw = await req.json().catch(() => ({}))
    body = Body.parse(raw)
  } catch (e) {
    return NextResponse.json({ error: `bad body: ${(e as Error).message}` }, { status: 400 })
  }

  try {
    const result = await revisitForLeague({
      leagueId: id,
      limit: body.limit ?? 10,
      // Default to test mode (false) so the user can verify the UI without
      // waiting 4 weeks for trades to age. Production cron should pass true.
      eligibleOnly: body.eligibleOnly ?? false,
    })
    revalidateTag(`league-${id}`, 'max')
    devCacheBust(id)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'revisit failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
