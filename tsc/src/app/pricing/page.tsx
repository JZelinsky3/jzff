import type { Viewport } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import {
  TIER_LABELS,
  TIER_LIMITS,
  TIER_PRICES,
  getUserSubscription,
  isSubscriptionActive,
  isCompUser,
} from '@/lib/stripe'
import { PricingCards } from './pricing-cards'
import { PricingViewTabs } from './pricing-view-tabs'
import { MobilePricing } from './MobilePricing'
import { PLAN_FEATURES, FREE_MULTIPLE_LEAGUES_DETAIL } from '@/lib/planFeatures'

// Mobile pricing renders at 1:1.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? '10')

export default async function PricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ back?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Read the persisted view choice (cookie set by PricingViewTabs).
  // Reading server-side means the right tab is rendered in the initial
  // HTML — no useEffect flash, no Safari localStorage quirks.
  const viewCookie = (await cookies()).get('tsc-pricing-view')?.value
  const initialView: 'paid' | 'free' = viewCookie === 'free' ? 'free' : 'paid'

  // ?back=<path> — set by the locked-page overlay so the masthead's
  // back arrow returns the user to the chapter they came from instead
  // of the dashboard. Same-origin path only (must start with `/` and
  // not `//`) to keep this from being an open-redirect surface.
  const rawBack = (await searchParams)?.back
  const backHref =
    rawBack && rawBack.startsWith('/') && !rawBack.startsWith('//')
      ? rawBack
      : (user ? '/dashboard' : '/')

  // If they're already subscribed, show the pricing page with their current
  // tier highlighted as "Current plan" and the other(s) as "Switch to".
  const sub = user ? await getUserSubscription(user.id) : null
  const hasActive = isSubscriptionActive(sub)
  const lifetime = !!user && (await isCompUser(user.id))

  if ((await getViewMode()) === 'mobile') {
    return (
      <MobilePricing
        signedIn={!!user}
        signedInName={user?.email ?? null}
        hasActive={hasActive}
        currentTier={hasActive && sub ? sub.tier : null}
        currentPeriod={hasActive && sub ? sub.billing_period : null}
        currentTierName={hasActive && sub ? TIER_LABELS[sub.tier].name : null}
        lifetime={lifetime}
        initialView={initialView}
        trialDays={TRIAL_DAYS}
        backHref={backHref}
      />
    )
  }

  return (
    <main>
      <nav className="nav">
        {/* History-aware back: returns to the actual previous page (e.g. a
            landing candidate), falling back to ?back= / dashboard / home. */}
        <BackButton fallbackHref={backHref} ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">Pricing</div>
          <div className="nav-title">The <em>plans.</em></div>
        </div>
        <div className="pricing-nav-right">
          <Link href="/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Home</span>
          </Link>
          <Link href="/pricing/plans" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Plans</span>
          </Link>
          {user ? (
            <Link href="/dashboard" className="pricing-nav-cta">
              Library <span className="pricing-nav-cta-arrow" aria-hidden>→</span>
            </Link>
          ) : (
            <Link href="/login" className="pricing-nav-cta">
              Login <span className="pricing-nav-cta-arrow" aria-hidden>→</span>
            </Link>
          )}
        </div>
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
              Your account has lifetime access: unlimited leagues, no billing, no expiration.
              Nothing to manage on this page.
            </p>
            <Link href="/dashboard" className="dc-btn" style={{ marginTop: '1.25rem' }}>← Back to your library</Link>
          </div>
        </div>
      ) : (
      <PricingViewTabs
        initialView={initialView}
        paid={
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
                  'First look: Sunday Live, the game-day companion',
                ],
              },
            ]}
          />
        }
        free={
          <section className="section pricing-free-strip pricing-free-strip-narrow" aria-labelledby="pricing-free-h">
            <div className="pricing-free-card">
              {/* Cream badge — counterpart to the paid Veteran card's
                  gold "Most popular" flag. Signals that Free is its own
                  featured option, not a fallback. */}
              <div className="pricing-free-flag">★ Free forever ★</div>
              <div className="pricing-free-head">
                <div className="pricing-free-kicker">★ Tier 0 · Free forever</div>
                <h3 className="pricing-free-name" id="pricing-free-h">
                  UDFA.
                </h3>
                <div className="pricing-free-tagline">
                  Try the chronicle with no card.
                </div>
              </div>

              <div className="pricing-free-price">
                <span className="pricing-free-price-amount">$0</span>
                <span className="pricing-free-price-per">/mo</span>
              </div>

              {/* /pricing shows only what UDFA includes — all ticked.
                  The full "here's what you're missing" comparison lives
                  on /pricing/plans. Single source of truth: PLAN_FEATURES.
                  "Archive 1 league" is prepended as a UDFA-specific row
                  since the paid feature list calls this "Multiple leagues"
                  and reads from per-tier limits. */}
              <ul className="pricing-free-list">
                <li>
                  <span className="pricing-free-mark is-yes" aria-hidden>✓</span>
                  <span className="pricing-free-body">
                    <span className="pricing-free-feat-label">Archive 1 league</span>
                    <span className="pricing-free-feat-detail">
                      Your league, bound forever. No card, no expiration.
                    </span>
                  </span>
                </li>
                {PLAN_FEATURES.filter((f) => f.includedFree).map((f) => {
                  const detail = f.detailFree
                    ?? (typeof f.detail === 'function' ? f.detail('tier2') : f.detail)
                  return (
                    <li key={f.label}>
                      <span className="pricing-free-mark is-yes" aria-hidden>✓</span>
                      <span className="pricing-free-body">
                        <span className="pricing-free-feat-label">{f.label}</span>
                        <span className="pricing-free-feat-detail">{detail}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>

              {/* CTA varies by auth + plan state:
                  - Logged out → "Start free →" → signup
                  - Logged in & no active sub (UDFA) → "Continue →" → dashboard
                  - Logged in & active paid sub → small info + Manage link;
                    we don't push them to downgrade themselves. */}
              <div className="pricing-free-cta">
                {!user && (
                  <Link href="/login?mode=signup" className="dc-btn-ghost">
                    Start free →
                  </Link>
                )}
                {user && !hasActive && (
                  <Link href="/dashboard" className="dc-btn-ghost">
                    Continue →
                  </Link>
                )}
                {user && hasActive && sub && (
                  <div className="pricing-free-paid-note">
                    <span className="pricing-free-paid-note-label">
                      You&apos;re on {TIER_LABELS[sub.tier].name}
                    </span>
                    <Link href="/account" className="pricing-free-paid-link">
                      Manage →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </section>
        }
      />
      )}

      {/* Plans is the side-by-side feature comparison — pricing visitors
          who can't tell the tiers apart from the cards above can jump
          here to see what each plan includes (or doesn't) row by row.
          Centered ghost button so it reads as a quiet aside, not a
          competing primary CTA. */}
      <div className="section" style={{ textAlign: 'center', marginTop: '1.25rem' }}>
        <Link
          href="/pricing/plans"
          className="dc-btn-ghost"
          style={{ fontSize: '.7rem', padding: '.55rem 1.15rem' }}
        >
          Compare all plans
        </Link>
      </div>

      <div className="section" style={{ textAlign: 'center', marginTop: '1.25rem' }}>
        <p style={{ opacity: 0.55, fontSize: '.8rem', lineHeight: 1.6, maxWidth: '38rem', margin: '0 auto' }}>
          All payments processed by <span className="text-gold">Stripe</span>. Prices in USD.
          Your card isn&apos;t charged until the free trial ends. You can cancel any time
          before then from the customer portal.
        </p>
      </div>

      <SiteFooter />
    </main>
  )
}
