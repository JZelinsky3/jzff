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

export async function grantComp(userId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireSiteAdmin()
  if ('error' in guard) return { ok: false, error: guard.error }
  if (!userId) return { ok: false, error: 'Missing userId.' }

  const db = createAdminClient()
  const { error } = await db.from('comp_grants').upsert(
    { user_id: userId, granted_by: guard.userId, note: note ?? null },
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
