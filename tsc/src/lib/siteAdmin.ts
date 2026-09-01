// Site administrator + comp-grant helpers. All server-side — these read
// from the admin client so they work regardless of caller's RLS context.
//
// Two distinct ideas live here:
//   isSiteAdmin(userId)   → can this user see the /admin dashboard?
//   hasCompGrant(userId)  → does this user have a DB-backed comp record?
//
// The "comp" view callers (canCreateLeague, paywall checks) should use
// isCompUser() from lib/stripe.ts, which combines this DB grant with the
// env-based LIFETIME_USER_IDS allowlist.

import { createAdminClient } from '@/lib/supabase/admin'

export async function isSiteAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const db = createAdminClient()
  const { data, error } = await db
    .from('site_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return false
  return !!data
}

// A comp with an expires_at in the past no longer applies. The row stays as a
// record of what was granted; only its effect ends. Null expires_at means the
// grant is permanent, which is what every pre-0063 row is.
export async function hasCompGrant(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const db = createAdminClient()
  const { data, error } = await db
    .from('comp_grants')
    .select('user_id, expires_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return false
  return compIsActive(data as { expires_at?: string | null })
}

/** Shared by the admin table so its badges agree with what access actually is. */
export function compIsActive(grant: { expires_at?: string | null }): boolean {
  if (!grant.expires_at) return true
  const ends = new Date(grant.expires_at).getTime()
  return Number.isFinite(ends) && ends > Date.now()
}
