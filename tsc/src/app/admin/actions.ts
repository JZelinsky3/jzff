'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'

// Guard every action: bail unless the caller is a site admin.
async function requireSiteAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  if (!(await isSiteAdmin(user.id))) return { error: 'Forbidden.' }
  return { userId: user.id }
}

/**
 * Comps a user. `months` makes it temporary: full access now, back to their
 * own plan when it lapses, with no cleanup to remember. Omit for a permanent
 * comp, which is what every grant was before 0063.
 */
export async function grantComp(userId: string, note?: string, months?: number): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireSiteAdmin()
  if ('error' in guard) return { ok: false, error: guard.error }
  if (!userId) return { ok: false, error: 'Missing userId.' }

  let expiresAt: string | null = null
  if (months != null) {
    if (!Number.isFinite(months) || months <= 0 || months > 60) {
      return { ok: false, error: 'Comp length must be between 1 and 60 months.' }
    }
    const ends = new Date()
    ends.setMonth(ends.getMonth() + Math.trunc(months))
    expiresAt = ends.toISOString()
  }

  const db = createAdminClient()
  const { error } = await db.from('comp_grants').upsert(
    { user_id: userId, granted_by: guard.userId, note: note ?? null, expires_at: expiresAt },
    { onConflict: 'user_id' },
  )
  if (error) return { ok: false, error: error.message }

  // Clearing any pending grace period the user might have from a lapsed
  // subscription keeps the new comp consistent — same shape Stripe webhooks
  // use when a sub becomes active again.
  await db
    .from('leagues')
    .update({ grace_period_ends_at: null })
    .eq('owner_id', userId)
    .not('grace_period_ends_at', 'is', null)

  revalidatePath('/admin')
  return { ok: true }
}

export async function revokeComp(userId: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireSiteAdmin()
  if ('error' in guard) return { ok: false, error: guard.error }
  if (!userId) return { ok: false, error: 'Missing userId.' }

  const db = createAdminClient()
  const { error } = await db.from('comp_grants').delete().eq('user_id', userId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin')
  return { ok: true }
}
