import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { MobileSettings } from '@/components/league/MobileSettings'
import { getViewMode } from '@/lib/viewMode'
import { SettingsForm } from './settings-form'

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ saved?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const supabase = await createClient()

  type LeagueRow = {
    id: string
    name: string
    slug: string
    abbreviation: string | null
    prize_pool: string | null
    draft_scoring_profile: 'ppr_6pt' | 'half_4pt' | 'ppr_4pt' | 'half_6pt' | 'std_4pt' | 'std_6pt'
    superflex: boolean
  }
  let league: LeagueRow | null = null
  const withSuperflex = await supabase
    .from('leagues')
    .select('id, name, slug, abbreviation, prize_pool, draft_scoring_profile, superflex')
    .eq('slug', slug)
    .maybeSingle<LeagueRow>()
  if (withSuperflex.data) {
    league = withSuperflex.data
  } else {
    const withScoring = await supabase
      .from('leagues')
      .select('id, name, slug, abbreviation, prize_pool, draft_scoring_profile')
      .eq('slug', slug)
      .maybeSingle()
    if (withScoring.data) {
      league = { ...withScoring.data, superflex: false }
    } else {
      const withPrize = await supabase
        .from('leagues')
        .select('id, name, slug, abbreviation, prize_pool')
        .eq('slug', slug)
        .maybeSingle()
      if (withPrize.data) {
        league = { ...withPrize.data, draft_scoring_profile: 'ppr_6pt', superflex: false }
      } else {
        // Pre-migration fallback (pre-prize-pool).
        const bare = await supabase
          .from('leagues')
          .select('id, name, slug, abbreviation')
          .eq('slug', slug)
          .maybeSingle()
        if (bare.data) league = { ...bare.data, prize_pool: null, draft_scoring_profile: 'ppr_6pt', superflex: false }
      }
    }
  }
  if (!league) notFound()

  if ((await getViewMode()) === 'mobile') {
    return (
      <MobileSettings
        leagueId={league.id}
        leagueName={league.name}
        currentSlug={league.slug}
        currentAbbreviation={league.abbreviation}
        currentPrizePool={league.prize_pool}
        currentDraftScoringProfile={league.draft_scoring_profile}
        currentSuperflex={league.superflex}
        savedJustNow={sp.saved === '1'}
      />
    )
  }

  return (
    <main className="lo-page lo-page--settings">
      <section className="lo-hero">
        <div className="lo-hero-kicker">Chapter V</div>
        <h1 className="lo-hero-title">The <em>Settings.</em></h1>
        <p className="lo-hero-standfirst">
          Name, abbreviation, public URL, prize pool, draft scoring. How the
          almanac presents itself to everyone else in the league.
        </p>
        <div className="lo-hero-rules" aria-hidden />
      </section>

      <div className="lo-band" style={{ maxWidth: 980 }}>
        <div className="lo-note" style={{ marginBottom: '1.6rem' }}>
          <div className="lo-note-head"><span className="pin">✦</span> Changing the URL</div>
          <div className="lo-note-body">
            Old links to <code>/leagues/{league.slug}/</code> stop working the
            moment you save a new one. Share the new link with your league
            after you change it.
          </div>
        </div>
        <div className="lo-form-card">
          <SettingsForm
            leagueId={league.id}
            leagueName={league.name}
            currentSlug={league.slug}
            currentAbbreviation={league.abbreviation}
            currentPrizePool={league.prize_pool}
            currentDraftScoringProfile={league.draft_scoring_profile}
            currentSuperflex={league.superflex}
            savedJustNow={sp.saved === '1'}
          />
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
