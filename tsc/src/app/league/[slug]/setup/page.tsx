import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteFooter } from '@/components/SiteFooter'
import { MobileMembers } from '@/components/league/MobileMembers'
import { getViewMode } from '@/lib/viewMode'
import { SetupList, type ProfileRow } from './setup-list'
import { MarkReviewedButton } from './mark-reviewed-button'

export default async function SetupPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, settings')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()
  const reviewedAt = (((league.settings ?? {}) as { members_reviewed_at?: string })
    .members_reviewed_at) ?? null

  // Fetch profiles + the platform managers linked to each.
  const [{ data: profiles }, { data: managers }] = await Promise.all([
    supabase
      .from('manager_profiles')
      .select('id, canonical_name, is_alumni_override, is_hidden')
      .eq('league_id', league.id)
      .order('canonical_name'),
    supabase
      .from('managers')
      .select('id, profile_id, display_name, team_name, external_id, league_id')
      .eq('league_id', league.id),
  ])

  // Determine "current" set: managers who appear in the latest season with manager_seasons data.
  // We compute this here (server) so the UI can render an "Auto: current/alumni" badge per profile.
  const { data: latestSeasonRow } = await supabase
    .from('seasons')
    .select('id, year')
    .eq('league_id', league.id)
    .order('year', { ascending: false })
    .limit(20) // walk back at most 20 seasons looking for one with data
  let currentManagerIds = new Set<string>()
  if (latestSeasonRow && latestSeasonRow.length > 0) {
    for (const sn of latestSeasonRow) {
      const { data: ms } = await supabase
        .from('manager_seasons')
        .select('manager_id')
        .eq('season_id', sn.id)
        .limit(1)
      if (ms && ms.length > 0) {
        const { data: allMs } = await supabase
          .from('manager_seasons')
          .select('manager_id')
          .eq('season_id', sn.id)
        currentManagerIds = new Set((allMs ?? []).map((r) => r.manager_id))
        break
      }
    }
  }

  // Stitch: profile → managers, plus auto-current flag derived from any linked manager
  // appearing in the latest-with-data season.
  const profilesById = new Map<string, ProfileRow>()
  for (const p of profiles ?? []) {
    profilesById.set(p.id, {
      id: p.id,
      canonical_name: p.canonical_name,
      is_alumni_override: p.is_alumni_override,
      is_hidden: p.is_hidden,
      auto_current: false,
      managers: [],
    })
  }
  for (const m of managers ?? []) {
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

  const profilesList = Array.from(profilesById.values())

  if ((await getViewMode()) === 'mobile') {
    return (
      <MobileMembers
        leagueId={league.id}
        slug={slug}
        profiles={profilesList}
        reviewedAt={reviewedAt}
      />
    )
  }

  const words = league.name.trim().split(/\s+/)
  const head = words.slice(0, -1).join(' ')
  const tail = words[words.length - 1] ?? ''

  return (
    <main>
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Chapter VI · League Members ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}>
          The <em>Members.</em>
        </h1>
        <p className="hero-sub">
          Every person who&apos;s ever been in the league. Merge cross-platform identities
          (same human, two accounts), hide test/throwaway managers, mark alumni overrides,
          or delete entirely.
        </p>
        <div className="hero-meta">
          {head} {tail && <em>{tail}.</em>} · {profilesList.length} {profilesList.length === 1 ? 'person' : 'people'}
        </div>
        {/* Re-run the guided setup. New archives auto-land in the wizard;
            existing archives can return any time from here. */}
        <div style={{ marginTop: '1.75rem' }}>
          <Link href={`/league/${slug}/welcome`} className="dc-btn-ghost">
            Run setup wizard
          </Link>
        </div>
      </section>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · The roster</span>
          <span className="section-title">Everyone on file —</span>
          <span className="section-meta">Select 2+ → Merge</span>
        </div>
        {/* Confirm sits above the table — on long rosters the button was
            below the fold and people never found it. */}
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <MarkReviewedButton leagueId={league.id} reviewedAt={reviewedAt} />
        </div>
        <SetupList leagueId={league.id} slug={slug} profiles={profilesList} />
      </div>

      <SiteFooter />
    </main>
  )
}
