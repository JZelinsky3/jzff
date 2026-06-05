import Link from 'next/link'
import { OnboardingChecklist, type OnboardingStep } from '@/components/OnboardingChecklist'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import {
  getUserSubscription,
  isCompUser,
  isSubscriptionActive,
  isTestingModeActive,
  testingModeEndsAt,
  TIER_LABELS,
  TIER_LIMITS,
} from '@/lib/stripe'
import { isSiteAdmin } from '@/lib/siteAdmin'
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

  // UDFA = signed-in user with no comp, no active subscription. They get
  // the free 1-league slot. During the testing window they also get full
  // access to every paid feature for free.
  const isUDFA = !!user && !comp && !subActive
  const testingActive = isTestingModeActive()
  const testingEnds = testingModeEndsAt()
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
  const hasSynced = !!leagues?.some((l) => l.last_synced_at)
  const hasPublished = !!leagues?.some((l) => l.published_at)
  const firstUnsyncedSlug = leagues?.find((l) => !l.last_synced_at)?.slug
  const firstUnpublishedSlug = leagues?.find((l) => !l.published_at)?.slug
  const targetSlug = firstUnsyncedSlug ?? firstUnpublishedSlug ?? leagues?.[0]?.slug

  const onboardingSteps: OnboardingStep[] = [
    {
      label: 'Create your first league',
      description: 'Pick a platform, paste your league ID — we walk the history for you.',
      done: hasLeague,
      href: '/dashboard/new',
      cta: 'Add league →',
    },
    {
      label: 'Sync your data',
      description: 'Pull every season your sources can reach. Drafts, matchups, standings.',
      done: hasSynced,
      href: targetSlug ? `/league/${targetSlug}` : '/dashboard/new',
      cta: 'Sync now →',
    },
    {
      label: 'Publish your almanac',
      description: 'Flip the switch to open your public archive at /leagues/<slug>/.',
      done: hasPublished,
      href: targetSlug ? `/league/${targetSlug}` : '/dashboard/new',
      cta: 'Publish →',
    },
  ]

  return (
    <main>
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '2rem' }}>
        <div className="hero-sup">★ Your Library ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}>
          The <em>Archives.</em>
        </h1>
        <p className="hero-sub">
          Every league you keep. Open one, or begin a new chronicle below.
        </p>
        <div style={{ marginTop: '1.75rem' }}>
          <Link href="/dashboard/new" className="dc-btn">+ New archive →</Link>
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
                {testingActive && (
                  <span style={{ opacity: 0.6 }}>· Testing access</span>
                )}
              </>
            )}
          </Link>
        )}
      </section>

      {isUDFA && testingActive && testingEnds && (
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
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '.25rem' }}>
            ★ Free testing window
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', color: 'var(--cream)' }}>
            UDFA gets the <strong style={{ color: 'var(--gold)' }}>whole site</strong> — every page, every paid feature — until{' '}
            <strong style={{ color: 'var(--gold)' }}>
              {testingEnds.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            </strong>.
          </div>
          <div style={{ opacity: 0.7, fontSize: '.85rem', marginTop: '.35rem' }}>
            Pick&apos;ems, Power Rankings, Live Season Hub, and Manager Hub are all unlocked for free during testing. After the window closes, UDFA stays free with one league — paid tiers re-gate the premium features.{' '}
            Email <a href="mailto:jzffgames@gmail.com" style={{ color: 'var(--gold)' }}>jzffgames@gmail.com</a> with bugs or suggestions.
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
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--rust, #a04830)', marginBottom: '.25rem' }}>
              ★ Subscription lapsed
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', color: 'var(--cream)' }}>
              {leaguesWithGrace.length === 1 ? 'Your league will be' : `Your ${leaguesWithGrace.length} leagues will be`} deleted on{' '}
              <strong style={{ color: 'var(--gold)' }}>
                {earliestGrace.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
              </strong>.
            </div>
            <div style={{ opacity: 0.7, fontSize: '.85rem', marginTop: '.25rem' }}>
              Resubscribe before then to keep everything — or export anything you want to save.
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

      <div className="section" style={{ paddingTop: '1rem' }}>
        {/* ← MANUAL EDIT: change `maxWidth` to widen/narrow the League Archive
            cards row. Larger value (e.g. '1080px') = wider; smaller (e.g. '640px')
            = narrower. Affects both the lone-card and 2-up (admin) layouts. */}
        <div className="card-grid dc-dashboard-grid" style={{ maxWidth: '580px', margin: '0 auto' }}>
          <Link href="/dashboard/new" className="card" style={{ display: 'block' }}>
            <div className="card-corner">Mode I</div>
            <div className="card-roman">§</div>
            <div className="card-title">League <em>Archive.</em></div>
            <div className="card-desc">A public almanac of your league&apos;s history — drafts, matchups, champions.</div>
            <div className="card-cta">Build an archive <span className="card-arrow">→</span></div>
          </Link>

          {siteAdmin && (
            <Link href={chronicle ? `/manager/${chronicle.slug}` : '/manager/new'} className="card" style={{ display: 'block' }}>
              <div className="card-corner">★ Mode II</div>
              <div className="card-roman">✦</div>
              <div className="card-title">Manager <em>Hub.</em></div>
              <div className="card-desc">
                {chronicle
                  ? `Your career chronicle — ${chronicle.linkCount} ${chronicle.linkCount === 1 ? 'league' : 'leagues'} linked. Open the book.`
                  : 'Track yourself across every league you play in. One book of your whole career.'}
              </div>
              <div className="card-cta">
                {chronicle ? 'Open your chronicle' : 'Start your hub'} <span className="card-arrow">→</span>
              </div>
            </Link>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · Your leagues</span>
          <span className="section-title">{leagues?.length ?? 0} on file —</span>
          <span className="section-meta">Newest first</span>
        </div>

        {(!leagues || leagues.length === 0) ? (
          <div className="dc-empty">
            <div className="dc-empty-title">No archives yet.</div>
            <div className="dc-empty-text">
              Pick a platform, paste your league ID, and watch the chronicle fill itself in.
            </div>
            <Link href="/dashboard/new" className="dc-btn">Start your first archive →</Link>
          </div>
        ) : (
          <div className="card-grid dc-dashboard-grid">
            {leagues.map((l) => (
              <div key={l.id} style={{ position: 'relative', display: 'flex', height: '100%' }}>
                <LeagueCardMenu leagueId={l.id} leagueName={l.name} />
                <Link href={`/league/${l.slug}`} className="card" style={{ flex: 1, height: '100%' }}>
                  <div className="card-corner">{l.platform}</div>
                  {/* Tier badge — only on UDFA users' cards. During testing
                      window: "TRIAL · FULL ACCESS" (premium features unlocked
                      site-wide). After testing closes: "UDFA · FREE" (1
                      league, premium features locked behind upgrade). Paid
                      and comp users get no badge — their tier shows in the
                      hero pill instead. */}
                  {isUDFA && (
                    <div className={`dc-league-tier ${testingActive ? 'is-trial' : 'is-udfa'}`}>
                      <span aria-hidden>★</span>
                      {testingActive ? 'Trial · Full access' : 'UDFA · Free'}
                    </div>
                  )}
                  <div className="card-roman">{l.name.charAt(0).toUpperCase()}</div>
                  <div className="card-title">
                    {splitName(l.name).head} <em>{splitName(l.name).tail}.</em>
                  </div>
                  <div className="card-desc">
                    {l.last_synced_at
                      ? `Last synced ${new Date(l.last_synced_at).toLocaleDateString()}`
                      : 'Not synced yet — open the archive to begin.'}
                  </div>
                  {l.grace_period_ends_at && (
                    <div style={{
                      fontFamily: 'var(--mono)', fontSize: '.6rem',
                      letterSpacing: '.18em', textTransform: 'uppercase',
                      color: 'var(--rust, #a04830)',
                      marginTop: '.5rem',
                    }}>
                      Auto-deletes {new Date(l.grace_period_ends_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                  <div className="card-cta">
                    Open the archive <span className="card-arrow">→</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

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
                <div className="card-desc">Bookmarked almanac — open to view.</div>
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
      <div className="card-corner">Tour</div>
      <div className="card-roman">★</div>
      <div className="card-title">
        Demo <em>almanac.</em>
      </div>
      <div className="card-desc">
        See a finished almanac before building your own — a real league&apos;s seven-year history.
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


function YahooStatusBanner({ status }: { status: string }) {
  const isOk = status === 'connected'
  const messages: Record<string, string> = {
    connected: 'Yahoo connected. You can now create archives from your Yahoo leagues.',
    state_mismatch: 'Yahoo connect failed — security check did not match. Try again.',
    token_exchange_failed: 'Yahoo connect failed — could not exchange the auth code. Try again.',
    save_failed: 'Yahoo connect partially succeeded — could not save tokens. Try again.',
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
