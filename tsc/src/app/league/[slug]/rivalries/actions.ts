'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { pickRivalryName } from './_lib/nameBank'

const Create = z.object({
  leagueId: z.string().uuid(),
  managerA: z.string().uuid(),
  managerB: z.string().uuid(),
  name: z.string().trim().optional(),
  autoName: z.coerce.boolean().optional(),
})

export async function createRivalry(_prev: unknown, formData: FormData) {
  // When auto-name is checked the name input is unmounted from the DOM, so
  // formData.get('name') returns null — coerce to undefined so the optional
  // schema accepts it instead of rejecting with "Expected string, received null".
  const parsed = Create.safeParse({
    leagueId: formData.get('leagueId'),
    managerA: formData.get('managerA'),
    managerB: formData.get('managerB'),
    name: formData.get('name') ?? undefined,
    autoName: formData.get('autoName') ?? undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { leagueId, managerA, managerB, autoName } = parsed.data
  let { name } = parsed.data
  if (managerA === managerB) return { ok: false, error: 'Pick two different managers.' }

  const supabase = await createClient()

  // Auto-name when the checkbox is on OR when no name was typed. Resolve to
  // canonical profile names (post-merge) when available — the manager-level
  // display_name can lag after a profile rename, which would otherwise leak
  // a stale name into the auto-generated title.
  if (autoName || !name || !name.trim()) {
    const [{ data: mgrs }, { data: existing }] = await Promise.all([
      supabase
        .from('managers')
        .select('id, display_name, profile:manager_profiles(canonical_name)')
        .in('id', [managerA, managerB]),
      supabase
        .from('rivalries')
        .select('name')
        .eq('league_id', leagueId),
    ])
    type Row = { id: string; display_name: string | null; profile: { canonical_name: string } | { canonical_name: string }[] | null }
    const nameOf = (mid: string): string => {
      const row = (mgrs as Row[] | null | undefined)?.find((m) => m.id === mid)
      if (!row) return 'Unknown'
      const prof = Array.isArray(row.profile) ? row.profile[0] : row.profile
      return (prof?.canonical_name?.trim() || row.display_name?.trim() || 'Unknown')
    }
    const aName = nameOf(managerA)
    const bName = nameOf(managerB)
    const takenNames = new Set(
      (existing ?? []).map((r) => (r.name ?? '').trim().toLowerCase()),
    )
    name = pickRivalryName(managerA, managerB, aName, bName, takenNames)
  }

  const { error } = await supabase.from('rivalries').insert({
    league_id: leagueId,
    manager_a_id: managerA,
    manager_b_id: managerB,
    name,
    auto_named: !!autoName,
  })
  if (error) return { ok: false, error: error.message }

  // Find slug for redirect
  const { data: league } = await supabase.from('leagues').select('slug').eq('id', leagueId).single()
  revalidatePath(`/league/${league?.slug}/rivalries`)
  redirect(`/league/${league?.slug}/rivalries`)
}

export async function deleteRivalry(rivalryId: string, leagueSlug: string) {
  const supabase = await createClient()
  await supabase.from('rivalries').delete().eq('id', rivalryId)
  revalidatePath(`/league/${leagueSlug}/rivalries`)
}
