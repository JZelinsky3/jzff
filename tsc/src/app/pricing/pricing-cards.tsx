'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Tier, BillingPeriod } from '@/lib/stripe'

type Price = { amountCents: number; perLabel: string }
type TierCard = {
  tier: Tier
  name: string
  tagline: string
  limit: number
  monthly: Price
  yearly: Price
  features: string[]
  highlight?: boolean
}

export function PricingCards({
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
      // Bounce through login first, then come back here. Login form already
      // honors ?next= for post-auth redirect.
      router.push(`/login?next=${encodeURIComponent('/pricing')}`)
      return
    }
    setBusy(tier); setErr(null)
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tier, period }),
    })
    const body = await res.json()
    if (!res.ok || !body?.url) {
      setBusy(null)
      setErr(body?.error ?? 'Could not start checkout — try again in a moment.')
      return
    }
    // Hand the browser off to Stripe's hosted checkout.
    window.location.assign(body.url)
  }

  return (
    <div className="section">
      {/* Period toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
        <div role="tablist" aria-label="Billing period" style={{
          display: 'inline-flex',
          gap: '.25rem',
          padding: '.3rem',
          background: 'rgba(0,0,0,.3)',
          border: '1px solid var(--ink-line)',
          borderRadius: '999px',
        }}>
          {(['monthly', 'yearly'] as const).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '.55rem 1.2rem',
                borderRadius: '999px',
                border: 'none',
                background: period === p ? 'var(--gold)' : 'transparent',
                color: period === p ? 'var(--ink)' : 'var(--cream-soft)',
                fontFamily: 'var(--mono)',
                fontSize: '.72rem',
                letterSpacing: '.2em',
                textTransform: 'uppercase',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background .15s, color .15s',
              }}
            >
              {p === 'monthly' ? 'Monthly' : 'Yearly · save 50%'}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.5rem',
        maxWidth: '880px',
        margin: '0 auto',
      }}>
        {tiers.map((t) => {
          const price = period === 'monthly' ? t.monthly : t.yearly
          const isCurrent = currentTier === t.tier && currentPeriod === period
          const isOtherPeriodSameTier = currentTier === t.tier && currentPeriod !== period
          return (
            <div
              key={t.tier}
              style={{
                position: 'relative',
                padding: '2rem 1.75rem',
                background: 'linear-gradient(160deg, var(--ink-card), var(--ink-soft))',
                border: t.highlight ? '2px solid var(--gold)' : '1px solid var(--ink-line)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              {t.highlight && (
                <div style={{
                  position: 'absolute',
                  top: '-.7rem', right: '1.25rem',
                  background: 'var(--gold)',
                  color: 'var(--ink)',
                  padding: '.2rem .6rem',
                  fontFamily: 'var(--mono)',
                  fontSize: '.55rem',
                  letterSpacing: '.22em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  borderRadius: '2px',
                }}>
                  Most popular
                </div>
              )}
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', opacity: 0.6 }}>
                  {t.tier === 'tier1' ? 'Tier 1' : 'Tier 2'}
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', marginTop: '.3rem' }}>
                  {t.name}
                </div>
                <div style={{ opacity: 0.7, fontSize: '.9rem', marginTop: '.35rem' }}>
                  {t.tagline}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '.35rem' }}>
                <span style={{ fontFamily: 'var(--serif)', fontSize: '2.6rem', color: 'var(--gold)' }}>
                  ${(price.amountCents / 100).toFixed(0)}
                </span>
                <span style={{ opacity: 0.65, fontSize: '.9rem' }}>{price.perLabel}</span>
                {period === 'yearly' && (
                  <span style={{ marginLeft: '.5rem', fontSize: '.7rem', color: 'var(--gold)', opacity: .85 }}>
                    saves ${((t.monthly.amountCents * 12 - t.yearly.amountCents) / 100).toFixed(0)}/yr
                  </span>
                )}
              </div>

              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '.45rem',
                fontSize: '.88rem',
                opacity: 0.9,
              }}>
                {t.features.map((f, i) => (
                  <li key={i} style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--gold)', flexShrink: 0 }}>✓</span>
                    <span dangerouslySetInnerHTML={{ __html: f }} />
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => startCheckout(t.tier)}
                disabled={busy !== null || isCurrent}
                className={isCurrent ? 'dc-btn-ghost' : 'dc-btn'}
                style={{ marginTop: 'auto' }}
              >
                {isCurrent
                  ? 'Current plan'
                  : isOtherPeriodSameTier
                    ? `Switch to ${period} →`
                    : busy === t.tier
                      ? 'Opening Stripe…'
                      : signedIn
                        ? `Start ${trialDays}-day free trial →`
                        : 'Sign in to subscribe →'}
              </button>
            </div>
          )
        })}
      </div>

      {err && (
        <p className="dc-form-error" style={{ textAlign: 'center', marginTop: '1.5rem' }}>{err}</p>
      )}
    </div>
  )
}
