import Link from 'next/link'
import type { Tier, BillingPeriod } from '@/lib/stripe'
import { TIER_LABELS, TIER_LIMITS, TIER_PRICES } from '@/lib/stripe'
import { MobilePricingCards } from './mobile-pricing-cards'
import { PricingViewTabs } from './pricing-view-tabs'
import { PLAN_FEATURES, FREE_MULTIPLE_LEAGUES_DETAIL } from '@/lib/planFeatures'

// App-style mobile pricing screen. Single column, segmented Paid/Free,
// pill period toggle, stacked tier cards with one CTA each.
export function MobilePricing({
  signedIn,
  signedInName,
  hasActive,
  currentTier,
  currentPeriod,
  currentTierName,
  lifetime,
  initialView,
  trialDays,
  backHref,
}: {
  signedIn: boolean
  signedInName: string | null
  hasActive: boolean
  currentTier: Tier | null
  currentPeriod: BillingPeriod | null
  currentTierName: string | null
  lifetime: boolean
  initialView: 'paid' | 'free'
  trialDays: number
  backHref: string
}) {
  return (
    <main className="mpricing">
      <header className="mpricing-bar">
        <Link href={backHref} className="mpricing-bar-back" aria-label="Back">
          <svg viewBox="0 0 8 14" width="11" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <span className="mpricing-bar-title">The <em>plans.</em></span>
        <Link href={signedIn ? '/dashboard' : '/login'} className="mpricing-bar-link">
          {signedIn ? 'Library' : 'Login'}
        </Link>
      </header>

      <section className="mpricing-hero">
        <div className="mpricing-sup">★ Subscription ★</div>
        <h1 className="mpricing-title">Built to <em>last.</em></h1>
        <p className="mpricing-sub">
          {trialDays}-day free trial on every plan. Cancel anytime. Yearly saves you six
          months versus monthly.
        </p>
        {lifetime ? (
          <div className="mpricing-meta is-gold">
            <strong>Lifetime access.</strong> You don&apos;t need a plan.
          </div>
        ) : hasActive && currentTierName ? (
          <div className="mpricing-meta">
            You&apos;re on <strong>{currentTierName}</strong> ({currentPeriod}).
          </div>
        ) : null}
      </section>

      {lifetime ? (
        <section className="mpricing-lifetime">
          <div className="mpricing-lifetime-card">
            <div className="mpricing-lifetime-title">You&apos;re comped.</div>
            <p>Your account has lifetime access — unlimited leagues, no billing, no
              expiration. Nothing to manage here.</p>
            <Link href="/dashboard" className="mpricing-lifetime-cta">Back to library</Link>
          </div>
        </section>
      ) : (
        <PricingViewTabs
          initialView={initialView}
          paid={
            <MobilePricingCards
              signedIn={signedIn}
              currentTier={hasActive ? currentTier : null}
              currentPeriod={hasActive ? currentPeriod : null}
              trialDays={trialDays}
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
                    'Archive up to 3 leagues',
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
                    '10 fully customizable leagues',
                    'Everything in Veteran',
                    'Early access to all new features',
                    'First look: Sunday Live',
                  ],
                },
              ]}
            />
          }
          free={
            <section className="mpricing-free">
              <div className="mpricing-free-card">
                <div className="mpricing-free-flag">★ Free forever ★</div>
                <div className="mpricing-free-kicker">Tier 0 · No card required</div>
                <h3 className="mpricing-free-name">UDFA.</h3>
                <div className="mpricing-free-tag">Try the chronicle with no card.</div>
                <div className="mpricing-free-price">
                  <span className="mpricing-free-amt">$0</span>
                  <span className="mpricing-free-per">/mo</span>
                </div>
                <ul className="mpricing-free-list">
                  <li>
                    <span className="mpricing-free-mark" aria-hidden>✓</span>
                    <span>
                      <strong>Archive 1 league</strong>
                      <em>Your league, bound forever. No card, no expiration.</em>
                    </span>
                  </li>
                  {PLAN_FEATURES.filter((f) => f.includedFree).map((f) => {
                    const detail = f.detailFree
                      ?? (typeof f.detail === 'function' ? f.detail('tier2') : f.detail)
                    return (
                      <li key={f.label}>
                        <span className="mpricing-free-mark" aria-hidden>✓</span>
                        <span>
                          <strong>{f.label}</strong>
                          <em>{detail}</em>
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {!signedIn && (
                  <Link href="/login?mode=signup" className="mpricing-free-cta">
                    Start free
                  </Link>
                )}
                {signedIn && !hasActive && (
                  <Link href="/dashboard" className="mpricing-free-cta">
                    Continue
                  </Link>
                )}
                {signedIn && hasActive && currentTierName && (
                  <div className="mpricing-free-note">
                    You&apos;re on {currentTierName} ·{' '}
                    <Link href="/account">Manage</Link>
                  </div>
                )}
              </div>
            </section>
          }
        />
      )}

      <div className="mpricing-compare">
        <Link href="/pricing/plans" className="mpricing-compare-link">
          Compare all plans
        </Link>
      </div>

      <p className="mpricing-foot">
        All payments processed by Stripe. Prices in USD. Your card isn&apos;t charged
        until the trial ends — cancel anytime from the customer portal.
      </p>

      <footer className="mpricing-bottom">
        <Link href="/api/view/?mode=desktop&to=/pricing" className="mpricing-bottom-link">
          View desktop site
        </Link>
        <span className="mpricing-bottom-sep">·</span>
        <Link href="/" className="mpricing-bottom-link">Home</Link>
        <span className="mpricing-bottom-sep">·</span>
        <Link href="/about" className="mpricing-bottom-link">About</Link>
      </footer>
    </main>
  )
}
