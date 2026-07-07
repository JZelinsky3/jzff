import Link from 'next/link'
import { OnboardingChecklist, type OnboardingStep } from '@/components/OnboardingChecklist'
import { SiteFooter } from '@/components/SiteFooter'
import { MobileLibrary } from '@/components/dashboard/MobileLibrary'
import { createClient } from '@/lib/supabase/server'
import {
  getUserSubscription,
  isCompUser,
  isSubscriptionActive,
  TIER_LABELS,
  TIER_LIMITS,
} from '@/lib/stripe'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { getViewMode } from '@/lib/viewMode'
import { Bookshelf } from './bookshelf'
import { CollapsedSection } from './collapsed-section'
import { LeagueCardMenu } from './league-card-menu'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ yahoo?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Explicit owner filter: site admins have RLS access to every league
  // (so they can view setups via /league/<slug>), but the dashboard library
  // should only show leagues this user actually owns. /admin is the
  // all-leagues view.
  const { data: leagues } = user
    ? await supabase
        .from('leagues')
        .select('id, name, slug, platform, last_synced_at, published_at, created_at, grace_period_ends_at')
        .eq('owner_id', user.id)
        // Hide hub-only leagues (auto-ingested to feed a career chronicle) from
        // the commissioner-facing archive shelf. They live under /manager.
        .eq('manager_view', false)
        .order('created_at', { ascending: false })
    : { data: [] as never[] }

  // The user's Manager Hub chronicle, if they've started one. Drives the
  // second mode card below the hero.
  type ChronicleSummary = { slug: string; display_name: string; linkCount: number }
  let chronicle: ChronicleSummary | null = null
  if (user) {
    const { data: chronRow } = await supabase
      .from('career_chronicles')
      .select('id, slug, display_name')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (chronRow) {
      const { count } = await supabase
        .from('career_links')
        .select('id', { count: 'exact', head: true })
        .eq('chronicle_id', chronRow.id)
      chronicle = { slug: chronRow.slug, display_name: chronRow.display_name, linkCount: count ?? 0 }
    }
  }

  // Bookmarked leagues this user is following (but doesn't own). Two-step
  // query because leagues RLS doesn't let the user SELECT leagues they
  // don't own — we'd get an empty join. So: pull bookmark league_ids
  // via the user's own RLS-allowed bookmarks table (own user_id), then
  // resolve league details via the admin client. Safe because we already
  // own-scope the bookmark id list before querying leagues.
  type BookmarkedLeague = { id: string; name: string; slug: string; platform: string; published_at: string | null }
  let bookmarks: BookmarkedLeague[] = []
  if (user) {
    const { data: bookmarkRows } = await supabase
      .from('league_bookmarks')
      .select('league_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    const ids = (bookmarkRows ?? []).map((r) => r.league_id as string)
    if (ids.length > 0) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const admin = createAdminClient()
      const { data: leagueRows } = await admin
        .from('leagues')
        .select('id, name, slug, platform, published_at')
        .in('id', ids)
        .not('published_at', 'is', null)
      const byId = new Map((leagueRows ?? []).map((l) => [l.id as string, l as BookmarkedLeague]))
      bookmarks = ids.map((id) => byId.get(id)).filter((l): l is BookmarkedLeague => !!l)
    }
  }

  const leaguesWithGrace = (leagues ?? []).filter((l) => l.grace_period_ends_at)
  const earliestGrace = leaguesWithGrace
    .map((l) => new Date(l.grace_period_ends_at as string))
    .sort((a, b) => a.getTime() - b.getTime())[0]

  // Subscription summary card: shows tier + renewal/end date so commish
  // doesn't have to hop to /account just to check. Lifetime users get a
  // simple comp badge instead.
  const subUserId = user?.id ?? null
  const comp = subUserId ? await isCompUser(subUserId) : false
  const siteAdmin = subUserId ? await isSiteAdmin(subUserId) : false
  const sub = !comp && subUserId ? await getUserSubscription(subUserId) : null
  const subActive = isSubscriptionActive(sub)
  const subEndsLabel = formatSubEndsLabel(sub)
  const subTierName = sub ? TIER_LABELS[sub.tier]?.name ?? sub.tier : null

  // UDFA = signed-in user with no comp, no active subscription. Their
  // earliest league gets the trial slot (full paid-feature preview);
  // additional leagues use the UDFA feature set.
  const isUDFA = !!user && !comp && !subActive
  const tier1Limit = TIER_LIMITS.tier1

  // Demo card hides permanently once the user has created their first league
  // (flag set in /dashboard/new/actions.ts after a successful insert). Stays
  // hidden even if they later delete every league — they're past the
  // "what does this product look like?" stage. Fallback: existing users who
  // created leagues before the flag was introduced still get the card hidden
  // as long as at least one league is on file.
  const showDemoCard =
    !user?.user_metadata?.has_created_league && (leagues?.length ?? 0) === 0

  const hasLeague = (leagues?.length ?? 0) > 0
  // Plan capacity drives the blacked-out placeholder spines on the shelf:
  // comp reads as the top tier, paid plans use their real limit, UDFA gets
  // the single trial slot. The preview caps at five spines total; once the
  // user shelves five real volumes the placeholders retire entirely.
  const shelfSlots = comp ? TIER_LIMITS.tier3 : subActive && sub ? TIER_LIMITS[sub.tier] : tier1Limit
  const ownedCount = leagues?.length ?? 0
  const shelfPlaceholders = ownedCount >= 5 ? 0 : Math.max(0, Math.min(shelfSlots, 5) - ownedCount)
  // Most recent sync across the shelf, for the hero chip.
  const latestSyncedAt = (leagues ?? [])
    .map((l) => l.last_synced_at)
    .filter((d): d is string => !!d)
    .sort()
    .pop()
  const hasSynced = !!leagues?.some((l) => l.last_synced_at)
  const hasPublished = !!leagues?.some((l) => l.published_at)
  const firstUnsyncedSlug = leagues?.find((l) => !l.last_synced_at)?.slug
  const firstUnpublishedSlug = leagues?.find((l) => !l.published_at)?.slug
  const targetSlug = firstUnsyncedSlug ?? firstUnpublishedSlug ?? leagues?.[0]?.slug

  // The user's earliest-created league is their trial slot — gets the
  // "Trial · Full access" badge. Subsequent free-tier leagues show as
  // UDFA-limited. Leagues come back sorted newest-first so the last
  // entry is the oldest. Mirrors the trial-resolution rule used by
  // resolveLeagueTier on the public side.
  const earliestOwnedLeagueId =
    leagues && leagues.length > 0 ? leagues[leagues.length - 1].id : null

  if ((await getViewMode()) === 'mobile') {
    return (
      <MobileLibrary
        leagues={leagues ?? []}
        bookmarks={bookmarks}
        isUDFA={isUDFA}
        earliestOwnedLeagueId={earliestOwnedLeagueId}
        comp={comp}
        subActive={subActive}
        subTierName={subTierName}
        tier1Limit={tier1Limit}
        showDemoCard={showDemoCard}
      />
    )
  }

  const onboardingSteps: OnboardingStep[] = [
    {
      label: 'Create your first league',
      description: 'Pick a platform, paste your league ID. We walk the history for you.',
      done: hasLeague,
      href: '/dashboard/new',
      cta: 'Add league',
    },
    {
      label: 'Sync your data',
      description: 'Pull every season your sources can reach. Drafts, matchups, standings.',
      done: hasSynced,
      href: targetSlug ? `/league/${targetSlug}` : '/dashboard/new',
      cta: 'Sync now',
    },
    {
      label: 'Publish your almanac',
      description: 'Flip the switch to open your public archive at /leagues/<slug>/.',
      done: hasPublished,
      href: targetSlug ? `/league/${targetSlug}` : '/dashboard/new',
      cta: 'Publish',
    },
  ]

  return (
    <main>
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.25rem' }}>
        <div className="hero-sup">★ Your Library ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}>
          The <em>Archives.</em>
        </h1>
        <p className="hero-sub">
          Every league you keep. Open one, or begin a new chronicle below.
        </p>
        {(hasLeague || bookmarks.length > 0) && (
          <div className="hero-dateline">
            <span>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            {latestSyncedAt && (
              <>
                <span className="hero-dateline-sep" aria-hidden>·</span>
                <span>
                  Last synced <strong>{new Date(latestSyncedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong>
                </span>
              </>
            )}
          </div>
        )}
        <div style={{ marginTop: '1.75rem', display: 'flex', gap: '.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/dashboard/new" className="dc-btn">+ New archive</Link>
          <Link href="/hub" className="dc-btn-ghost">★ The Clubhouse</Link>
        </div>
        {(comp || subActive || isUDFA) && (
          <Link
            href={comp || subActive ? '/account' : '/pricing'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '.5rem',
              marginTop: '1.25rem',
              padding: '.5rem .9rem',
              fontFamily: 'var(--mono)', fontSize: '.65rem',
              letterSpacing: '.2em', textTransform: 'uppercase',
              color: 'var(--cream-soft)', textDecoration: 'none',
              border: '1px solid var(--ink-line)', borderRadius: '2px',
            }}
            title={comp || subActive ? 'Manage subscription' : 'See plans'}
          >
            {comp ? (
              <>
                <span style={{ color: 'var(--gold)' }}>★ Comp</span>
                <span style={{ opacity: 0.6 }}>· Unlimited access</span>
              </>
            ) : subActive ? (
              <>
                <span style={{ color: 'var(--gold)' }}>{subTierName}</span>
                {subEndsLabel && <span style={{ opacity: 0.7 }}>· {subEndsLabel}</span>}
              </>
            ) : (
              <>
                <span style={{ color: 'var(--gold)' }}>★ UDFA</span>
                <span style={{ opacity: 0.6 }}>
                  · {tier1Limit} Free {tier1Limit === 1 ? 'League' : 'Leagues'}
                </span>
              </>
            )}
          </Link>
        )}
      </section>

      {isUDFA && (
        <div
          className="dc-banner"
          style={{
            maxWidth: '880px', margin: '1rem auto 0',
            padding: '1rem 1.25rem',
            background: 'rgba(232,200,137,.06)',
            border: '1px solid var(--gold-deep)',
            borderRadius: '2px',
          }}
        >
          <div className="dc-banner-kicker" style={{ fontFamily: 'var(--mono)', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '.25rem' }}>
            ★ How UDFA works
          </div>
          <div className="dc-banner-lede" style={{ fontFamily: 'var(--serif)', color: 'var(--cream)' }}>
            <strong style={{ color: 'var(--gold)' }}>First league</strong> is a free trial: every feature, unlocked as a preview of the paid plans.
          </div>
          {/* Feature-list explanation is verbose; it's the first thing to hide
              on phones where vertical real-estate is precious. The email
              follow-up stays visible at every width. */}
          <div className="dc-banner-note" style={{ opacity: 0.7, marginTop: '.35rem' }}>
            <span className="hide-on-mobile">
              Additional leagues use the free UDFA feature set (all-time standings, rivalries, and the manager strip). Pick&apos;ems, Power Rankings, Live Season Hub, and Manager Hub stay locked on UDFA leagues until you upgrade.{' '}
            </span>
            Email <a href="mailto:jzffgames@gmail.com" style={{ color: 'var(--gold)' }}>jzffgames@gmail.com</a> with bugs or suggestions.
          </div>
          {/* Hard date the public preview ends + a quiet upgrade CTA, so the
              UDFA banner doubles as a launch reminder. Flex row so the date
              sits left and the link sits right at any width; wraps cleanly
              when phone width can't hold both on one line. */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            justifyContent: 'space-between', gap: '.75rem',
            marginTop: '.85rem', paddingTop: '.7rem',
            borderTop: '1px solid rgba(232,200,137,.18)',
          }}>
            <span className="dc-banner-foot" style={{
              fontFamily: 'var(--mono)',
              letterSpacing: '.22em', textTransform: 'uppercase',
              color: 'var(--cream-mute)',
            }}>
              ★ Testing ends:{' '}
              <strong style={{ color: 'var(--gold)' }}>Jul 20, 2026</strong>
            </span>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              <Link
                href="/pricing"
                className="dc-btn-ghost dc-banner-btn"
              >
                Pricing
              </Link>
              <Link
                href="/pricing/plans"
                className="dc-btn-ghost dc-banner-btn"
                title="Side-by-side comparison of every feature per plan"
              >
                Compare
              </Link>
            </div>
          </div>
        </div>
      )}

      {leaguesWithGrace.length > 0 && earliestGrace && (
        <div
          className="dc-banner"
          style={{
            maxWidth: '880px', margin: '1rem auto 0',
            padding: '1rem 1.25rem',
            background: 'rgba(160,72,48,.08)',
            border: '1px solid rgba(160,72,48,.4)',
            borderRadius: '2px',
            display: 'flex', gap: '1rem', flexWrap: 'wrap',
            alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div>
            <div className="dc-banner-kicker" style={{ fontFamily: 'var(--mono)', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--rust, #a04830)', marginBottom: '.25rem' }}>
              ★ Subscription lapsed
            </div>
            <div className="dc-banner-lede" style={{ fontFamily: 'var(--serif)', color: 'var(--cream)' }}>
              {leaguesWithGrace.length === 1 ? 'Your league will be' : `Your ${leaguesWithGrace.length} leagues will be`} deleted on{' '}
              <strong style={{ color: 'var(--gold)' }}>
                {earliestGrace.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </strong>.
            </div>
            <div className="dc-banner-note" style={{ opacity: 0.7, marginTop: '.25rem' }}>
              Resubscribe before then to keep everything, or export anything you want to save.
            </div>
          </div>
          <Link href="/pricing" className="dc-btn">Resubscribe</Link>
        </div>
      )}

      {sp.yahoo && <YahooStatusBanner status={sp.yahoo} />}

      <OnboardingChecklist
        storageKey="tsc_onb_dashboard"
        kicker="Welcome ★ Get started"
        title="Three steps to your"
        titleEm="archive."
        subtitle="Each step ticks itself off as you go."
        steps={onboardingSteps}
        fabOnly
      />

      {/* On mobile this whole section is redundant for non-admins: the
          Mode I "League Archive" card duplicates the "+ New archive →"
          button already in the hero above. Non-admins get hide-on-mobile on
          the section so the strip of padding doesn't linger; admins keep
          the section visible on mobile but only see Mode II — Mode I
          itself is always hidden on phones (its destination is one tap
          away in the hero). */}
      <div
        className={`section${siteAdmin ? '' : ' hide-on-mobile'}`}
        style={{ marginTop: '1.25rem', paddingTop: 0 }}
      >
        {/* ← MANUAL EDIT: change `maxWidth` to widen/narrow the League Archive
            cards row. Larger value (e.g. '1080px') = wider; smaller (e.g. '640px')
            = narrower. Admin sees 2 cards side-by-side so they get a wider
            cap so each card stays readable. */}
        <div className="dc-mode-grid" style={{ maxWidth: siteAdmin ? '880px' : '520px', margin: '0 auto' }}>
          <Link href="/dashboard/new" className="dc-mode hide-on-mobile">
            <span className="dc-mode-book" aria-hidden>
              <span className="dc-mode-book-pages" />
              <span className="dc-mode-book-cover">
                <span className="dc-mode-book-glyph">§</span>
                <span className="dc-mode-book-spine-title">New Volume</span>
              </span>
            </span>
            <span className="dc-mode-copy">
              <span className="dc-mode-kicker">Mode I · Bind a new volume</span>
              <span className="dc-mode-title">League <em>Archive.</em></span>
              <span className="dc-mode-desc">A public almanac of your league&apos;s history: drafts, matchups, champions.</span>
              <span className="dc-mode-cta">Start the press <span className="card-arrow">→</span></span>
            </span>
          </Link>

          {siteAdmin && (
            <Link href={chronicle ? `/manager/${chronicle.slug}` : '/manager/new'} className="dc-mode">
              <span className="dc-mode-book" aria-hidden>
                <span className="dc-mode-book-pages" />
                <span className="dc-mode-book-cover is-hub">
                  <span className="dc-mode-book-glyph">✦</span>
                  <span className="dc-mode-book-spine-title">Career Book</span>
                </span>
              </span>
              <span className="dc-mode-copy">
                <span className="dc-mode-kicker">★ Mode II · One book, every league</span>
                <span className="dc-mode-title">Manager <em>Hub.</em></span>
                <span className="dc-mode-desc">
                  {chronicle
                    ? `Your career chronicle, ${chronicle.linkCount} ${chronicle.linkCount === 1 ? 'league' : 'leagues'} linked. Open the book.`
                    : 'Track yourself across every league you play in. One book of your whole career.'}
                </span>
                <span className="dc-mode-cta">
                  {chronicle ? 'Open your chronicle' : 'Start your hub'} <span className="card-arrow">→</span>
                </span>
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* § 01 · The shelf: the primary league surface. One big spine per
          league; clicking a book pops the Setup / Archive actions above it.
          Blacked-out spines mark unused plan slots; bookmarked almanacs
          shelve at the end as "borrowed" volumes. */}
      {(hasLeague || bookmarks.length > 0 || shelfPlaceholders > 0) && (
        <div className="section" style={{ marginTop: '4rem' }}>
          <div className="section-header">
            <span className="section-num">§ 01 · The shelf</span>
            <span className="section-title">Every league you keep —</span>
            <span className="section-meta">Tap a spine to open it</span>
          </div>
          <Bookshelf
            leagues={[...(leagues ?? [])].reverse().map((l) => ({
              id: l.id as string,
              name: l.name as string,
              slug: l.slug as string,
              platform: l.platform as string,
              lastSyncedAt: (l.last_synced_at as string | null) ?? null,
              published: !!l.published_at,
            }))}
            bookmarks={bookmarks.map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
            placeholders={shelfPlaceholders}
          />
          {/* The checkout desk: the same leagues as lending cards, docked
              under the shelf as a closed drawer so it reads as part of the
              shelf rather than its own section. */}
          {hasLeague && leagues && (
            <CollapsedSection
              plain
              num="The checkout desk"
              title="Pull a lending card —"
              meta={`${leagues.length} on file`}
            >
          <div className="card-grid dc-dashboard-grid">
            {leagues.map((l, idx) => (
              <div key={l.id} style={{ position: 'relative', display: 'flex', height: '100%' }}>
                {/* Click-area pattern: the parent .card div carries the
                    visual styling but isn't itself a link. An absolutely-
                    positioned Link covers the card so tapping content
                    drops into setup; the .dc-league-cta footer uses a
                    higher z-index so its real controls (Setup / Archive /
                    ⋯ menu) intercept their own clicks without nesting
                    anchors. */}
                <div className="card dc-league-card dc-lend" style={{ flex: 1, height: '100%' }}>
                  <Link
                    href={`/league/${l.slug}`}
                    aria-label={`Open setup for ${l.name}`}
                    className="dc-league-clickarea"
                  />
                  <div className="dc-lend-head">
                    <span>Lending card</span>
                    <span>Vol. {toRoman(leagues.length - idx)} · {l.platform}</span>
                  </div>
                  {/* Tier badge — only on UDFA users' cards. The user's
                      earliest league is their one free trial slot ("Trial
                      · Full access"); subsequent free leagues are UDFA-
                      limited. Independent of the testing window — the
                      gate applies immediately. Paid and comp users get
                      no badge — their tier shows in the hero pill. */}
                  {isUDFA && (
                    <div className={`dc-league-tier ${l.id === earliestOwnedLeagueId ? 'is-trial' : 'is-udfa'}`}>
                      <span aria-hidden>★</span>
                      {l.id === earliestOwnedLeagueId ? 'Trial · Full access' : 'UDFA · Limited'}
                    </div>
                  )}
                  <div className="card-title dc-lend-title">
                    {splitName(l.name).head} <em>{splitName(l.name).tail}.</em>
                  </div>
                  <div className="dc-lend-lines">
                    <div className="dc-lend-line">
                      <span>Last synced</span>
                      <span className="dc-lend-dots" aria-hidden />
                      <span>{l.last_synced_at ? new Date(l.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}</span>
                    </div>
                    <div className="dc-lend-line">
                      <span>Status</span>
                      <span className="dc-lend-dots" aria-hidden />
                      <span>{l.published_at ? 'Published' : 'Draft'}</span>
                    </div>
                    {l.grace_period_ends_at && (
                      <div className="dc-lend-line is-due">
                        <span>Due back</span>
                        <span className="dc-lend-dots" aria-hidden />
                        <span>{new Date(l.grace_period_ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    )}
                  </div>
                  <div className="dc-league-cta">
                    <Link href={`/league/${l.slug}`} className="dc-league-cta-btn is-primary">
                      Setup
                    </Link>
                    {l.published_at && (
                      <a
                        href={`/leagues/${l.slug}/`}
                        target="_blank"
                        rel="noopener"
                        className="dc-league-cta-btn"
                        aria-label={`Open the live almanac for ${l.name}`}
                      >
                        Archive <span className="card-arrow">↗</span>
                      </a>
                    )}
                    <LeagueCardMenu leagueId={l.id} leagueName={l.name} />
                  </div>
                </div>
              </div>
            ))}
          </div>
            </CollapsedSection>
          )}
        </div>
      )}

      {(!leagues || leagues.length === 0) && (
        <div className="section">
          <div className="section-header">
            <span className="section-num">§ {bookmarks.length > 0 ? '02' : '01'} · Your leagues</span>
            <span className="section-title">Nothing on the shelf —</span>
            <span className="section-meta">Yet</span>
          </div>
          <div className="dc-empty">
            <div className="dc-empty-title">No archives yet.</div>
            <div className="dc-empty-text">
              Pick a platform, paste your league ID, and watch the chronicle fill itself in.
            </div>
            <Link href="/dashboard/new" className="dc-btn">Start your first archive</Link>
          </div>
        </div>
      )}

      {bookmarks.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-num">§ 02 · Bookmarked</span>
            <span className="section-title">Leagues you follow —</span>
            <span className="section-meta">{bookmarks.length} on the shelf</span>
          </div>
          <div className="card-grid dc-dashboard-grid">
            {bookmarks.map((l) => (
              <a
                key={l.id}
                href={`/leagues/${l.slug}/`}
                className="card"
              >
                <div className="card-corner">★ {l.platform}</div>
                <div className="card-roman">{l.name.charAt(0).toUpperCase()}</div>
                <div className="card-title">
                  {splitName(l.name).head} <em>{splitName(l.name).tail}.</em>
                </div>
                <div className="card-desc">Bookmarked almanac. Open to view.</div>
                <div className="card-cta">
                  Open the almanac <span className="card-arrow">→</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {showDemoCard && (
        <div className="section">
          <div className="section-header">
            <span className="section-num">§ {bookmarks.length > 0 ? '03' : '02'} · See it live</span>
            <span className="section-title">Tour a finished almanac —</span>
            <span className="section-meta">a real league&apos;s seven-year history</span>
          </div>
          <div className="card-grid dc-dashboard-grid">
            <DemoCard />
          </div>
        </div>
      )}

      <SiteFooter />
    </main>
  )
}

function DemoCard() {
  return (
    <a
      href="/demo/"
      target="_blank"
      rel="noopener"
      className="card"
      style={{ borderStyle: 'dashed' }}
    >
      {/* Same gold corner tag as the landing DemoViewer poster — the
          demo's visual signature (.dv-poster-card-tag in globals.css). */}
      <div className="dv-poster-card-tag">▶ Demo</div>
      <div className="card-roman">★</div>
      <div className="card-title">
        Demo <em>almanac.</em>
      </div>
      <div className="card-desc">
        See a finished almanac before building your own. Built from a real league&apos;s seven-year history.
      </div>
      <div className="card-cta">
        Open the demo <span className="card-arrow">→</span>
      </div>
    </a>
  )
}

function formatSubEndsLabel(sub: { status: string; cancel_at_period_end: boolean; current_period_end: string | null; trial_ends_at: string | null } | null): string | null {
  if (!sub) return null
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (sub.status === 'trialing' && sub.trial_ends_at) {
    return `Trial ends ${fmt(sub.trial_ends_at)}`
  }
  if (sub.cancel_at_period_end && sub.current_period_end) {
    return `Ends ${fmt(sub.current_period_end)} · cancel pending`
  }
  if (sub.status === 'active' && sub.current_period_end) {
    return `Renews ${fmt(sub.current_period_end)}`
  }
  return sub.status
}

function splitName(name: string): { head: string; tail: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { head: '', tail: parts[0] }
  return { head: parts.slice(0, -1).join(' '), tail: parts[parts.length - 1] }
}

// Volume numbering for the shelf + edition cards. Oldest league = Vol. I.
function toRoman(n: number): string {
  const table: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  for (const [v, s] of table) {
    while (n >= v) { out += s; n -= v }
  }
  return out
}



function YahooStatusBanner({ status }: { status: string }) {
  const isOk = status === 'connected'
  const messages: Record<string, string> = {
    connected: 'Yahoo connected. You can now create archives from your Yahoo leagues.',
    state_mismatch: 'Yahoo connect failed: security check did not match. Try again.',
    token_exchange_failed: 'Yahoo connect failed: could not exchange the auth code. Try again.',
    save_failed: 'Yahoo connect partially succeeded but could not save tokens. Try again.',
    access_denied: 'You declined to grant access on Yahoo. Try again to connect.',
  }
  const msg = messages[status] ?? `Yahoo: ${status}`
  return (
    <div
      style={{
        maxWidth: '880px', margin: '1rem auto 0',
        padding: '.85rem 1.1rem',
        background: isOk ? 'rgba(120,160,90,.08)' : 'rgba(160,72,48,.08)',
        border: `1px solid ${isOk ? 'var(--gold-deep)' : 'rgba(160,72,48,.4)'}`,
        borderRadius: '2px',
        color: 'var(--cream)',
        fontSize: '.9rem',
      }}
    >
      <span style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: isOk ? 'var(--gold)' : 'var(--rust, #a04830)', marginRight: '.6rem' }}>
        {isOk ? '★ Yahoo' : '✗ Yahoo'}
      </span>
      {msg}
    </div>
  )
}
