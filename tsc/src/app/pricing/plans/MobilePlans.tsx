import Link from 'next/link'
import { TIER_LABELS, TIER_LIMITS, TIER_PRICES, type Tier } from '@/lib/stripe'
import { PricingViewTabs } from '../pricing-view-tabs'
import { PLAN_FEATURES, FREE_MULTIPLE_LEAGUES_DETAIL } from '@/lib/planFeatures'

type Feature = {
  label: string
  detail: string | ((t: Tier) => string)
  included: Record<Tier, boolean>
}

const FEATURES: Feature[] = [
  { label: 'League archive', detail: 'Standings, season archives, drafts, records, manager dossiers, rivalries.', included: { tier1: true, tier2: true, tier3: true } },
  { label: 'Every platform', detail: 'Sleeper, ESPN, NFL.com, Yahoo — stitch a league together across all of them.', included: { tier1: true, tier2: true, tier3: true } },
  { label: 'In-season auto-sync', detail: 'Standings + weekly matchups refresh automatically through the playoffs.', included: { tier1: true, tier2: true, tier3: true } },
  { label: "Pick'ems & Power Rankings", detail: "Weekly pick'em board and power-ranking ballots, scored automatically.", included: { tier1: true, tier2: true, tier3: true } },
  { label: '7-day free trial', detail: 'Every plan. Cancel anytime before the trial ends — no charge.', included: { tier1: true, tier2: true, tier3: true } },
  { label: 'Weekly recaps', detail: "A short written recap of each week's slate, drawn from your league's data.", included: { tier1: false, tier2: true, tier3: true } },
  { label: 'Trade recaps', detail: 'A recap of every trade when it happens, plus a four-week revisit checking how it actually played out.', included: { tier1: false, tier2: true, tier3: true } },
  { label: 'Manager DNA', detail: 'Every manager auto-classified into an archetype from their actual transactions, lineups, and draft history.', included: { tier1: false, tier2: true, tier3: true } },
  { label: 'Best Coach Board', detail: 'Every starting lineup graded against its optimal version. Season-long efficiency standings.', included: { tier1: false, tier2: true, tier3: true } },
  {
    label: 'Multiple leagues',
    detail: (t) => {
      const n = TIER_LIMITS[t]
      if (n === 1) return '1 league.'
      return `Up to ${n} on ${TIER_LABELS[t].name}.`
    },
    included: { tier1: false, tier2: true, tier3: true },
  },
  { label: 'Early access', detail: 'Every new feature lands on All-Pro first.', included: { tier1: false, tier2: false, tier3: true } },
  { label: 'Sunday Live', detail: 'First look at the live game-day companion.', included: { tier1: false, tier2: false, tier3: true } },
  { label: 'Manager Hub', detail: 'Your whole career, every league, one book. Coming soon.', included: { tier1: false, tier2: false, tier3: true } },
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

// App-style mobile plans/compare screen. The desktop table is impossible
// to read on a phone — this stacks each tier as a long card and only
// shows the lines that tier includes plus an "Adds on top of X" callout.
export function MobilePlans({
  initialView,
  backHref,
}: {
  initialView: 'paid' | 'free'
  backHref: string
}) {
  return (
    <main className="mplans">
      <header className="mplans-bar">
        <Link href={backHref} className="mplans-bar-back" aria-label="Back">
          <svg viewBox="0 0 8 14" width="11" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <span className="mplans-bar-title">The <em>plans.</em></span>
        <Link href="/pricing" className="mplans-bar-link">Pricing</Link>
      </header>

      <section className="mplans-hero">
        <div className="mplans-sup">★ Plans · feature by feature ★</div>
        <h1 className="mplans-title">Compare <em>the three.</em></h1>
        <p className="mplans-sub">
          Every plan unlocks the full chronicle. What changes: how many leagues you
          can archive, and the auto-generated extras — weekly recaps, trade recaps,
          Manager DNA, and the Best Coach Board.
        </p>
      </section>

      <PricingViewTabs
        initialView={initialView}
        paid={
          <div className="mplans-paid">
            <div className="mplans-stack">
              {TIERS.map((t, i) => {
                const featured = t === 'tier2'
                const numeral = ['I', 'II', 'III'][i]
                const prev = i > 0 ? TIERS[i - 1] : null
                return (
                  <div key={t} className={`mplans-card${featured ? ' is-featured' : ''}`}>
                    {featured && <span className="mplans-card-flag">★ Most popular ★</span>}
                    <div className="mplans-card-num">{numeral}</div>
                    <div className="mplans-card-name">{TIER_LABELS[t].name}</div>
                    <div className="mplans-card-price">{priceLine(t)}</div>
                    <div className="mplans-card-leagues">{leagueLine(t)}</div>

                    <ul className="mplans-feat">
                      {prev && (
                        <li className="mplans-feat-inherit">
                          Everything in {TIER_LABELS[prev].name}, plus —
                        </li>
                      )}
                      {FEATURES.map((f) => {
                        const inc = f.included[t]
                        const detail = typeof f.detail === 'function' ? f.detail(t) : f.detail
                        const inherited =
                          !!prev && inc && f.included[prev] && typeof f.detail !== 'function'
                        if (inherited) return null
                        return (
                          <li key={f.label} className={`mplans-feat-row${inc ? '' : ' is-excluded'}`}>
                            <span className="mplans-feat-mark" aria-hidden>{inc ? '✓' : '—'}</span>
                            <span className="mplans-feat-body">
                              <span className="mplans-feat-label">{f.label}</span>
                              <span className="mplans-feat-detail">{detail}</span>
                            </span>
                          </li>
                        )
                      })}
                    </ul>

                    <Link href="/pricing" className={`mplans-card-cta${featured ? ' is-featured' : ''}`}>
                      Start {TIER_LABELS[t].name}
                    </Link>
                  </div>
                )
              })}
            </div>

            <div className="mplans-pricing-link">
              <Link href="/pricing" className="mplans-pricing-btn">
                View pricing
              </Link>
            </div>

            <p className="mplans-foot">
              Same chronicle, different reach. Upgrade or downgrade anytime — leagues
              over your new plan&apos;s cap stay viewable but go read-only until you
              reduce or upgrade.
            </p>
          </div>
        }
        free={
          <section className="mplans-free">
            <div className="mplans-free-card">
              <div className="mplans-free-flag">★ Free forever ★</div>
              <div className="mplans-free-kicker">Tier 0 · No card required</div>
              <h3 className="mplans-free-name">UDFA.</h3>
              <div className="mplans-free-tag">Try the chronicle with no card.</div>
              <div className="mplans-free-price">
                <span className="mplans-free-amt">$0</span>
                <span className="mplans-free-per">/mo</span>
              </div>

              <ul className="mplans-free-list">
                {PLAN_FEATURES.map((f) => {
                  const detail = f.label === 'Multiple leagues'
                    ? FREE_MULTIPLE_LEAGUES_DETAIL
                    : f.detailFree
                      ?? (typeof f.detail === 'function' ? f.detail('tier2') : f.detail)
                  return (
                    <li key={f.label} className={f.includedFree ? '' : 'is-excluded'}>
                      <span className="mplans-free-mark" aria-hidden>
                        {f.includedFree ? '✓' : '—'}
                      </span>
                      <span>
                        <strong>{f.label}</strong>
                        <em>{detail}</em>
                      </span>
                    </li>
                  )
                })}
              </ul>

              <Link href="/login?mode=signup" className="mplans-free-cta">
                Start free
              </Link>
            </div>
          </section>
        }
      />

      <footer className="mplans-bottom">
        <Link href="/api/view/?mode=desktop&to=/pricing/plans" className="mplans-bottom-link">
          View desktop site
        </Link>
        <span className="mplans-bottom-sep">·</span>
        <Link href="/pricing" className="mplans-bottom-link">Pricing</Link>
        <span className="mplans-bottom-sep">·</span>
        <Link href="/" className="mplans-bottom-link">Home</Link>
      </footer>
    </main>
  )
}
