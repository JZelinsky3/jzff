'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { devCacheBust } from '@/lib/devCache'

type Result = { ok: false; error: string } | { ok: true }

function bustExportCache(leagueId: string): void {
  revalidateTag(`league-${leagueId}`, 'max')
  devCacheBust(leagueId)
}

// Stamp the commissioner's "I've looked at the roster" signal on the
// league. Merged into the existing settings JSONB to avoid a schema
// migration. Used by the hub onboarding checklist so the "Review members"
// step only ticks after an actual edit (or the explicit Mark-Reviewed
// button) — not just because the sync created manager rows.
async function stampMembersReviewed(leagueId: string): Promise<void> {
  const db = createAdminClient()
  const { data: row } = await db
    .from('leagues')
    .select('settings')
    .eq('id', leagueId)
    .maybeSingle()
  const settings = (row?.settings ?? {}) as Record<string, unknown>
  if (settings.members_reviewed_at) return
  settings.members_reviewed_at = new Date().toISOString()
  await db.from('leagues').update({ settings }).eq('id', leagueId)
}

export async function markMembersReviewed(leagueId: string): Promise<Result> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access
  await stampMembersReviewed(leagueId)
  bustExportCache(leagueId)
  revalidatePath(`/league/${access.slug}`)
  revalidatePath(`/league/${access.slug}/setup`)
  return { ok: true }
}

async function assertWriteAccess(leagueId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in.' }
  const { data: league } = await supabase
    .from('leagues')
    .select('id, owner_id, slug')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league) return { ok: false as const, error: 'League not found.' }
  if (league.owner_id !== user.id) {
    const { data: member } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member || !['owner', 'editor'].includes(member.role)) {
      return { ok: false as const, error: 'No write access.' }
    }
  }
  return { ok: true as const, slug: league.slug }
}

const RenameSchema = z.object({
  profileId: z.string().uuid(),
  leagueId: z.string().uuid(),
  canonicalName: z.string().trim().min(1).max(80),
})

export async function renameProfile(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = RenameSchema.safeParse({
    profileId: formData.get('profileId'),
    leagueId: formData.get('leagueId'),
    canonicalName: formData.get('canonicalName'),
  })
  if (!parsed.success) return { ok: false, error: 'Invalid input.' }
  const access = await assertWriteAccess(parsed.data.leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  const { error } = await db
    .from('manager_profiles')
    .update({ canonical_name: parsed.data.canonicalName })
    .eq('id', parsed.data.profileId)
    .eq('league_id', parsed.data.leagueId)
  if (error) return { ok: false, error: error.message }

  await stampMembersReviewed(parsed.data.leagueId)
  bustExportCache(parsed.data.leagueId)
  revalidatePath(`/league/${access.slug}`)
  revalidatePath(`/league/${access.slug}/setup`)
  return { ok: true }
}

// Alumni override: null = auto-detect from latest-season participation,
// true = explicitly alumni, false = explicitly current.
export async function setAlumniOverride(
  profileId: string,
  leagueId: string,
  value: boolean | null
): Promise<Result> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  const { error } = await db
    .from('manager_profiles')
    .update({ is_alumni_override: value })
    .eq('id', profileId)
    .eq('league_id', leagueId)
  if (error) return { ok: false, error: error.message }

  await stampMembersReviewed(leagueId)
  bustExportCache(leagueId)
  revalidatePath(`/league/${access.slug}`)
  revalidatePath(`/league/${access.slug}/setup`)
  return { ok: true }
}

export async function setHidden(profileId: string, leagueId: string, hidden: boolean): Promise<Result> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  const { error } = await db
    .from('manager_profiles')
    .update({ is_hidden: hidden })
    .eq('id', profileId)
    .eq('league_id', leagueId)
  if (error) return { ok: false, error: error.message }

  await stampMembersReviewed(leagueId)
  bustExportCache(leagueId)
  revalidatePath(`/league/${access.slug}`)
  revalidatePath(`/league/${access.slug}/setup`)
  return { ok: true }
}

