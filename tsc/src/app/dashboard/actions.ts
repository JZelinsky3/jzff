'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { devCacheBust } from '@/lib/devCache'

type Result = { ok: false; error: string } | { ok: true }

// Hard-delete a league and everything attached to it: sources, seasons,
// managers, profiles, rivalries, pickems, members. Every league_id FK is
// `on delete cascade`, so deleting the leagues row is sufficient.
//
// Requires the caller to type the league name as a guard against fat-finger
// deletion (passed in as `confirmName`).
const DeleteSchema = z.object({
  leagueId: z.string().uuid(),
  confirmName: z.string().trim().min(1),
})

export async function deleteLeague(input: z.infer<typeof DeleteSchema>): Promise<Result> {
  const parsed = DeleteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid input.' }
  const { leagueId, confirmName } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  // Only the owner can delete — editors get write access but not destruction.
  const { data: league } = await supabase
    .from('leagues')
    .select('id, owner_id, name, slug')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league) return { ok: false, error: 'League not found.' }
  if (league.owner_id !== user.id) return { ok: false, error: 'Only the league owner can delete it.' }
  if (confirmName.toLowerCase() !== league.name.trim().toLowerCase()) {
    return { ok: false, error: 'League name didn’t match — delete cancelled.' }
  }

  const db = createAdminClient()
  const { error } = await db.from('leagues').delete().eq('id', leagueId)
  if (error) return { ok: false, error: error.message }

  // Bust caches so the now-404'd public almanac doesn't keep serving from cache.
  revalidateTag(`league-${leagueId}`, 'max')
  devCacheBust(leagueId)
  revalidatePath('/dashboard')
  revalidatePath(`/leagues/${league.slug}`, 'layout')
  return { ok: true }
}
