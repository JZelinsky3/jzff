import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { TIER_LABELS, TIER_LIMITS, TIER_PRICES, type Tier } from '@/lib/stripe'
import { PricingViewTabs } from '../pricing-view-tabs'
import { PLAN_FEATURES, FREE_MULTIPLE_LEAGUES_DETAIL } from '@/lib/planFeatures'

export const metadata: Metadata = {
  title: 'Compare plans — The Sunday Chronicle',
  description:
    'Side-by-side comparison of the three Sunday Chronicle plans — Rookie, Veteran, and All-Pro. League counts, weekly recaps, and every other feature, with what each tier includes (or doesn\'t).',
  alternates: { canonical: 'https://jzff.online/pricing/plans/' },
}

// Each row in the comparison table = one feature. `included` says which
// tiers it's part of; non-included tiers render the same row but greyed
// out, so the visitor sees the complete picture and can spot the
// upgrade lines easily. `detail` can be a static string OR a per-tier
// function so rows like 'Multiple leagues' can show this card's exact
// count instead of repeating the full ladder.
type Feature = {
  label: string
  detail: string | ((t: Tier) => string)
  included: Record<Tier, boolean>
}

const FEATURES: Feature[] = [
  {
    label: 'League archive',
    detail: 'Standings, season archives, drafts, records, manager dossiers, rivalries.',
    included: { tier1: true, tier2: true, tier3: true },
  },
  {
    label: 'Every platform',
    detail: 'Sleeper, ESPN, NFL.com, Yahoo — stitch a league together across all of them.',
    included: { tier1: true, tier2: true, tier3: true },
  },
  {
    label: 'In-season auto-sync',
    detail: 'Standings + weekly matchups refresh automatically through the playoffs.',
    included: { tier1: true, tier2: true, tier3: true },
  },
  {
    label: "Pick'ems & Power Rankings",
    detail: "Weekly pick'em board and power-ranking ballots, scored automatically.",
    included: { tier1: true, tier2: true, tier3: true },
  },
  {
    label: '7-day free trial',
    detail: 'Every plan. Cancel anytime before the trial ends — no charge.',
    included: { tier1: true, tier2: true, tier3: true },
  },
  {
    label: 'Weekly recaps',
    detail: "A short written recap of each week's slate, drawn from your league's data.",
    included: { tier1: false, tier2: true, tier3: true },
  },
  {
    label: 'Trade recaps',
    detail: 'A recap of every trade when it happens, plus a four-week revisit checking how it actually played out.',
    included: { tier1: false, tier2: true, tier3: true },
  },
  {
    label: 'Manager DNA',
    detail: 'Every manager auto-classified into an archetype — Trade Hawk, Coin-Flipper, Set-and-Forget, more — from their actual transactions, lineups, and draft history.',
    included: { tier1: false, tier2: true, tier3: true },
  },
  {
    label: 'Best Coach Board',
    detail: 'Every starting lineup graded against its optimal version. Season-long efficiency standings plus a running tally of the worst single-week benchings.',
    included: { tier1: false, tier2: true, tier3: true },
  },
  {
    label: 'Multiple leagues',
    // Rookie's check intentionally false — 'multiple' implies >1. Each
    // card shows only its own league count, not the whole ladder.
    detail: (t) => {
      const n = TIER_LIMITS[t]
      if (n === 1) return '1 league.'
      return `Up to ${n} on ${TIER_LABELS[t].name}.`
    },
    included: { tier1: false, tier2: true, tier3: true },
  },
  {
    label: 'Early access',
    detail:
      'Every new feature lands on All-Pro first — Sunday Live, the game-day companion, today; the Manager Hub coming soon.',
    included: { tier1: false, tier2: false, tier3: true },
  },
]

const TIERS: Tier[] = ['tier1', 'tier2', 'tier3']

function priceLine(t: Tier) {
  const m = TIER_PRICES[t].monthly
  const y = TIER_PRICES[t].yearly
  return `$${Math.round(m.amountCents / 100)}/mo · $${Math.round(y.amountCents / 100)}/yr`
}

function leagueLine(t: Tier) {
  const n = TIER_LIMITS[t]
  return n === 1 ? '1 league' : `Up to ${n} leagues`
}

