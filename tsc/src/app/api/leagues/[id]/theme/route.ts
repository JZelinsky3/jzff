// POST /api/leagues/[id]/theme — commissioner sets the almanac visual theme.
// Saved to leagues.theme; the public route handler reads it and applies the
// matching data-theme attribute + CSS scope.
//
// Body: { theme: 'midnight-press' | 'broadsheet' | null }
// Returns: { theme }

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { devCacheBust } from '@/lib/devCache'

const Body = z.object({
  theme: z.enum(['midnight-press', 'broadsheet']).nullable(),
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
    .update({ theme: body.theme })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`league-${id}`, 'max')
  devCacheBust(id)
  return NextResponse.json({ theme: body.theme })
}
