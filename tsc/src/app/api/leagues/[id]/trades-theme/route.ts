// POST /api/leagues/[id]/trades-theme — commissioner sets the trade-grader
// visual theme for their league. Saved to leagues.trades_theme; the public
// trades page reads it server-side and applies the matching CSS scope.
//
// Body: { theme: 'tribunal' | 'wire' | 'floor' | 'cards' }
// Returns: { theme }

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { devCacheBust } from '@/lib/devCache'

const Body = z.object({
  theme: z.enum(['tribunal', 'wire', 'floor', 'cards']),
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
    // Editors too, to match sync / grade-trades permissions.
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

  let body: z.infer<typeof Body>
  try {
    const raw = await req.json().catch(() => ({}))
    body = Body.parse(raw)
  } catch (e) {
    return NextResponse.json({ error: `bad body: ${(e as Error).message}` }, { status: 400 })
  }

  const db = createAdminClient()
  const { error } = await db
    .from('leagues')
    .update({ trades_theme: body.theme })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Bust the per-league cache so the next render of the public page picks
  // up the new theme without waiting on the unstable_cache TTL.
  revalidateTag(`league-${id}`, 'max')
  devCacheBust(id)
  return NextResponse.json({ theme: body.theme })
}
