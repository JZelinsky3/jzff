import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadManagerOptions } from '@/lib/managerOptions'
import type { ProfileRow } from '@/app/league/[slug]/setup/setup-list'
import { Wizard } from './wizard'

// The setup wizard. Brand-new archives get redirected here from
// dashboard/new/actions.ts so first-time users get a guided walk through
// sources → sync → members → rivalries → season → publish.
//
// Reachable manually any time from the "Run setup wizard" entry on
// /league/[slug]/setup. No mid-flow resume — every step is idempotent, and
// re-entering from scratch is cheaper than persisting partial state.
export default async function WelcomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, slug, owner_id, last_synced_at, published_at')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()

  // Owner-only — same gate as the other write surfaces. Editors can still
  // edit pieces via the regular setup pages; the wizard is a one-time
  // commissioner walk.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/league/${slug}/welcome`)
  if (league.owner_id !== user.id) redirect(`/league/${slug}`)

  const [
    { data: sourcesRaw },
    { data: latestSeason },
    { count: rivalryCount },
    { data: yahooTok },
    managers,
    { data: profileRows },
    { data: managerRows },
    { data: allSeasonRows },
  ] = await Promise.all([
    supabase
      .from('league_sources')
      .select('id, platform, external_id, label, last_synced_at')
      .eq('league_id', league.id)
      .order('created_at'),
    supabase
      .from('seasons')
      .select('id, year, is_live')
      .eq('league_id', league.id)
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('rivalries').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase.from('yahoo_tokens').select('user_id').eq('user_id', user.id).maybeSingle(),
    loadManagerOptions(supabase, league.id),
    supabase
      .from('manager_profiles')
      .select('id, canonical_name, is_alumni_override, is_hidden')
      .eq('league_id', league.id)
      .order('canonical_name'),
    supabase
      .from('managers')
      .select('id, profile_id, display_name, team_name, external_id, league_id')
      .eq('league_id', league.id),
    // All season rows — used both for the "auto_current" walk (same as
    // /setup/page.tsx) and to render the league-wide year range on the
    // sources card. Ordered desc so the first row with data is also the
    // newest season for the auto-current walk.
    supabase
      .from('seasons')
      .select('id, year')
      .eq('league_id', league.id)
      .order('year', { ascending: false }),
  ])

  const seasonYears = (allSeasonRows ?? []).map((r) => r.year as number).sort((a, b) => a - b)
  const yearRange = seasonYears.length === 0
    ? null
    : seasonYears[0] === seasonYears[seasonYears.length - 1]
    ? String(seasonYears[0])
    : `${seasonYears[0]}–${seasonYears[seasonYears.length - 1]}`

  // Stitch profiles + managers, mirroring /league/[slug]/setup/page.tsx so the
  // members step's profile rows have identical shape to the regular setup list.
  const profilesById = new Map<string, ProfileRow>()
  for (const p of profileRows ?? []) {
    profilesById.set(p.id, {
      id: p.id,
      canonical_name: p.canonical_name,
      is_alumni_override: p.is_alumni_override,
      is_hidden: p.is_hidden,
      auto_current: false,
      managers: [],
    })
  }
  let currentManagerIds = new Set<string>()
  // Walk at most 20 seasons looking for the newest one with manager_seasons
  // data. Matches the /setup page's auto-current-detection behavior.
  for (const sn of (allSeasonRows ?? []).slice(0, 20)) {
    const { data: ms } = await supabase
      .from('manager_seasons')
      .select('manager_id')
      .eq('season_id', sn.id)
    if (ms && ms.length > 0) {
      currentManagerIds = new Set(ms.map((r) => r.manager_id))
      break
    }
  }
  for (const m of managerRows ?? []) {
    if (!m.profile_id) continue
    const p = profilesById.get(m.profile_id)
    if (!p) continue
    p.managers.push({
      id: m.id,
      display_name: m.display_name,
      team_name: m.team_name,
      external_id: m.external_id,
    })
    if (currentManagerIds.has(m.id)) p.auto_current = true
  }
  const profiles = Array.from(profilesById.values())

  return (
    <Wizard
      leagueId={league.id}
      leagueName={league.name}
      slug={slug}
      initialSources={sourcesRaw ?? []}
      initialLastSyncedAt={league.last_synced_at}
      initialPublishedAt={league.published_at}
      latestSeason={latestSeason ? { id: latestSeason.id, year: latestSeason.year as number, isLive: !!latestSeason.is_live } : null}
      initialRivalryCount={rivalryCount ?? 0}
      yahooConnected={!!yahooTok}
      managers={managers.map((m) => ({ id: m.id, name: m.name }))}
      profiles={profiles}
      yearRange={yearRange}
    />
  )
}