export default async function PlansPage() {
  // Server-side cookie read so the initial HTML renders the tab the
  // visitor last selected — same source of truth as /pricing.
  const viewCookie = (await cookies()).get('tsc-pricing-view')?.value
  const initialView: 'paid' | 'free' = viewCookie === 'free' ? 'free' : 'paid'
  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref="/pricing" ariaLabel="Back to pricing" />
        <div className="nav-center">
          <div className="nav-kicker">Plans · The Sunday Chronicle</div>
          <div className="nav-title">TS<em>C.</em></div>
        </div>
        <div className="pricing-nav-right">
          <Link href="/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Home</span>
          </Link>
          <Link href="/pricing" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Pricing</span>
          </Link>
          <Link href="/login" className="pricing-nav-cta">
            Login <span className="pricing-nav-cta-arrow" aria-hidden>→</span>
          </Link>
        </div>
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Plans · feature by feature ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.2rem, 5.5vw, 3.8rem)' }}>
          Compare <em>the three.</em>
        </h1>
        <p className="hero-sub" style={{ maxWidth: '62ch', margin: '0 auto' }}>
          Every plan unlocks the full chronicle — archives, drafts, records, pick&apos;ems. The
          differences: how many leagues you can archive, and the auto-generated extras —
          weekly recaps, trade recaps, and the Manager DNA lab.
        </p>
      </section>

      <div className="plans-page-body" style={{ maxWidth: '1180px', margin: '0 auto' }}>
        <PricingViewTabs
          initialView={initialView}
          paid={
            <div className="plans-paid-view">
              <div className="plans-grid">
                {TIERS.map((t, i) => {
                  const featured = t === 'tier2'
                  const numeral = ['I', 'II', 'III'][i]
                  const prev = i > 0 ? TIERS[i - 1] : null
                  return (
                    <div key={t} className={`plans-card${featured ? ' is-featured' : ''}`}>
                      {featured && <div className="plans-card-flag">★ Most popular ★</div>}
                      <div className="plans-card-num">{numeral}</div>
                      <div className="plans-card-name">{TIER_LABELS[t].name}</div>
                      <div className="plans-card-price">{priceLine(t)}</div>
                      <div className="plans-card-leagues">{leagueLine(t)}</div>

                      <ul className="plans-feat-list">
                        {/* Mobile-only summary line (display: none on desktop).
                            Rows the previous tier already includes collapse
                            into this on phones so stacked cards stop
                            repeating the same ten features three times. */}
                        {prev && (
                          <li className="plans-feat-inherit">
                            Everything in {TIER_LABELS[prev].name}, plus —
                          </li>
                        )}
                        {FEATURES.map((f) => {
                          const inc = f.included[t]
                          const detail = typeof f.detail === 'function' ? f.detail(t) : f.detail
                          // Inherited = already included on the previous tier,
                          // so the mobile view folds it into the line above.
                          // Function details (Multiple leagues) are per-tier
                          // and always stay visible.
                          const inherited =
                            !!prev && inc && f.included[prev] && typeof f.detail !== 'function'
                          return (
                            <li
                              key={f.label}
                              className={`plans-feat${inc ? '' : ' is-excluded'}${inherited ? ' is-inherited' : ''}`}
                            >
                              <span className="plans-feat-mark" aria-hidden="true">
                                {inc ? '✓' : '—'}
                              </span>
                              <span className="plans-feat-body">
                                <span className="plans-feat-label">{f.label}</span>
                                <span className="plans-feat-detail">{detail}</span>
                              </span>
                            </li>
                          )
                        })}
                      </ul>

                      <Link href="/pricing" className={`plans-card-cta${featured ? ' is-featured' : ''}`}>
                        Start {TIER_LABELS[t].name} →
                      </Link>
                    </div>
                  )
                })}
              </div>

              <p className="plans-foot">
                Same chronicle, different reach. Upgrade or downgrade anytime — leagues over your new
                plan&apos;s cap stay viewable but go read-only until you reduce or upgrade.
              </p>
            </div>
          }
          free={
            <section className="pricing-free-strip" aria-labelledby="plans-free-h">
              <div className="pricing-free-card">
                <div className="pricing-free-flag">★ Free forever ★</div>
                <div className="pricing-free-head">
                  <div className="pricing-free-kicker">★ Tier 0 · Free forever</div>
                  <h3 className="pricing-free-name" id="plans-free-h">
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

                {/* Same label + description rows as the comparison
                    table above, with UDFA's inclusion mapping. Both
                    surfaces read from PLAN_FEATURES so changes stay
                    in sync. */}
                <ul className="pricing-free-list">
                  {PLAN_FEATURES.map((f) => {
                    // Free card prefers detailFree for partial features
                    // (e.g. League archive). Multiple leagues row is
                    // special-cased because its detail is a per-tier
                    // function that doesn't apply to UDFA.
                    const detail = f.label === 'Multiple leagues'
                      ? FREE_MULTIPLE_LEAGUES_DETAIL
                      : f.detailFree
                        ?? (typeof f.detail === 'function' ? f.detail('tier2') : f.detail)
                    return (
                      <li key={f.label}>
                        <span
                          className={`pricing-free-mark ${f.includedFree ? 'is-yes' : 'is-no'}`}
                          aria-hidden
                        >
                          {f.includedFree ? '✓' : '—'}
                        </span>
                        <span className="pricing-free-body">
                          <span className="pricing-free-feat-label">{f.label}</span>
                          <span className="pricing-free-feat-detail">{detail}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>

                <div className="pricing-free-cta">
                  <Link href="/login?mode=signup" className="dc-btn-ghost">
                    Start free →
                  </Link>
                </div>
              </div>
            </section>
          }
        />
      </div>

      <SiteFooter />
    </main>
  )
}
