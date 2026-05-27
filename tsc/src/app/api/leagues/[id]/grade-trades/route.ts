// POST /api/leagues/[id]/grade-trades — manually grade up to N ungraded
// trades for this league via Groq. Owner / editor only.
//
// Body (all optional):
//   { limit?: number,        // default 25, capped at 50 server-side
//     seasonYear?: number }  // restrict to one season's trades
//
// Returns: { scanned, graded, warnings }
//
// We bust the league's cache tag after writing so the public trades page
// reflects new grades on next request. The trades data endpoint itself is
// not cached (Cache-Control: no-store), so this is belt-and-suspenders for
// any future caching layer.

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { gradeUngradedForLeague } from '@/lib/tradeGrader'
import { devCacheBust } from '@/lib/devCache'

// Vercel timeout — grading 25 trades at ~1.5s/call is well under this.
export const maxDuration = 300

const Body = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  seasonYear: z.number().int().min(1900).max(2100).optional(),
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
    .select('id, owner_id')
    .eq('id', id)
    .maybeSingle()
  if (!league) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (league.owner_id !== user.id) {
    const { data: member } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member || !['owner', 'editor'].includes(member.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
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
    const result = await gradeUngradedForLeague({
      leagueId: id,
      limit: body.limit ?? 25,
      seasonYear: body.seasonYear ?? null,
    })
    revalidateTag(`league-${id}`, 'max')
    devCacheBust(id)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'grade failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
