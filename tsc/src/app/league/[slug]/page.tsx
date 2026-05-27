import Link from 'next/link'
import { notFound } from 'next/navigation'
import { OnboardingChecklist, type OnboardingStep } from '@/components/OnboardingChecklist'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { SyncButton } from './sync-button'
import { GradeTradesButton } from './grade-trades-button'
import { PublishButton } from './setup/publish-button'

export default async function LeagueOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, last_synced_at, published_at, owner_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()

  const { data: { user: viewer } } = await supabase.auth.getUser()
  const isOwner = !!viewer && league.owner_id === viewer.id

  const [
    { count: seasonCount },
    { count: managerCount },
    { count: matchupCount },
    { count: rivalryCount },
    { count: sourceCount },
  ] = await Promise.all([
    supabase.from('seasons').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase.from('managers').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase
      .from('matchups')
      .select('id, season:seasons!inner(league_id)', { count: 'exact', head: true })
      .eq('season.league_id', league.id),
    supabase.from('rivalries').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase.from('league_sources').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
  ])

  const words = league.name.trim().split(/\s+/)
  const head = words.slice(0, -1).join(' ')
  const tail = words[words.length - 1] ?? ''

  const hasSources = (sourceCount ?? 0) > 0
  const hasSynced = !!league.last_synced_at
  const hasMembers = (managerCount ?? 0) > 0
  const hasRivalries = (rivalryCount ?? 0) > 0
  const hasPublished = !!league.published_at

  const leagueOnboardingSteps: OnboardingStep[] = [
    {
      label: 'Connect a source',
      description: 'Sleeper, ESPN, or NFL.com — each source walks its own history.',
      done: hasSources,
      href: `/league/${slug}/sources`,
      cta: 'Add source →',
    },
    {
      label: 'Sync the league',
      description: 'Pulls every season, draft, and matchup your sources can reach.',
      done: hasSynced,
    },
    {
      label: 'Review members',
      description: 'Merge cross-platform identities, hide throwaways, set alumni.',
      done: hasMembers,
      href: `/league/${slug}/setup`,
      cta: 'Review →',
    },
    {
      label: 'Curate rivalries',
      description: 'Hand-pick the feuds that get their own page in the almanac.',
      done: hasRivalries,
      href: `/league/${slug}/rivalries`,
      cta: 'Pick rivals →',
    },
    {
      label: 'Publish the almanac',
      description: 'Open the gates so visitors can read the public archive.',
      done: hasPublished,
    },
  ]

  return (
    <main>
      <section className="hero">
        <div className="hero-sup">★ League Management ★</div>
        <h1 className="hero-title">
          {head} {tail && <em>{tail}.</em>}
        </h1>
        <p className="hero-sub">
          Sync from your platform, manage sources, curate rivalries.
          The public almanac updates whenever you sync.
        </p>
        <div className="hero-meta">
          {seasonCount ?? 0} season{seasonCount === 1 ? '' : 's'} · {managerCount ?? 0} managers · {matchupCount ?? 0} matchups
        </div>
      </section>

      <OnboardingChecklist
        storageKey={`tsc_onb_league_${league.id}`}
        kicker="Get this league ready"
        title="Your"
        titleEm={`${tail || 'league'} checklist.`}
        subtitle="Each step ticks itself off as you complete it."
        steps={leagueOnboardingSteps}
      />

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · Almanac</span>
          <span className="section-title">View the public site —</span>
          <span className="section-meta">
            {league.published_at ? 'Live' : 'Not yet published'}
          </span>
        </div>
        <a href={`/leagues/${slug}/`} target="_blank" rel="noopener" className="toc-row">
          <div className="toc-chapter">Open</div>
          <div className="toc-title-wrap">
            <div className="toc-title">Public <em>almanac.</em></div>
            <div className="toc-desc">
              Standings, season archives, the record book, drafts, manager profiles, rivalries — the whole thing.
            </div>
          </div>
          <span className={`toc-badge ${league.published_at ? 'teal' : 'steel'}`}>
            {league.published_at ? 'Live' : 'Setup'}
          </span>
          <div className="toc-arrow">→</div>
        </a>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 02 · Sync</span>
          <span className="section-title">Refresh the chronicle —</span>
          <span className="section-meta">
            {league.last_synced_at
              ? `Last synced ${new Date(league.last_synced_at).toLocaleString()}`
              : 'Never synced'}
          </span>
        </div>
        <div className="dc-card-row">
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>
              Pull every season your sources can reach.
            </div>
            <div style={{ opacity: 0.65, fontSize: '.85rem', marginTop: '.35rem' }}>
              Walks history from each source — current standings, drafts, and matchups all refreshed.
            </div>
          </div>
          <SyncButton leagueId={league.id} />
        </div>
        <div className="dc-card-row" style={{ marginTop: '.75rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>
              Grade trades with AI.
            </div>
            <div style={{ opacity: 0.65, fontSize: '.85rem', marginTop: '.35rem' }}>
              Runs Groq on up to 10 ungraded trades at a time. Click again to keep going.
            </div>
          </div>
          <GradeTradesButton leagueId={league.id} />
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 03 · Publish</span>
          <span className="section-title">Open the gates —</span>
          <span className="section-meta">
            {league.published_at ? 'Currently live' : 'Setup mode'}
          </span>
        </div>
        <div className="dc-card-row">
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>
              {league.published_at
                ? 'Public almanac is live.'
                : 'Public almanac is hidden until you publish.'}
            </div>
            <div style={{ opacity: 0.65, fontSize: '.85rem', marginTop: '.35rem' }}>
              {league.published_at
                ? `Published ${new Date(league.published_at).toLocaleString()} · unpublish to hide it again.`
                : `Visitors to /leagues/${slug}/ see a placeholder until you flip this.`}
            </div>
          </div>
          <PublishButton leagueId={league.id} isPublished={!!league.published_at} />
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 04 · Configuration</span>
          <span className="section-title">Tune the archive —</span>
          <span className="section-meta">Sources & rivalries</span>
        </div>
        <div className="toc">
          <div className="toc-body">
            <Link href={`/league/${slug}/setup`} className="toc-row">
              <div className="toc-chapter">Ch. 0</div>
              <div className="toc-title-wrap">
                <div className="toc-title">League <em>members.</em></div>
                <div className="toc-desc">
                  Every person who&apos;s ever been in the league. Merge cross-platform identities, hide throwaways, override alumni status, or delete entirely.
                </div>
              </div>
              <span className="toc-badge teal">{managerCount ?? 0} on file</span>
              <div className="toc-arrow">→</div>
            </Link>
            <Link href={`/league/${slug}/sources`} className="toc-row">
              <div className="toc-chapter">Ch. I</div>
              <div className="toc-title-wrap">
                <div className="toc-title">League <em>sources.</em></div>
                <div className="toc-desc">
                  Connect more Sleeper league IDs. Each source can walk its own history when synced.
                </div>
              </div>
              <span className="toc-badge sage">{sourceCount ?? 0} on file</span>
              <div className="toc-arrow">→</div>
            </Link>
            <Link href={`/league/${slug}/rivalries`} className="toc-row">
              <div className="toc-chapter">Ch. II</div>
              <div className="toc-title-wrap">
                <div className="toc-title">The <em>rivalries.</em></div>
                <div className="toc-desc">
                  Pick two managers, name the feud. They&apos;ll appear on the public rivalries page.
                </div>
              </div>
              <span className="toc-badge fire">{rivalryCount ?? 0} curated</span>
              <div className="toc-arrow">→</div>
            </Link>
            <Link href={`/league/${slug}/settings`} className="toc-row">
              <div className="toc-chapter">Ch. III</div>
              <div className="toc-title-wrap">
                <div className="toc-title">League <em>settings.</em></div>
                <div className="toc-desc">
                  Custom abbreviation and other knobs for the public almanac.
                </div>
              </div>
              <span className="toc-badge steel">Edit</span>
              <div className="toc-arrow">→</div>
            </Link>
            <Link href={`/league/${slug}/live`} className="toc-row">
              <div className="toc-chapter">Ch. IV</div>
              <div className="toc-title-wrap">
                <div className="toc-title">Live <em>season.</em></div>
                <div className="toc-desc">
                  Mark the current in-progress year. Pick&apos;ems, power rankings, and the weekly cron read from this.
                </div>
              </div>
              <span className="toc-badge teal">Set</span>
              <div className="toc-arrow">→</div>
            </Link>
          </div>
        </div>
      </div>

      {isOwner ? (
        <div className="section">
          <div className="section-header">
            <span className="section-num">§ 05 · Showcase</span>
            <span className="section-title">Show off the league —</span>
            <span className="section-meta">Owner only</span>
          </div>
          <Link href={`/league/${slug}/present`} className="toc-row">
            <div className="toc-chapter">Ch. V</div>
            <div className="toc-title-wrap">
              <div className="toc-title">Presentation <em>mode.</em></div>
              <div className="toc-desc">
                Build a slide deck from your league&apos;s data — standings, all-time leaders,
                rivalries, biggest blowouts — then present full-screen at a draft party or
                end-of-year banquet. Decks live in the browser tab; nothing saves.
              </div>
            </div>
            <span className="toc-badge ember">New</span>
            <div className="toc-arrow">→</div>
          </Link>
        </div>
      ) : null}

      <SiteFooter />
    </main>
  )
}