// Merge: take N profile IDs, repoint all their managers to the first one,
// then delete the rest. The canonical_name from the first profile is kept
// (commish can rename after).
const MergeSchema = z.object({
  leagueId: z.string().uuid(),
  profileIds: z.array(z.string().uuid()).min(2),
  keepId: z.string().uuid(),
})

export async function mergeProfiles(input: z.infer<typeof MergeSchema>): Promise<Result> {
  const parsed = MergeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Pick at least 2 profiles to merge.' }
  const { leagueId, profileIds, keepId } = parsed.data
  if (!profileIds.includes(keepId)) return { ok: false, error: 'Keeper not in selection.' }

  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  const dropIds = profileIds.filter((id) => id !== keepId)

  // Repoint all managers from the dropped profiles to the keeper.
  const { error: updErr } = await db
    .from('managers')
    .update({ profile_id: keepId })
    .in('profile_id', dropIds)
    .eq('league_id', leagueId)
  if (updErr) return { ok: false, error: updErr.message }

  // Delete the now-empty profiles.
  const { error: delErr } = await db
    .from('manager_profiles')
    .delete()
    .in('id', dropIds)
    .eq('league_id', leagueId)
  if (delErr) return { ok: false, error: delErr.message }

  await stampMembersReviewed(parsed.data.leagueId)
  bustExportCache(parsed.data.leagueId)
  revalidatePath(`/league/${access.slug}`)
  revalidatePath(`/league/${access.slug}/setup`)
  return { ok: true }
}

// Hard-delete one or more profiles AND every underlying platform manager row.
// Cascades through manager_seasons, matchups, rivalries via FK; nulls out the
// references on seasons (champion/runner-up/regular-season-winner) and on
// draft_picks. Use Hide for soft-remove; this one is for true throwaways.
const DeleteProfilesSchema = z.object({
  leagueId: z.string().uuid(),
  profileIds: z.array(z.string().uuid()).min(1),
})

export async function deleteProfiles(input: z.infer<typeof DeleteProfilesSchema>): Promise<Result> {
  const parsed = DeleteProfilesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Pick at least one profile to delete.' }
  const { leagueId, profileIds } = parsed.data

  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()

  // First: drop the platform managers attached to these profiles. The FK from
  // managers → manager_seasons / matchups / rivalries cascades.
  const { error: mgrErr } = await db
    .from('managers')
    .delete()
    .in('profile_id', profileIds)
    .eq('league_id', leagueId)
  if (mgrErr) return { ok: false, error: `Delete managers: ${mgrErr.message}` }

  // Second: drop the now-empty profile rows.
  const { error: profErr } = await db
    .from('manager_profiles')
    .delete()
    .in('id', profileIds)
    .eq('league_id', leagueId)
  if (profErr) return { ok: false, error: `Delete profiles: ${profErr.message}` }

  await stampMembersReviewed(leagueId)
  bustExportCache(leagueId)
  revalidatePath(`/league/${access.slug}`)
  revalidatePath(`/league/${access.slug}/setup`)
  return { ok: true }
}

export async function publishLeague(leagueId: string): Promise<Result> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  const { error } = await db
    .from('leagues')
    .update({ published_at: new Date().toISOString() })
    .eq('id', leagueId)
  if (error) return { ok: false, error: error.message }

  bustExportCache(leagueId)
  revalidatePath(`/league/${access.slug}`)
  revalidatePath(`/league/${access.slug}/setup`)
  revalidatePath(`/leagues/${access.slug}`, 'layout')
  return { ok: true }
}

export async function unpublishLeague(leagueId: string): Promise<Result> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const db = createAdminClient()
  const { error } = await db
    .from('leagues')
    .update({ published_at: null })
    .eq('id', leagueId)
  if (error) return { ok: false, error: error.message }

  bustExportCache(leagueId)
  revalidatePath(`/league/${access.slug}`)
  revalidatePath(`/league/${access.slug}/setup`)
  revalidatePath(`/leagues/${access.slug}`, 'layout')
  return { ok: true }
}
