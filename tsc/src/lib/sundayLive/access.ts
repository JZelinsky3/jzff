// Sunday Live access gate.
//
// Sunday Live is a paid feature — UDFA leagues see the locked screen. We
// resolve the league row + tier here so the page route can early-out before
// doing any platform work.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveLeagueTier } from '@/lib/leagueTier'

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
