// Which wheels a given visitor is offered.
//
// Everyone gets the site-wide pool. A signed-in reader also gets a pool per
// league they have a stake in — the ones they run, plus the ones they've
// bookmarked — because landing on your own league-mate's 2019 team is the
// entire joke, and a stranger's isn't.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const SITE_POOL = { id: 'site', label: 'The Whole Site' }

export type GamePool = {
  id: string
  label: string
  /** Why this pool is on the list — shown on the hub cards. */
  note: string
}

export async function loadPoolsForViewer(): Promise<{ signedIn: boolean; leaguePools: GamePool[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { signedIn: false, leaguePools: [] }

  const [{ data: owned }, { data: bookmarkRows }] = await Promise.all([
    supabase
      .from('leagues')
      .select('id, name, slug, published_at')
      .eq('owner_id', user.id)
      .eq('manager_view', false)
      .order('created_at', { ascending: false }),
    supabase.from('league_bookmarks').select('league_id').eq('user_id', user.id),
  ])

  const pools: GamePool[] = []
  const seen = new Set<string>()
  for (const l of owned ?? []) {
    if (seen.has(l.slug)) continue
    seen.add(l.slug)
    pools.push({
      id: l.slug,
      label: l.name,
      note: l.published_at ? 'Your league' : 'Your league · unpublished, only you can play it',
    })
  }

  // Bookmarked leagues belong to other people, so RLS won't let this user
  // SELECT them directly — resolve the ids they're allowed to hold through
  // the admin client, own-scoped by the bookmark list we just read.
  const bookmarkIds = (bookmarkRows ?? []).map((b) => b.league_id as string)
  if (bookmarkIds.length > 0) {
    const db = createAdminClient()
    const { data: followed } = await db
      .from('leagues')
      .select('name, slug, published_at')
      .in('id', bookmarkIds)
      .eq('manager_view', false)
      .not('published_at', 'is', null)
    for (const l of followed ?? []) {
      if (seen.has(l.slug as string)) continue
      seen.add(l.slug as string)
      pools.push({ id: l.slug as string, label: l.name as string, note: 'A league you follow' })
    }
  }

  return { signedIn: true, leaguePools: pools }
}
