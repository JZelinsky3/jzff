import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
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
    draft_scoring_profile: 'ppr_6pt' | 'half_4pt' | 'ppr_4pt' | 'half_6pt'
  }
  let league: LeagueRow | null = null
  const withScoring = await supabase
    .from('leagues')
    .select('id, name, slug, abbreviation, prize_pool, draft_scoring_profile')
    .eq('slug', slug)
    .maybeSingle<LeagueRow>()
  if (withScoring.data) {
    league = withScoring.data
  } else {
    const withPrize = await supabase
      .from('leagues')
      .select('id, name, slug, abbreviation, prize_pool')
      .eq('slug', slug)
      .maybeSingle()
    if (withPrize.data) {
      league = { ...withPrize.data, draft_scoring_profile: 'ppr_6pt' }
    } else {
      // Pre-migration fallback (pre-prize-pool).
      const bare = await supabase
        .from('leagues')
        .select('id, name, slug, abbreviation')
        .eq('slug', slug)
        .maybeSingle()
      if (bare.data) league = { ...bare.data, prize_pool: null, draft_scoring_profile: 'ppr_6pt' }
    }
  }
  if (!league) notFound()

  return (
    <main>
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '2rem' }}>
        <div className="hero-sup">★ Settings ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}>
          The <em>knobs.</em>
        </h1>
        <p className="hero-sub">Tweak how your league appears on the public almanac.</p>
      </section>

      <div className="section" style={{ maxWidth: 560 }}>
        <SettingsForm
          leagueId={league.id}
          leagueName={league.name}
          currentSlug={league.slug}
          currentAbbreviation={league.abbreviation}
          currentPrizePool={league.prize_pool}
          currentDraftScoringProfile={league.draft_scoring_profile}
          savedJustNow={sp.saved === '1'}
        />
      </div>

      <SiteFooter />
    </main>
  )
}
