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
  const currentCount = profilesList.filter((p) =>
    !(p.is_alumni_override === true || (p.is_alumni_override === null && !p.auto_current))
  ).length
  const alumniCount = profilesList.length - currentCount

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

  return (
    <main className="lo-page lo-page--members">
      <section className="lo-hero">
        <div className="lo-hero-kicker">Chapter II</div>
        <h1 className="lo-hero-title">The <em>Members.</em></h1>
        <p className="lo-hero-standfirst">
          Every person who&apos;s ever been in the league. Merge cross-platform
          identities, hide test or throwaway accounts, mark alumni overrides,
          or delete entirely.
        </p>
        <div className="lo-hero-dateline">
          <span><strong>{profilesList.length}</strong> total</span>
          <span className="sep">·</span>
          <span><strong>{currentCount}</strong> current</span>
          <span className="sep">·</span>
          <span><strong>{alumniCount}</strong> alumni</span>
        </div>
        <div className="lo-hero-rules" aria-hidden />
      </section>

      <div className="lo-band">
        <div className="lo-note-grid" style={{ marginBottom: '1.6rem' }}>
          <div className="lo-note">
            <div className="lo-note-head"><span className="pin">✦</span> Merge duplicates</div>
            <div className="lo-note-body">
              Same human, two accounts: a Sleeper login and a leftover NFL.com
              one, say. Select both, click <strong>Merge</strong>, and pick which
              name survives. Stats roll up under the keeper automatically.
            </div>
          </div>
          <div className="lo-note steel">
            <div className="lo-note-head"><span className="pin">✦</span> Hide vs. delete</div>
            <div className="lo-note-body">
              <strong>Hide</strong> keeps someone off the public almanac without
              touching their stats, reversible any time. <strong>Delete</strong>{' '}
              permanently wipes their history. Use hide unless you&apos;re certain.
            </div>
          </div>
        </div>

        <div className="lo-folio">
          <span className="lo-folio-no">01</span>
          <span className="lo-folio-title">Everyone on file</span>
          <span className="lo-folio-meta">Select 2+ to merge</span>
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
