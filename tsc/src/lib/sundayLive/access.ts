// Sunday Live access gate.
//
// Sunday Live is a paid feature — UDFA leagues see the locked screen. We
// resolve the league row + tier here so the page route can early-out before
// doing any platform work.
//
// SUNDAY_LIVE_ENABLED is the master switch, and it reads the way it looks:
//   false -> nobody but site admins can reach Sunday Live (current state)
//   true  -> open to the normal tier rules below
//
// It exists because the tier check alone does NOT hold this feature back.
// Nearly every owner's first league occupies their free trial slot, which
// resolves to 'test' and bypasses the UDFA lock, so on tier rules alone
// Sunday Live was reachable by 59 of 63 leagues. Site admins keep access so
// the feature can still be worked on while it is switched off.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { resolveLeagueTier } from '@/lib/leagueTier'
import { isSiteAdmin } from '@/lib/siteAdmin'

const SUNDAY_LIVE_ENABLED = false

export type SlMeta = { slug: string; name: string; platform: 'sleeper' | 'espn' | 'yahoo' | 'nfl' }
export type SlAccess =
  | { ok: false }
  | { ok: true; locked: true; meta: SlMeta }
  | { ok: true; locked: false; meta: SlMeta; leagueId: string; ownerId: string | null }

export async function getSlAccess(slug: string): Promise<SlAccess> {
  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, name, platform, owner_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) return { ok: false }
  const meta: SlMeta = {
    slug,
    name: league.name as string,
    platform: league.platform as SlMeta['platform'],
  }
  if (!SUNDAY_LIVE_ENABLED) {
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!(await isSiteAdmin(user?.id))) return { ok: true, locked: true, meta }
  }

  const tier = await resolveLeagueTier(league.id as string, (league.owner_id as string | null) ?? null)
  if (tier === 'udfa') return { ok: true, locked: true, meta }
  return {
    ok: true,
    locked: false,
    meta,
    leagueId: league.id as string,
    ownerId: (league.owner_id as string | null) ?? null,
  }
}

// Lightweight metadata-only loader for layout.tsx (no tier check). Returns null
// if the league doesn't exist.
export async function loadSlMeta(slug: string): Promise<SlMeta | null> {
  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('name, platform')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) return null
  return { slug, name: league.name as string, platform: league.platform as SlMeta['platform'] }
}
