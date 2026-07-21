import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { loadManagerOptions, loadManagerNameMap } from '@/lib/managerOptions'
import { getViewMode } from '@/lib/viewMode'
import type { ProfileRow } from '@/app/league/[slug]/setup/setup-list'
import { MobileWizard } from '@/components/league/MobileWizard'
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
  // commissioner walk. Site admins pass so they can run it while assisting.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/league/${slug}/welcome`)
  if (league.owner_id !== user.id && !(await isSiteAdmin(user.id))) redirect(`/league/${slug}`)

  const [
    { data: sourcesRaw },
    { data: latestSeason },
    { data: existingRivalries },
    { data: yahooTok },
    managers,
    nameMap,
    { data: profileRows },
    { data: managerRows },
    { data: allSeasonRows },
  ] = await Promise.all([
    supabase
      .from('league_sources')
      .select('id, platform, external_id, label, last_synced_at, walk_history, settings')
      .eq('league_id', league.id)
      .order('created_at'),
    supabase
      .from('seasons')
      .select('id, year, is_live')
      .eq('league_id', league.id)
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('rivalries')
      .select('id, name, manager_a_id, manager_b_id, created_at')
      .eq('league_id', league.id)
      .order('created_at'),
    supabase.from('yahoo_tokens').select('user_id').eq('user_id', user.id).maybeSingle(),
    loadManagerOptions(supabase, league.id),
    // Resolves stored manager.id → canonical profile name (post-merge) so
    // existing rivalries display the same names you'd see on the public site.
    loadManagerNameMap(supabase, league.id),
    supabase
      .from('manager_profiles')
      .select('id, canonical_name, is_alumni_override, is_hidden')
      .eq('league_id', league.id)
      .order('canonical_name'),
    supabase
      .from('managers')
      .select('id, profile_id, display_name, team_name, external_id, league_id, avatar_url, created_at')
      .eq('league_id', league.id)
      // Newest first per profile — when we pick the first non-null avatar
      // below, this preference order makes us favor recent avatars over old
      // platform avatars that may have changed/disappeared.
      .order('created_at', { ascending: false }),
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
  // Per-profile avatar: pick the first non-null among that profile's
  // managers (manager rows arrive newest-first, so this favors recent
  // platforms). Wizard-only display; the regular /setup page is untouched.
  const avatarByProfile = new Map<string, string>()
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
    if (m.avatar_url && !avatarByProfile.has(m.profile_id)) {
      avatarByProfile.set(m.profile_id, m.avatar_url)
    }
  }
  const profiles = Array.from(profilesById.values())
  const avatarMap: Record<string, string> = Object.fromEntries(avatarByProfile)

  // Same credential scrub as /league/[slug]/sources/page.tsx — ESPN cookies
  // never cross into the client. The wizard's sources step renders the real
  // SourceRow editor (so the source attached at creation is fully editable
  // here, not just listed), which needs `settings`/`walk_history` to avoid
  // clobbering real config with blank defaults on save.
  type RawSource = NonNullable<typeof sourcesRaw>[number]
  const scrubbedSources = (sourcesRaw ?? []).map((s: RawSource) => {
    const settings = (s.settings ?? {}) as Record<string, unknown>
    if (s.platform !== 'espn') return { ...s, hasCookies: false }
    const hasCookies = Boolean(settings.swid && settings.espn_s2)
    const safe: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(settings)) {
      if (k !== 'swid' && k !== 'espn_s2') safe[k] = v
    }
    return { ...s, settings: safe, hasCookies }
  })

  const wizardProps = {
    leagueId: league.id,
    leagueName: league.name,
    slug,
    initialSources: scrubbedSources,
    initialLastSyncedAt: league.last_synced_at,
    initialPublishedAt: league.published_at,
    latestSeason: latestSeason ? { id: latestSeason.id, year: latestSeason.year as number, isLive: !!latestSeason.is_live } : null,
    existingRivalries: (existingRivalries ?? []).map((r) => ({
      id: r.id,
      name: r.name as string | null,
      aId: r.manager_a_id as string,
      bId: r.manager_b_id as string,
      aName: nameMap.get(r.manager_a_id as string) ?? 'Unknown',
      bName: nameMap.get(r.manager_b_id as string) ?? 'Unknown',
    })),
    yahooConnected: !!yahooTok,
    managers: managers.map((m) => ({ id: m.id, name: m.name })),
    profiles,
    avatars: avatarMap,
    yearRange,
  }

  if ((await getViewMode()) === 'mobile') {
    return <MobileWizard {...wizardProps} />
  }

  return (
    <Wizard
      leagueId={league.id}
      leagueName={league.name}
      slug={slug}
      initialSources={scrubbedSources}
      initialLastSyncedAt={league.last_synced_at}
      initialPublishedAt={league.published_at}
      latestSeason={latestSeason ? { id: latestSeason.id, year: latestSeason.year as number, isLive: !!latestSeason.is_live } : null}
      existingRivalries={(existingRivalries ?? []).map((r) => ({
        id: r.id,
        name: r.name as string | null,
        aId: r.manager_a_id as string,
        bId: r.manager_b_id as string,
        aName: nameMap.get(r.manager_a_id as string) ?? 'Unknown',
        bName: nameMap.get(r.manager_b_id as string) ?? 'Unknown',
      }))}
      yahooConnected={!!yahooTok}
      managers={managers.map((m) => ({ id: m.id, name: m.name }))}
      profiles={profiles}
      avatars={avatarMap}
      yearRange={yearRange}
    />
  )
}
