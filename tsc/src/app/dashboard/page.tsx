import Link from 'next/link'
import { OnboardingChecklist, type OnboardingStep } from '@/components/OnboardingChecklist'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import {
  getUserSubscription,
  isLifetimeUser,
  isSubscriptionActive,
  TIER_LABELS,
} from '@/lib/stripe'
import { LeagueCardMenu } from './league-card-menu'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, slug, platform, last_synced_at, published_at, created_at')
    .order('created_at', { ascending: false })

  // Subscription summary card: shows tier + renewal/end date so commish
  // doesn't have to hop to /account just to check. Lifetime users get a
  // simple comp badge instead.
  const subUserId = user?.id ?? null
  const comp = subUserId ? isLifetimeUser(subUserId) : false
  const sub = !comp && subUserId ? await getUserSubscription(subUserId) : null
  const subActive = isSubscriptionActive(sub)
  const subEndsLabel = formatSubEndsLabel(sub)
  const subTierName = sub ? TIER_LABELS[sub.tier]?.name ?? sub.tier : null

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
        {(comp || subActive) && (
          <Link
            href="/account"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '.5rem',
              marginTop: '1.25rem',
              padding: '.5rem .9rem',
              fontFamily: 'var(--mono)', fontSize: '.65rem',
              letterSpacing: '.2em', textTransform: 'uppercase',
              color: 'var(--cream-soft)', textDecoration: 'none',
              border: '1px solid var(--ink-line)', borderRadius: '2px',
            }}
            title="Manage subscription"
          >
            {comp ? (
              <>
                <span style={{ color: 'var(--gold)' }}>★ Comp</span>
                <span style={{ opacity: 0.6 }}>· Unlimited access</span>
              </>
            ) : (
              <>
                <span style={{ color: 'var(--gold)' }}>{subTierName}</span>
                {subEndsLabel && <span style={{ opacity: 0.7 }}>· {subEndsLabel}</span>}
              </>
            )}
          </Link>
        )}
      </section>

      <OnboardingChecklist
        storageKey="tsc_onb_dashboard"
        kicker="Welcome ★ Get started"
        title="Three steps to your"
        titleEm="archive."
        subtitle="Each step ticks itself off as you go."
        steps={onboardingSteps}
      />

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
              <div key={l.id} style={{ position: 'relative' }}>
                <LeagueCardMenu leagueId={l.id} leagueName={l.name} />
                <Link href={`/league/${l.slug}`} className="card" style={{ display: 'block' }}>
                  <div className="card-corner">{l.platform}</div>
                  <div className="card-roman">{l.name.charAt(0).toUpperCase()}</div>
                  <div className="card-title">
                    {splitName(l.name).head} <em>{splitName(l.name).tail}.</em>
                  </div>
                  <div className="card-desc">
                    {l.last_synced_at
                      ? `Last synced ${new Date(l.last_synced_at).toLocaleDateString()}`
                      : 'Not synced yet — open the archive to begin.'}
                  </div>
                  <div className="card-cta">
                    Open the archive <span className="card-arrow">→</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDemoCard && (
        <div className="section">
          <div className="section-header">
            <span className="section-num">§ 02 · See it live</span>
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
