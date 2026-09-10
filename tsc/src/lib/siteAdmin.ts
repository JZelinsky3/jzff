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

// When does this user's comp run out? Null for "no active comp" AND for a
// permanent one, so callers must not read null as "expired" — pair it with
// isCompUser()/hasCompGrant() to tell the two apart.
//
// This exists because every surface that mentions a comp used to say
// "unlimited access, no expiration", which stopped being true the moment
// migration 0063 added expires_at. Someone on a 3-month comp was being told
// in three separate places that it would never end, and would then have
// found out by watching their leagues lock. A granted comp is silent enough
// already (nothing emails the user), so the least it can do is state its own
// end date wherever it is shown.
export async function compExpiresAt(userId: string | null | undefined): Promise<Date | null> {
  if (!userId) return null
  const db = createAdminClient()
  const { data, error } = await db
    .from('comp_grants')
    .select('expires_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.expires_at) return null
  const grant = data as { expires_at: string }
  if (!compIsActive(grant)) return null
  const ends = new Date(grant.expires_at)
  return Number.isFinite(ends.getTime()) ? ends : null
}

/** "December 10" in ET, or null when there is nothing to state. */
export async function compExpiryLabel(userId: string | null | undefined): Promise<string | null> {
  const ends = await compExpiresAt(userId)
  if (!ends) return null
  return ends.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })
}
