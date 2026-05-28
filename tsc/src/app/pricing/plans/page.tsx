import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { TIER_LABELS, TIER_LIMITS, TIER_PRICES, type Tier } from '@/lib/stripe'

export const metadata: Metadata = {
  title: 'Compare plans — The Sunday Chronicle',
  description:
    'Side-by-side comparison of the three Sunday Chronicle plans — Rookie, Veteran, and All-Pro. League counts, weekly recaps, and every other feature, with what each tier includes (or doesn\'t).',
  alternates: { canonical: 'https://jzff.online/pricing/plans/' },
}

// Each row in the comparison table = one feature. `included` says which
// tiers it's part of; non-included tiers render the same row but greyed
// out, so the visitor sees the complete picture and can spot the
// upgrade lines easily.
type Feature = {
  label: string
  detail: string
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
    detail: 'Weekly pick\'em board and power-ranking ballots, scored automatically.',
    included: { tier1: true, tier2: true, tier3: true },
  },
  {
    label: '10-day free trial',
    detail: 'Every plan. Cancel anytime before the trial ends — no charge.',
    included: { tier1: true, tier2: true, tier3: true },
  },
  {
    label: 'AI weekly recaps',
    detail: 'A short, voice-y recap of each week\'s slate generated from your league\'s data.',
    included: { tier1: false, tier2: true, tier3: true },
  },
  {
    label: 'Multiple leagues',
    detail: '1 league on Rookie · 3 on Veteran · 10 on All-Pro.',
    included: { tier1: true, tier2: true, tier3: true },
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

export default function PlansPage() {
  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref="/pricing" ariaLabel="Back to pricing" />
        <div className="nav-center">
          <div className="nav-kicker">Plans · The Sunday Chronicle</div>
          <div className="nav-title">TS<em>C.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: 'hidden' }} />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Plans · feature by feature ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.2rem, 5.5vw, 3.8rem)' }}>
          Compare <em>the three.</em>
        </h1>
        <p className="hero-sub" style={{ maxWidth: '62ch', margin: '0 auto' }}>
          Every plan unlocks the full chronicle — archives, drafts, records, pick&apos;ems. Two
          differences: how many leagues you can archive, and whether you get AI weekly recaps.
        </p>
      </section>

      <div className="section" style={{ maxWidth: '1180px', margin: '0 auto' }}>
        <div className="plans-grid">
          {TIERS.map((t, i) => {
            const featured = t === 'tier2'
            return (
              <div key={t} className={`plans-card${featured ? ' is-featured' : ''}`}>
                {featured && <div className="plans-card-flag">★ Most popular ★</div>}
                <div className="plans-card-num">{i + 1}</div>
                <div className="plans-card-name">{TIER_LABELS[t].name}</div>
                <div className="plans-card-price">{priceLine(t)}</div>
                <div className="plans-card-leagues">{leagueLine(t)}</div>

                <ul className="plans-feat-list">
                  {FEATURES.map((f) => {
                    const inc = f.included[t]
                    return (
                      <li key={f.label} className={`plans-feat${inc ? '' : ' is-excluded'}`}>
                        <span className="plans-feat-mark" aria-hidden="true">
                          {inc ? '✓' : '—'}
                        </span>
                        <span className="plans-feat-body">
                          <span className="plans-feat-label">{f.label}</span>
                          <span className="plans-feat-detail">{f.detail}</span>
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

      <SiteFooter />
    </main>
  )
}
