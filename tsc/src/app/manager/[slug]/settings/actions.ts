'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// Loads the chronicle for the signed-in owner by slug, or null. Centralizes the
// owner check every action below needs.
async function ownedChronicle(slug: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, chronicle: null }
  const { data: chronicle } = await supabase
    .from('career_chronicles')
    .select('id, slug, owner_id')
    .eq('slug', slug)
    .eq('owner_id', user.id)
    .maybeSingle()
  return { supabase, user, chronicle }
}

const RenameSchema = z.object({
  slug: z.string().trim().min(1),
  displayName: z.string().trim().min(1, 'Name is required').max(120),
  subtitle: z.string().trim().max(160).optional(),
})

export async function renameChronicle(_prev: { error: string } | null, formData: FormData) {
  const parsed = RenameSchema.safeParse({
    slug: formData.get('slug'),
    displayName: formData.get('displayName'),
    subtitle: formData.get('subtitle') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const { supabase, chronicle } = await ownedChronicle(parsed.data.slug)
  if (!chronicle) return { error: 'Chronicle not found.' }

  const { error } = await supabase
    .from('career_chronicles')
    .update({ display_name: parsed.data.displayName, subtitle: parsed.data.subtitle ?? null })
    .eq('id', chronicle.id)
  if (error) return { error: error.message }

  revalidatePath(`/manager/${parsed.data.slug}`)
  revalidatePath(`/manager/${parsed.data.slug}/settings`)
  return { error: '' }
}

// Removes a league from the chronicle. If the underlying league row exists only
// to feed the hub (manager_view) and no other link references it, delete it too
// so we don't leave orphaned hidden archives behind. A real public archive that
// the user happens to have linked is never deleted — only unlinked.
export async function removeLink(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '')
  const linkId = String(formData.get('linkId') ?? '')
  if (!slug || !linkId) return

  const { supabase, chronicle } = await ownedChronicle(slug)
  if (!chronicle) return

  const { data: link } = await supabase
    .from('career_links')
    .select('id, league_id, chronicle_id')
    .eq('id', linkId)
    .eq('chronicle_id', chronicle.id)
    .maybeSingle()
  if (!link) return

  await supabase.from('career_links').delete().eq('id', link.id)

  const { data: league } = await supabase
    .from('leagues')
    .select('id, manager_view')
    .eq('id', link.league_id as string)
    .maybeSingle()
  if (league?.manager_view) {
    const { count } = await supabase
      .from('career_links')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', league.id)
    if ((count ?? 0) === 0) {
      await supabase.from('leagues').delete().eq('id', league.id)
    }
  }

  revalidatePath(`/manager/${slug}`)
  revalidatePath(`/manager/${slug}/settings`)
}

// Deletes the whole chronicle. Cascades remove its links; any hub-only leagues
// left orphaned are swept here too.
export async function deleteChronicle(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '')
  if (!slug) return

  const { supabase, user, chronicle } = await ownedChronicle(slug)
  if (!chronicle || !user) return

  // Collect hub-only league ids linked solely to this chronicle before deleting.
  const { data: links } = await supabase
    .from('career_links')
    .select('league_id')
    .eq('chronicle_id', chronicle.id)
  const leagueIds = [...new Set((links ?? []).map((l) => l.league_id as string))]

  await supabase.from('career_chronicles').delete().eq('id', chronicle.id)

  // Sweep hub-only leagues that are now unreferenced.
  for (const lid of leagueIds) {
    const { data: lg } = await supabase.from('leagues').select('id, manager_view').eq('id', lid).maybeSingle()
    if (!lg?.manager_view) continue
    const { count } = await supabase
      .from('career_links')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', lid)
    if ((count ?? 0) === 0) await supabase.from('leagues').delete().eq('id', lid)
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
