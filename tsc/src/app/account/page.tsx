import { redirect } from 'next/navigation'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { MobileProfile } from '@/components/account/MobileProfile'
import { createClient } from '@/lib/supabase/server'
import { getUserSubscription, isCompUser, TIER_LABELS } from '@/lib/stripe'
import { getViewMode } from '@/lib/viewMode'
import { AccountForms } from './account-forms'
import { AccountNavMenu } from './account-nav-menu'

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
  // Fetch the owned-leagues list (for the nav menu) and the member code in one
  // round-trip alongside the subscription. The same query covers both
  // leagueCount (for the subscription card) and the nav-menu options below.
  const [leaguesRes, sub, profileRes] = await Promise.all([
    supabase
      .from('leagues')
      .select('slug, name, created_at')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false }),
    getUserSubscription(user.id),
    supabase.from('profiles').select('member_code, referral_source, referral_source_other').eq('id', user.id).single(),
  ])
  const navLeagues = (leaguesRes.data ?? []).map((l) => ({
    slug: l.slug as string,
    name: l.name as string,
  }))
  const leagueCount = navLeagues.length
  const memberCode = (profileRes.data?.member_code as string | undefined) ?? ''
  const referralSource = (profileRes.data?.referral_source as string | null | undefined) ?? null
  const referralOther = (profileRes.data?.referral_source_other as string | null | undefined) ?? ''
  // Provide tier label for the subscription card render; lib export is the
  // source of truth so we don't re-derive it in the client component.
  const tierLabel = sub ? TIER_LABELS[sub.tier].name : null
  const lifetime = await isCompUser(user.id)

  if ((await getViewMode()) === 'mobile') {
    return (
      <MobileProfile
        email={user.email ?? ''}
        memberCode={memberCode}
        marketingOptIn={marketingOptIn}
        leagueCount={leagueCount}
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
        referralSource={referralSource}
        referralOther={referralOther}
      />
    )
  }

  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref="/dashboard" ariaLabel="Back to your library" />
        <div className="nav-center">
          <div className="nav-kicker">Account</div>
          <div className="nav-title">Your <em>profile.</em></div>
        </div>
        <AccountNavMenu leagues={navLeagues} />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Account &amp; subscription ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}>
          The <em>Chronicler.</em>
        </h1>
        <p className="hero-sub">
          Your plan, email, password, and what we send you. All of it lives on the card.
        </p>
      </section>

      <AccountForms
        email={user.email ?? ''}
        memberCode={memberCode}
        memberSince={new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        marketingOptIn={marketingOptIn}
        leagueCount={leagueCount}
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
        referralSource={referralSource}
        referralOther={referralOther}
      />

      <SiteFooter />
    </main>
  )
}
