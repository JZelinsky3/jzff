import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'

// Owner-only gate for the presentation builder + presenter routes. The
// parent league layout already enforces login + league existence; this adds
// the extra check that the caller is the league's owner (or a site admin
// assisting). Non-owners get redirected to the league hub (so the page
// never flickers into view).
export async function requireLeagueOwner(slug: string): Promise<{
  leagueId: string
  leagueName: string
  slug: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, slug, owner_id')
    .eq('slug', slug)
    .maybeSingle()

  if (!league) notFound()
  if (league.owner_id !== user.id && !(await isSiteAdmin(user.id))) redirect(`/league/${slug}`)

  return { leagueId: league.id, leagueName: league.name, slug: league.slug }
}
