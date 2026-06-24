'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Result = { ok: true } | { ok: false; error: string }

async function assertOwner(leagueId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in.' }
  const { data: league } = await supabase
    .from('leagues')
    .select('id, slug, owner_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league) return { ok: false as const, error: 'League not found.' }
  if (league.owner_id !== user.id) return { ok: false as const, error: 'Only the owner can do this.' }
  return { ok: true as const, slug: league.slug }
}

// Wizard-only: flip is_live on the most recent season. Live-season page has a
// fuller setLiveSeason that also writes current_week / start date; this is the
// minimal toggle the welcome flow needs ("is the league mid-season right now?").
const ToggleSchema = z.object({
  leagueId: z.string().uuid(),
  live: z.boolean(),
})

export async function setLatestSeasonLive(input: z.infer<typeof ToggleSchema>): Promise<Result> {
  const parsed = ToggleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid input.' }
  const access = await assertOwner(parsed.data.leagueId)
  if (!access.ok) return access

  const db = createAdminClient()

  // Always clear first — the live flag is meant to be unique per league. If we
  // only flipped one row we could leave a stale prior-season live=true behind.
  const { error: clearErr } = await db
    .from('seasons')
    .update({ is_live: false })
    .eq('league_id', parsed.data.leagueId)
  if (clearErr) return { ok: false, error: clearErr.message }

  if (parsed.data.live) {
    const { data: latest } = await db
      .from('seasons')
      .select('id')
      .eq('league_id', parsed.data.leagueId)
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest) return { ok: false, error: 'No seasons yet — sync a source first.' }
    const { error: setErr } = await db
      .from('seasons')
      .update({ is_live: true })
      .eq('id', latest.id)
    if (setErr) return { ok: false, error: setErr.message }
  }

  revalidateTag(`league-${parsed.data.leagueId}`, 'max')
  revalidatePath(`/league/${access.slug}`)
  revalidatePath(`/league/${access.slug}/live`)
  return { ok: true }
}
