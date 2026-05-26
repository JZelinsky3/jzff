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

export async function hasCompGrant(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const db = createAdminClient()
  const { data, error } = await db
    .from('comp_grants')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return false
  return !!data
}
