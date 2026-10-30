import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { MobileProfile } from '@/components/account/MobileProfile'
import { createClient } from '@/lib/supabase/server'
import { getUserSubscription, isCompUser, TIER_LABELS, advertisedTrialDays } from '@/lib/stripe'
import { compExpiryLabel } from '@/lib/siteAdmin'
import { getViewMode } from '@/lib/viewMode'
import { friendsWaiting } from '@/lib/friends'
import { publicNames } from '@/lib/minigames/boardIdentity'
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
    supabase.from('profiles').select('member_code, referral_source, referral_source_other, board_name').eq('id', user.id).single(),
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
  // Null for a permanent comp too, so it is only meaningful next to
  // `lifetime`. A time-limited comp used to render as "no expiration".
  const compEnds = lifetime ? await compExpiryLabel(user.id) : null
  // Follows the launch offer, so this card stops saying "7-day" the moment
  // the offer opens or the standard length changes.
  const trialDays = advertisedTrialDays()

  // Friends and the record book live on the games profile. This page only
  // points there, with a count if something is waiting on you.
  const boardName = (profileRes.data?.board_name as string | null | undefined) ?? ''
  const [waiting, shownAs] = await Promise.all([
    friendsWaiting(user.id),
    publicNames([user.id]).then((m) => m.get(user.id) ?? memberCode),
  ])

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
        compEnds={compEnds}
        justSubscribed={justSubscribed}
        referralSource={referralSource}
        referralOther={referralOther}
        boardName={boardName}
        shownAs={shownAs}
        waiting={waiting}
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
          Your card, your record book and your friends. Plan, email and password all live on the card.
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
        compEnds={compEnds}
        trialDays={trialDays}
        justSubscribed={justSubscribed}
        referralSource={referralSource}
        referralOther={referralOther}
        boardName={boardName}
        shownAs={shownAs}
      >
        <div className="section" id="games">
          <div className="section-header">
            <span className="section-num">§ 01 · Games</span>
            <span className="section-title">Your Games Profile</span>
            <span className="section-meta">{waiting ? `${waiting} waiting on you` : 'Friends and records'}</span>
          </div>
          <div className="dc-card-row">
            <div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>Friends and the Record Book</div>
              <div style={{ opacity: 0.65, fontSize: '.85rem', marginTop: '.35rem' }}>
                Your friends, your record against each of them and your best runs.
              </div>
            </div>
            <Link href="/games/pack-empire/profile/" className="dc-btn-ghost">
              Open
            </Link>
          </div>
        </div>
      </AccountForms>

      <SiteFooter />
    </main>
  )
}
