import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getUserSubscription, isLifetimeUser, TIER_LABELS } from '@/lib/stripe'
import { AccountForms } from './account-forms'

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { checkout } = await searchParams
  const justSubscribed = checkout === 'success'

  // Marketing opt-in lives in auth.users.user_metadata so we don't need a
  // schema migration to land this. Default to opted-in for new accounts.
  const marketingOptIn = user.user_metadata?.marketing_opt_in !== false
  const backupEmail = typeof user.user_metadata?.backup_email === 'string'
    ? user.user_metadata.backup_email as string
    : ''

  // Provider detection. Supabase's primary auth provider is in
  // app_metadata.provider; 'email' covers both password and magic-link users,
  // anything else (google/github/etc) means OAuth.
  const provider: string = user.app_metadata?.provider ?? 'email'
  const isOAuth = provider !== 'email'
  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1)

  // For email-provider accounts, track whether a password has actually been
  // set (magic-link sign-ins create accounts WITHOUT one). We flip this to
  // true in updatePassword.
  const hasPassword = user.user_metadata?.has_password_set === true

  // Count the user's leagues so the subscription card can show current usage
  // against the tier limit, and load the live subscription state from our
  // local mirror (last-known-good from Stripe webhooks).
  const [{ count: leagueCount }, sub] = await Promise.all([
    supabase
      .from('leagues')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id),
    getUserSubscription(user.id),
  ])
  // Provide tier label for the subscription card render; lib export is the
  // source of truth so we don't re-derive it in the client component.
  const tierLabel = sub ? TIER_LABELS[sub.tier].name : null
  const lifetime = isLifetimeUser(user.id)

  return (
    <main>
      <nav className="nav">
        <Link href="/dashboard" className="dc-nav-icon" aria-label="Back to your library">
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <div className="nav-center">
          <div className="nav-kicker">Account</div>
          <div className="nav-title">Your <em>profile.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: 'hidden' }} />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Account &amp; subscription ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}>
          The <em>signed-in.</em>
        </h1>
        <p className="hero-sub">
          Change your email, reset your password, manage what we send you,
          and (eventually) handle your subscription.
        </p>
        <div className="hero-meta">
          {user.email} · {leagueCount ?? 0} {(leagueCount ?? 0) === 1 ? 'league' : 'leagues'} on file
        </div>
      </section>

      <AccountForms
        email={user.email ?? ''}
        marketingOptIn={marketingOptIn}
        leagueCount={leagueCount ?? 0}
        isOAuth={isOAuth}
        providerLabel={providerLabel}
        hasPassword={hasPassword}
        backupEmail={backupEmail}
        subscription={sub ? {
          tier: sub.tier,
          tierLabel: tierLabel!,
          billingPeriod: sub.billing_period,
          status: sub.status,
          trialEndsAt: sub.trial_ends_at,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        } : null}
        lifetime={lifetime}
        justSubscribed={justSubscribed}
      />

      <SiteFooter />
    </main>
  )
}
