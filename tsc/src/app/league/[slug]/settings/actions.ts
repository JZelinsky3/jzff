'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { slugify } from '@/lib/slugify'

const Schema = z.object({
  leagueId: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  abbreviation: z.string().trim().max(16).optional(),
  slug: z.string().trim().max(60).optional(),
  prizePool: z.string().trim().max(60).optional(),
  draftScoringProfile: z.enum(['ppr_6pt', 'half_4pt', 'ppr_4pt', 'half_6pt']).optional(),
  // Set when the form is rendered as a chapter of the league hub's book.
  // The standalone page wants its post-save redirect; the book must stay
  // put, or saving a chapter silently navigates the reader out of it.
  inline: z.coerce.boolean().optional(),
})

type Result = { ok: true } | { ok: false; error: string }

export async function updateLeagueSettings(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = Schema.safeParse({
    leagueId: formData.get('leagueId'),
    name: formData.get('name') || undefined,
    abbreviation: formData.get('abbreviation') || undefined,
    slug: formData.get('slug') || undefined,
    prizePool: formData.get('prizePool') ?? undefined,
    draftScoringProfile: formData.get('draftScoringProfile') || undefined,
    inline: formData.get('inline') || undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data: league } = await supabase
    .from('leagues')
    .select('id, slug, owner_id')
    .eq('id', parsed.data.leagueId)
    .maybeSingle()
  if (!league) return { ok: false, error: 'League not found.' }
  if (league.owner_id !== user.id && !(await isSiteAdmin(user.id))) {
    return { ok: false, error: 'Only the owner can edit settings.' }
  }

  // Normalize requested slug; default to current if empty. If it changed,
  // check uniqueness before saving.
  const requestedSlug = parsed.data.slug ? slugify(parsed.data.slug) : league.slug
  if (!requestedSlug) return { ok: false, error: 'URL identifier cannot be empty.' }
  if (requestedSlug !== league.slug) {
    const { data: existing } = await supabase
      .from('leagues')
      .select('id')
      .eq('slug', requestedSlug)
      .maybeSingle()
    if (existing && existing.id !== league.id) {
      return { ok: false, error: `"${requestedSlug}" is already used by another league.` }
    }
  }

  const updatePayload: Record<string, unknown> = {
    abbreviation: parsed.data.abbreviation || null,
    slug: requestedSlug,
  }
  if (parsed.data.name) updatePayload.name = parsed.data.name
  // prizePool: '' means clear; undefined means don't touch
  if (parsed.data.prizePool !== undefined) {
    updatePayload.prize_pool = parsed.data.prizePool || null
  }
  if (parsed.data.draftScoringProfile) {
    updatePayload.draft_scoring_profile = parsed.data.draftScoringProfile
  }
  const { error } = await supabase
    .from('leagues')
    .update(updatePayload)
    .eq('id', league.id)
  if (error) return { ok: false, error: error.message }

  revalidateTag(`league-${league.id}`, 'max')
  // Old slug path may have been cached at the routing layer; revalidate both.
  revalidatePath(`/league/${league.slug}`)
  revalidatePath(`/league/${requestedSlug}`)
  revalidatePath(`/leagues/${league.slug}`, 'layout')
  revalidatePath(`/leagues/${requestedSlug}`, 'layout')

  if (parsed.data.inline) {
    // Renaming the slug moves the hub itself, so the reader has to follow
    // it; otherwise stay on the page so the open chapter survives the save.
    if (requestedSlug !== league.slug) redirect(`/league/${requestedSlug}`)
    return { ok: true }
  }
  redirect(`/league/${requestedSlug}/settings?saved=1`)
}
