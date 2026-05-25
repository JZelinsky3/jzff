import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import {
  TIER_LABELS,
  TIER_LIMITS,
  TIER_PRICES,
  getUserSubscription,
  isSubscriptionActive,
  isLifetimeUser,
} from '@/lib/stripe'
import { PricingCards } from './pricing-cards'

const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? '10')

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If they're already subscribed, show the pricing page with their current
  // tier highlighted as "Current plan" and the other(s) as "Switch to".
  const sub = user ? await getUserSubscription(user.id) : null
  const hasActive = isSubscriptionActive(sub)
  const lifetime = !!user && isLifetimeUser(user.id)

  return (
    <main>
      <nav className="nav">
        <Link href={user ? '/dashboard' : '/'} className="dc-nav-icon" aria-label="Back">
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <div className="nav-center">
          <div className="nav-kicker">Pricing</div>
          <div className="nav-title">The <em>plans.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: 'hidden' }} />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Subscription ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}>
          Built to <em>last.</em>
        </h1>
        <p className="hero-sub">
          {TRIAL_DAYS}-day free trial on every plan. Cancel anytime. Yearly saves you six months
          compared to paying monthly.
        </p>
        {lifetime ? (
          <div className="hero-meta">
            <strong style={{ color: 'var(--gold)' }}>Lifetime access.</strong> You don&apos;t need a plan.
          </div>
        ) : hasActive && sub ? (
          <div className="hero-meta">
            You&apos;re currently on <strong>{TIER_LABELS[sub.tier].name}</strong> ({sub.billing_period}).
          </div>
        ) : null}
      </section>

      {lifetime ? (
        <div className="section" style={{ maxWidth: '560px', margin: '0 auto' }}>
          <div className="dc-card-static" style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.4rem' }}>You&apos;re comped.</div>
            <p style={{ opacity: 0.7, marginTop: '.6rem', fontSize: '.95rem', lineHeight: 1.6 }}>
              Your account has lifetime access — unlimited leagues, no billing, no expiration.
              Nothing to manage on this page.
            </p>
            <Link href="/dashboard" className="dc-btn" style={{ marginTop: '1.25rem' }}>← Back to your library</Link>
          </div>
        </div>
      ) : (
      <PricingCards
        signedIn={!!user}
        currentTier={hasActive && sub ? sub.tier : null}
        currentPeriod={hasActive && sub ? sub.billing_period : null}
        trialDays={TRIAL_DAYS}
        tiers={[
          {
            tier: 'tier1',
            name: TIER_LABELS.tier1.name,
            tagline: TIER_LABELS.tier1.tagline,
            limit: TIER_LIMITS.tier1,
            monthly: TIER_PRICES.tier1.monthly,
            yearly: TIER_PRICES.tier1.yearly,
            features: [
              'Archive 1 league',
              'Full season history walk',
              'Public almanac per league',
              'Pick&apos;ems + power rankings',
              'Weekly cron auto-sync',
            ],
          },
          {
            tier: 'tier2',
            name: TIER_LABELS.tier2.name,
            tagline: TIER_LABELS.tier2.tagline,
            limit: TIER_LIMITS.tier2,
            monthly: TIER_PRICES.tier2.monthly,
            yearly: TIER_PRICES.tier2.yearly,
            features: [
              'Archive up to 5 leagues',
              'Everything in Rookie',
              'Run multiple leagues from one account',
              'Priority on platform integrations',
            ],
            highlight: true,
          },
          {
            tier: 'tier3',
            name: TIER_LABELS.tier3.name,
            tagline: TIER_LABELS.tier3.tagline,
            limit: TIER_LIMITS.tier3,
            monthly: TIER_PRICES.tier3.monthly,
            yearly: TIER_PRICES.tier3.yearly,
            features: [
              'Unlimited leagues',
              'Everything in Veteran',
              'First in line for new platform integrations',
            ],
          },
        ]}
      />
      )}

      <div className="section" style={{ textAlign: 'center', marginTop: '2rem' }}>
        <p style={{ opacity: 0.55, fontSize: '.8rem', lineHeight: 1.6, maxWidth: '38rem', margin: '0 auto' }}>
          All payments processed by <span className="text-gold">Stripe</span>. Prices in USD.
          Your card isn&apos;t charged until the free trial ends — you can cancel any time
          before then from the customer portal.
        </p>
      </div>

      <SiteFooter />
    </main>
  )
}
