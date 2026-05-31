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
    .select('id, name, slug, last_synced_at, published_at, owner_id')
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
    { data: liveSeasonRow },
  ] = await Promise.all([
    supabase.from('seasons').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase.from('managers').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase
      .from('matchups')
      .select('id, season:seasons!inner(league_id)', { count: 'exact', head: true })
      .eq('season.league_id', league.id),
    supabase.from('rivalries').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase.from('league_sources').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase
      .from('seasons')
      .select('year')
      .eq('league_id', league.id)
      .eq('is_live', true)
      .maybeSingle(),
  ])

  const liveYear: number | null = liveSeasonRow?.year ?? null

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
      action: <SyncButton leagueId={league.id} />,
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
      <section
        className="hero"
        style={{ padding: '2.25rem 1.25rem 1.25rem', maxWidth: '880px' }}
      >
        <div className="hero-sup">★ League Management ★</div>
        <h1
          className="hero-title"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', marginBottom: '.9rem' }}
        >
          {head} {tail && <em>{tail}.</em>}
        </h1>
        <p
          className="hero-sub"
          style={{ fontSize: 'clamp(.9rem, 1.4vw, 1.05rem)', maxWidth: '520px' }}
        >
          Sync from your platform, manage sources, curate rivalries. The public almanac
          updates whenever you sync.
        </p>
        <div className="hero-meta" style={{ marginTop: '1rem' }}>
          {seasonCount ?? 0} season{seasonCount === 1 ? '' : 's'} · {managerCount ?? 0} managers · {matchupCount ?? 0} matchups
        </div>
      </section>

      <div style={{ maxWidth: '880px', margin: '0 auto' }}>
        <OnboardingChecklist
          storageKey={`tsc_onb_league_${league.id}`}
          kicker="Get this league ready"
          title="Your"
          titleEm={`${tail || 'league'} checklist.`}
          subtitle="Each step ticks itself off as you complete it."
          steps={leagueOnboardingSteps}
        />

        {/* § 01 — Public Almanac. Featured: gold border, glow, larger badge. */}
        <div className="section" style={{ marginTop: '2rem' }}>
          <div
            className="section-header"
            style={{ paddingBottom: '.6rem', marginBottom: '1rem' }}
          >
            <span className="section-num">§ 01 · Public Almanac</span>
            <span className="section-title" style={{ fontSize: '1.35rem' }}>
              Your live site —
            </span>
            <span className="section-meta">
              {league.published_at ? 'Live now' : 'Not yet published'}
            </span>
          </div>
          <a
            href={`/leagues/${slug}/`}
            target="_blank"
            rel="noopener"
            className="toc-row"
            style={{
              padding: '1.1rem 1.5rem',
              gap: '1.1rem',
              border: '1px solid var(--gold-deep)',
              background:
                'linear-gradient(160deg, rgba(232,200,137,.10), rgba(232,200,137,.02))',
              boxShadow: '0 0 24px rgba(232,200,137,.06)',
            }}
          >
            <div className="toc-chapter" style={{ minWidth: '4rem' }}>
              Open ↗
            </div>
            <div className="toc-title-wrap">
              <div className="toc-title" style={{ fontSize: '1.35rem' }}>
                Public <em>Almanac.</em>
              </div>
              <div className="toc-desc">
                Standings, season archives, the record book, drafts, manager profiles,
                rivalries — the whole thing. Opens in a new tab.
              </div>
            </div>
            <span
              className={`toc-badge ${league.published_at ? 'teal' : 'steel'}`}
              style={{ fontSize: '.6rem' }}
            >
              {league.published_at ? 'Live' : 'Setup'}
            </span>
            <div className="toc-arrow">→</div>
          </a>
        </div>

        {/* § 02 — Sync + Publish, side by side, compact. */}
        <div className="section" style={{ marginTop: '1.5rem' }}>
          <div
            className="section-header"
            style={{ paddingBottom: '.6rem', marginBottom: '1rem' }}
          >
            <span className="section-num">§ 02 · Run it</span>
            <span className="section-title" style={{ fontSize: '1.35rem' }}>
              Sync &amp; publish —
            </span>
            <span className="section-meta">
              {league.last_synced_at
                ? `Synced ${new Date(league.last_synced_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                : 'Never synced'}
            </span>
          </div>

          <div
            className="dc-card-row"
            style={{ padding: '1rem 1.25rem', alignItems: 'flex-start' }}
          >
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem' }}>
                Sync from sources.
              </div>
              <div
                style={{
                  opacity: 0.7,
                  fontSize: '.78rem',
                  marginTop: '.3rem',
                  lineHeight: 1.45,
                }}
              >
                Walks every season your sources can reach — standings, drafts, matchups.{' '}
                <strong style={{ color: 'var(--gold)' }}>Stay on this page</strong> until
                it finishes; closing the tab cancels it. Typical run:{' '}
                <strong>20-90 seconds</strong> depending on history depth.
              </div>
              {league.last_synced_at && (
                <div
                  style={{
                    opacity: 0.55,
                    fontSize: '.7rem',
                    marginTop: '.35rem',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  Last: {new Date(league.last_synced_at).toLocaleString()}
                </div>
              )}
            </div>
            <SyncButton leagueId={league.id} />
          </div>

          <div
            className="dc-card-row"
            style={{ padding: '1rem 1.25rem', alignItems: 'flex-start' }}
          >
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem' }}>
                {league.published_at ? 'Almanac is live.' : 'Almanac is hidden.'}
              </div>
              <div
                style={{
                  opacity: 0.7,
                  fontSize: '.78rem',
                  marginTop: '.3rem',
                  lineHeight: 1.45,
                }}
              >
                {league.published_at
                  ? 'Visitors can read the public archive. Unpublish to take it offline.'
                  : `Visitors to /leagues/${slug}/ see a placeholder until you flip this. Publishing is instant.`}
              </div>
              {league.published_at && (
                <div
                  style={{
                    opacity: 0.55,
                    fontSize: '.7rem',
                    marginTop: '.35rem',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  Published {new Date(league.published_at).toLocaleString()}
                </div>
              )}
            </div>
            <PublishButton leagueId={league.id} isPublished={!!league.published_at} />
          </div>

          {/* Trade Grader is in private testing — only Jake's league sees the card.
              The matching gate also lives on the API route. */}
          {league.slug === 'jake' && (
            <div
              className="dc-card-row"
              style={{ padding: '1rem 1.25rem', alignItems: 'flex-start' }}
            >
              <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem' }}>
                  Grade trades with AI.
                </div>
                <div
                  style={{
                    opacity: 0.7,
                    fontSize: '.78rem',
                    marginTop: '.3rem',
                    lineHeight: 1.45,
                  }}
                >
                  Runs Groq on up to 10 ungraded trades at a time. Click again to keep going.
                </div>
              </div>
              <GradeTradesButton leagueId={league.id} />
            </div>
          )}
        </div>

        {/* § 03 — Admin TOC (2-column already, padding tightened for density). */}
        <div className="section" style={{ marginTop: '1.5rem' }}>
          <div
            className="section-header"
            style={{ paddingBottom: '.6rem', marginBottom: '1rem' }}
          >
            <span className="section-num">§ 03 · Configuration</span>
            <span className="section-title" style={{ fontSize: '1.35rem' }}>
              Tune the archive —
            </span>
            <span className="section-meta">Sub-pages</span>
          </div>
          <div className="toc">
            <div className="toc-body">
              <Link
                href={`/league/${slug}/setup`}
                className="toc-row"
                style={{ padding: '.9rem 1.25rem', gap: '.9rem' }}
              >
                <div className="toc-chapter" style={{ minWidth: '3.5rem' }}>Ch. 0</div>
                <div className="toc-title-wrap">
                  <div className="toc-title" style={{ fontSize: '1.15rem' }}>
                    League <em>Members.</em>
                  </div>
                  <div className="toc-desc" style={{ fontSize: '.78rem' }}>
                    Merge cross-platform identities, hide throwaways, override alumni status.
                  </div>
                </div>
                <span className="toc-badge teal" style={{ fontSize: '.55rem' }}>
                  {managerCount ?? 0} on file
                </span>
                <div className="toc-arrow">→</div>
              </Link>
              <Link
                href={`/league/${slug}/sources`}
                className="toc-row"
                style={{ padding: '.9rem 1.25rem', gap: '.9rem' }}
              >
                <div className="toc-chapter" style={{ minWidth: '3.5rem' }}>Ch. I</div>
                <div className="toc-title-wrap">
                  <div className="toc-title" style={{ fontSize: '1.15rem' }}>
                    League <em>Sources.</em>
                  </div>
                  <div className="toc-desc" style={{ fontSize: '.78rem' }}>
                    Connect more Sleeper/ESPN league IDs. Each source walks its own history.
                  </div>
                </div>
                <span className="toc-badge sage" style={{ fontSize: '.55rem' }}>
                  {sourceCount ?? 0} on file
                </span>
                <div className="toc-arrow">→</div>
              </Link>
              <Link
                href={`/league/${slug}/rivalries`}
                className="toc-row"
                style={{ padding: '.9rem 1.25rem', gap: '.9rem' }}
              >
                <div className="toc-chapter" style={{ minWidth: '3.5rem' }}>Ch. II</div>
                <div className="toc-title-wrap">
                  <div className="toc-title" style={{ fontSize: '1.15rem' }}>
                    The <em>Rivalries.</em>
                  </div>
                  <div className="toc-desc" style={{ fontSize: '.78rem' }}>
                    Pick two managers, name the feud — appears on the public rivalries page.
                  </div>
                </div>
                <span className="toc-badge fire" style={{ fontSize: '.55rem' }}>
                  {rivalryCount ?? 0} curated
                </span>
                <div className="toc-arrow">→</div>
              </Link>
              <Link
                href={`/league/${slug}/settings`}
                className="toc-row"
                style={{ padding: '.9rem 1.25rem', gap: '.9rem' }}
              >
                <div className="toc-chapter" style={{ minWidth: '3.5rem' }}>Ch. III</div>
                <div className="toc-title-wrap">
                  <div className="toc-title" style={{ fontSize: '1.15rem' }}>
                    League <em>Settings.</em>
                  </div>
                  <div className="toc-desc" style={{ fontSize: '.78rem' }}>
                    Custom abbreviation and other knobs for the public almanac.
                  </div>
                </div>
                <span className="toc-badge steel" style={{ fontSize: '.55rem' }}>Edit</span>
                <div className="toc-arrow">→</div>
              </Link>
              <Link
                href={`/league/${slug}/live`}
                className="toc-row"
                style={{ padding: '.9rem 1.25rem', gap: '.9rem' }}
              >
                <div className="toc-chapter" style={{ minWidth: '3.5rem' }}>Ch. IV</div>
                <div className="toc-title-wrap">
                  <div className="toc-title" style={{ fontSize: '1.15rem' }}>
                    {liveYear ? `${liveYear} ` : 'Current '}
                    <em>Season.</em>
                  </div>
                  <div className="toc-desc" style={{ fontSize: '.78rem' }}>
                    Mark the in-progress year. Pick&apos;ems, power rankings, and the weekly cron read from this.
                  </div>
                </div>
                <span className="toc-badge teal" style={{ fontSize: '.55rem' }}>
                  {liveYear ? 'Live' : 'Set'}
                </span>
                <div className="toc-arrow">→</div>
              </Link>
            </div>
          </div>
        </div>

        {isOwner ? (
          <div className="section" style={{ marginTop: '1.5rem' }}>
            <div
              className="section-header"
              style={{ paddingBottom: '.6rem', marginBottom: '1rem' }}
            >
              <span className="section-num">§ 04 · Showcase</span>
              <span className="section-title" style={{ fontSize: '1.35rem' }}>
                Show off the league —
              </span>
              <span className="section-meta">Owner only</span>
            </div>
            <Link
              href={`/league/${slug}/present`}
              className="toc-row"
              style={{ padding: '.9rem 1.25rem', gap: '.9rem' }}
            >
              <div className="toc-chapter" style={{ minWidth: '3.5rem' }}>Ch. V</div>
              <div className="toc-title-wrap">
                <div className="toc-title" style={{ fontSize: '1.15rem' }}>
                  Presentation <em>Mode.</em>
                </div>
                <div className="toc-desc" style={{ fontSize: '.78rem' }}>
                  Build a slide deck from your league&apos;s data — present full-screen at the draft party
                  or end-of-year banquet. Decks live in the browser tab; nothing saves.
                </div>
              </div>
              <span className="toc-badge ember" style={{ fontSize: '.55rem' }}>New</span>
              <div className="toc-arrow">→</div>
            </Link>
          </div>
        ) : null}
      </div>

      <SiteFooter />
    </main>
  )
}
