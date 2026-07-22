'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Tier, BillingPeriod } from '@/lib/stripe'

type Price = { amountCents: number; perLabel: string }
// Each feature can be a plain HTML string (regular bullet) or an object
// with a comingSoon flag — the latter renders dimmed with a small badge
// next to the label so the user knows the feature ships later.
type Feature = string | { label: string; comingSoon?: boolean }
type TierCard = {
  tier: Tier
  name: string
  tagline: string
  limit: number
  monthly: Price
  yearly: Price
  features: Feature[]
  highlight?: boolean
}

// Mobile-only paid pricing card stack — app-style layout:
//   • centered pill period toggle (Monthly / Yearly)
//   • stacked tier cards (Veteran highlighted)
//   • single primary CTA per card, sticky-feel checkout
// Reuses the same checkout endpoint as the desktop PricingCards.
export function MobilePricingCards({
  tiers,
  signedIn,
  currentTier,
  currentPeriod,
  trialDays,
}: {
  tiers: TierCard[]
  signedIn: boolean
  currentTier: Tier | null
  currentPeriod: BillingPeriod | null
  trialDays: number
}) {
  const [period, setPeriod] = useState<BillingPeriod>(currentPeriod ?? 'monthly')
  const router = useRouter()
  const [busy, setBusy] = useState<Tier | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function startCheckout(tier: Tier) {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent('/pricing')}`)
      return
    }
    setBusy(tier); setErr(null)
    const res = await fetch('/api/stripe/checkout/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tier, period }),
    })
    const body = await res.json()
    if (!res.ok || !body?.url) {
      setBusy(null)
      setErr(body?.error ?? 'Could not start checkout. Try again in a moment.')
      return
    }
    window.location.assign(body.url)
  }

  return (
    <div className="mpricing-paid">
      <div className="mpricing-period">
        {(['monthly', 'yearly'] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className={`mpricing-period-btn${period === p ? ' is-active' : ''}`}
          >
            {p === 'monthly' ? 'Monthly' : 'Yearly'}
            {p === 'yearly' && <span className="mpricing-period-save">Save 6 mo</span>}
          </button>
        ))}
      </div>

      <div className="mpricing-swipe-hint" aria-hidden>
        <span className="mpricing-swipe-arrow">‹</span>
        <span>Swipe to compare {tiers.length} tiers</span>
        <span className="mpricing-swipe-arrow">›</span>
      </div>

      <div className="mpricing-stack">
        {tiers.map((card) => {
          const price = period === 'monthly' ? card.monthly : card.yearly
          const dollars = Math.round(price.amountCents / 100)
          const isCurrent = currentTier === card.tier && currentPeriod === period
          const ctaLabel = isCurrent
            ? 'Current plan'
            : currentTier
              ? `Switch to ${card.name}`
              : (signedIn ? `Start ${card.name}` : `Start ${trialDays}-day trial`)
          return (
            <div
              key={card.tier}
              className={`mpricing-card${card.highlight ? ' is-featured' : ''}${isCurrent ? ' is-current' : ''}`}
            >
              {card.highlight && <span className="mpricing-card-flag">★ Most popular ★</span>}
              <div className="mpricing-card-head">
                <span className="mpricing-card-kicker">{card.tagline}</span>
                <h3 className="mpricing-card-name">{card.name}</h3>
              </div>
              <div className="mpricing-card-price">
                <span className="mpricing-card-price-amt">${dollars}</span>
                <span className="mpricing-card-price-per">{price.perLabel}</span>
              </div>
              <div className="mpricing-card-leagues">
                {card.limit === 1 ? '1 league' : `Up to ${card.limit} leagues`}
              </div>
              <ul className="mpricing-card-feat">
                {card.features.map((f) => {
                  const label = typeof f === 'string' ? f : f.label
                  const soon = typeof f === 'object' && f.comingSoon
                  return (
                    <li key={label} className={soon ? 'is-coming-soon' : undefined}>
                      <span className="mpricing-card-feat-mark" aria-hidden>✓</span>
                      <span>
                        <span dangerouslySetInnerHTML={{ __html: label }} />
                        {soon && <span className="mpricing-card-feat-soon">Coming soon</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                disabled={busy !== null || isCurrent}
                onClick={() => startCheckout(card.tier)}
                className={`mpricing-card-cta${card.highlight ? ' is-featured' : ''}`}
              >
                {busy === card.tier ? 'Loading…' : ctaLabel}
              </button>
            </div>
          )
        })}
      </div>

      {err && <p className="mpricing-err">{err}</p>}
    </div>
  )
}
