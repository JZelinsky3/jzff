'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateEmail, updatePassword, updateMarketingOptIn, updateBackupEmail } from './actions'

type Result = { ok: false; error: string } | { ok: true; message?: string } | null

type SubscriptionSummary = {
  tier: 'tier1' | 'tier2'
  tierLabel: string
  billingPeriod: 'monthly' | 'yearly'
  status: string
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export function AccountForms({
  email,
  marketingOptIn,
  leagueCount,
  isOAuth,
  providerLabel,
  hasPassword,
  backupEmail,
  subscription,
  lifetime,
  justSubscribed,
}: {
  email: string
  marketingOptIn: boolean
  leagueCount: number
  isOAuth: boolean
  providerLabel: string
  hasPassword: boolean
  backupEmail: string
  subscription: SubscriptionSummary | null
  lifetime: boolean
  justSubscribed: boolean
}) {
  // Section numbers shift depending on whether the OAuth-branch ("backup email")
  // or the password-branch ("email change + password") is rendered. Just
  // compute them inline so the headings always read 01, 02, 03... in order.
  return (
    <>
      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · Subscription</span>
          <span className="section-title">Your plan —</span>
          <span className="section-meta">Coming soon</span>
        </div>
        <SubscriptionCard leagueCount={leagueCount} subscription={subscription} lifetime={lifetime} justSubscribed={justSubscribed} />
      </div>

      {isOAuth ? (
        <div className="section">
          <div className="section-header">
            <span className="section-num">§ 02 · Backup email</span>
            <span className="section-title">In case {providerLabel} access is lost —</span>
            <span className="section-meta">Optional</span>
          </div>
          <BackupEmailForm primaryEmail={email} initial={backupEmail} providerLabel={providerLabel} />
        </div>
      ) : (
        <>
          <div className="section">
            <div className="section-header">
              <span className="section-num">§ 02 · Email</span>
              <span className="section-title">Sign-in address —</span>
              <span className="section-meta">Magic links go here</span>
            </div>
            <EmailForm currentEmail={email} />
          </div>

          <div className="section">
            <div className="section-header">
              <span className="section-num">§ 03 · Password</span>
              <span className="section-title">
                {hasPassword ? 'Change password —' : 'Set a password —'}
              </span>
              <span className="section-meta">
                {hasPassword ? '8 character minimum' : 'So you can sign in without a magic link'}
              </span>
            </div>
            <PasswordForm hasPassword={hasPassword} />
          </div>
        </>
      )}

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ {isOAuth ? '03' : '04'} · Communication</span>
          <span className="section-title">What we send you —</span>
          <span className="section-meta">Off by default for billing</span>
        </div>
        <MarketingForm initialOptIn={marketingOptIn} />
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ {isOAuth ? '04' : '05'} · Sign out</span>
          <span className="section-title">See you next time —</span>
          <span className="section-meta">Ends this session</span>
        </div>
        <form action="/auth/signout" method="post" className="dc-card-row">
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>Signed in as {email}</div>
            <div style={{ opacity: 0.65, fontSize: '.85rem', marginTop: '.35rem' }}>
              {isOAuth ? `Signed in via ${providerLabel}. ` : ''}You&apos;ll be redirected to the homepage.
            </div>
          </div>
          <button type="submit" className="dc-btn-ghost">Sign out →</button>
        </form>
      </div>
    </>
  )
}

// ─── Subscription card ────────────────────────────────────────────────────
// Renders one of three states:
//   - No subscription: prompt to start a trial via /pricing
//   - Trialing: countdown + "Manage" (lets them cancel before charge)
//   - Active / Past due / Canceled: status line + portal access

function SubscriptionCard({
  leagueCount,
  subscription,
  lifetime,
  justSubscribed,
}: {
  leagueCount: number
  subscription: SubscriptionSummary | null
  lifetime: boolean
  justSubscribed: boolean
}) {
  const router = useRouter()
  const [opening, setOpening] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function openPortal() {
    setErr(null); setOpening(true)
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const body = await res.json()
    setOpening(false)
    if (!res.ok || !body?.url) {
      setErr(body?.error ?? 'Could not open portal — try again in a moment.')
      return
    }
    window.location.assign(body.url)
  }

  // Lifetime / comp account — short-circuit every other render path. Lives
  // in env (LIFETIME_USER_IDS), not the DB, so there's nothing for the user
  // to "manage" — no portal, no billing surface.
  if (lifetime) {
    return (
      <div className="dc-card-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: '14rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>Lifetime · unlimited</div>
            <span style={{
              fontFamily: 'var(--mono)',
              fontSize: '.55rem',
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
              border: '1px solid var(--gold)',
              padding: '.15rem .45rem',
              borderRadius: '2px',
            }}>
              Comp
            </span>
          </div>
          <div style={{ opacity: 0.65, fontSize: '.85rem', marginTop: '.35rem', lineHeight: 1.5 }}>
            You have unlimited access — no billing, no tier limits, no expiration.
          </div>
          <div style={{ opacity: 0.55, fontSize: '.75rem', marginTop: '.6rem' }}>
            {leagueCount} {leagueCount === 1 ? 'league' : 'leagues'} on file.
          </div>
        </div>
      </div>
    )
  }

  // No subscription on file
  if (!subscription) {
    return (
      <div className="dc-card-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: '14rem' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>No subscription</div>
          <div style={{ opacity: 0.65, fontSize: '.85rem', marginTop: '.35rem', lineHeight: 1.5 }}>
            You need an active plan to create new leagues. Start a free trial — your card isn&apos;t charged until the trial ends.
          </div>
          <div style={{ opacity: 0.55, fontSize: '.75rem', marginTop: '.6rem' }}>
            You currently have {leagueCount} {leagueCount === 1 ? 'league' : 'leagues'} on file.
          </div>
        </div>
        <button type="button" onClick={() => router.push('/pricing')} className="dc-btn">
          View pricing →
        </button>
      </div>
    )
  }

  const { title, detail, badge } = describeSubscription(subscription)

  return (
    <div className="dc-card-row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: '14rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>{title}</div>
          {badge && (
            <span style={{
              fontFamily: 'var(--mono)',
              fontSize: '.55rem',
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: badge.color,
              border: `1px solid ${badge.color}`,
              padding: '.15rem .45rem',
              borderRadius: '2px',
            }}>
              {badge.text}
            </span>
          )}
        </div>
        <div style={{ opacity: 0.65, fontSize: '.85rem', marginTop: '.35rem', lineHeight: 1.5 }}>
          {detail}
        </div>
        <div style={{ opacity: 0.55, fontSize: '.75rem', marginTop: '.6rem' }}>
          {leagueCount} {leagueCount === 1 ? 'league' : 'leagues'} on file.
        </div>
        {justSubscribed && (
          <div className="dc-form-ok" style={{ marginTop: '.6rem' }}>
            Subscription started — welcome aboard.
          </div>
        )}
        {err && <p className="dc-form-error" style={{ marginTop: '.6rem' }}>{err}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', alignItems: 'flex-end' }}>
        <button type="button" onClick={openPortal} disabled={opening} className="dc-btn">
          {opening ? 'Opening…' : 'Manage subscription →'}
        </button>
        <button type="button" onClick={() => router.push('/pricing')} className="dc-btn-ghost">
          Compare plans
        </button>
      </div>
    </div>
  )
}

// ─── Email form ───────────────────────────────────────────────────────────

function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action, isPending] = useActionState<Result, FormData>(
    updateEmail as (prev: Result, fd: FormData) => Promise<Result>,
    null
  )
  return (
    <form action={action} className="dc-card-static dc-form">
      <div className="dc-field">
        <label className="dc-label">Current email</label>
        <input value={currentEmail} disabled className="dc-input mono" />
      </div>
      <div className="dc-field">
        <label className="dc-label">New email</label>
        <input
          name="email"
          type="email"
          required
          placeholder="you@newdomain.com"
          className="dc-input mono"
        />
      </div>
      <button type="submit" disabled={isPending} className="dc-btn">
        {isPending ? 'Sending…' : 'Send confirmation links →'}
      </button>
      {state && !state.ok && <p className="dc-form-error">{state.error}</p>}
      {state && state.ok && state.message && <p className="dc-form-ok">{state.message}</p>}
    </form>
  )
}

// ─── Password form ────────────────────────────────────────────────────────
// hasPassword=false drops the "Current password" field — magic-link-only
// accounts have never had a password, so the first submit acts as set-initial.

function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, isPending] = useActionState<Result, FormData>(
    updatePassword as (prev: Result, fd: FormData) => Promise<Result>,
    null
  )
  return (
    <form action={action} className="dc-card-static dc-form">
      {hasPassword && (
        <div className="dc-field">
          <label className="dc-label">Current password</label>
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="dc-input mono"
          />
        </div>
      )}
      <div className="dc-field">
        <label className="dc-label">{hasPassword ? 'New password' : 'Password'}</label>
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="dc-input mono"
        />
      </div>
      <button type="submit" disabled={isPending} className="dc-btn">
        {isPending
          ? (hasPassword ? 'Updating…' : 'Setting…')
          : (hasPassword ? 'Update password →' : 'Set password →')}
      </button>
      {state && !state.ok && <p className="dc-form-error">{state.error}</p>}
      {state && state.ok && state.message && <p className="dc-form-ok">{state.message}</p>}
    </form>
  )
}

// ─── Backup email form (OAuth users only) ─────────────────────────────────

function BackupEmailForm({
  primaryEmail,
  initial,
  providerLabel,
}: {
  primaryEmail: string
  initial: string
  providerLabel: string
}) {
  const [state, action, isPending] = useActionState<Result, FormData>(
    updateBackupEmail as (prev: Result, fd: FormData) => Promise<Result>,
    null
  )
  return (
    <form action={action} className="dc-card-static dc-form">
      <div className="dc-field">
        <label className="dc-label">Primary email</label>
        <input value={primaryEmail} disabled className="dc-input mono" />
        <span className="dc-checkbox-hint" style={{ marginTop: '.4rem' }}>
          Tied to your {providerLabel} account — change it there if needed.
        </span>
      </div>
      <div className="dc-field">
        <label className="dc-label">Backup email</label>
        <input
          name="email"
          type="email"
          defaultValue={initial}
          placeholder="you@elsewhere.com"
          className="dc-input mono"
        />
        <span className="dc-checkbox-hint" style={{ marginTop: '.4rem' }}>
          We&apos;ll only use this if you ever lose access to your {providerLabel} account.
          Leave blank to clear.
        </span>
      </div>
      <button type="submit" disabled={isPending} className="dc-btn">
        {isPending ? 'Saving…' : 'Save backup email →'}
      </button>
      {state && !state.ok && <p className="dc-form-error">{state.error}</p>}
      {state && state.ok && state.message && <p className="dc-form-ok">{state.message}</p>}
    </form>
  )
}

// Pure helper that maps a subscription summary onto the three pieces of UI
// copy we need (title, detail line, optional badge). Pulled out of the
// component body so render stays free of let-then-mutate, which React 19's
// strict-mode purity rule flags as side effects during render.
function describeSubscription(s: SubscriptionSummary): {
  title: string
  detail: string
  badge: { text: string; color: string } | null
} {
  const periodLabel = s.billingPeriod === 'monthly' ? 'monthly' : 'yearly'
  const trialEnd = s.trialEndsAt ? new Date(s.trialEndsAt) : null
  const periodEnd = s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000)) : null

  if (s.status === 'trialing') {
    return {
      title: `${s.tierLabel} · free trial`,
      detail: trialEnd
        ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left · your card will be charged on ${trialEnd.toLocaleDateString()} (${periodLabel})`
        : `Free trial active (${periodLabel})`,
      badge: { text: 'Trialing', color: 'var(--gold)' },
    }
  }
  if (s.status === 'active' && s.cancelAtPeriodEnd) {
    return {
      title: `${s.tierLabel} · canceling`,
      detail: periodEnd
        ? `Active until ${periodEnd.toLocaleDateString()} — won't renew.`
        : `Active until end of period — won't renew.`,
      badge: { text: 'Canceling', color: 'var(--rust, #d65a3c)' },
    }
  }
  if (s.status === 'active') {
    return {
      title: `${s.tierLabel} · ${periodLabel}`,
      detail: periodEnd ? `Renews on ${periodEnd.toLocaleDateString()}` : 'Active subscription.',
      badge: { text: 'Active', color: 'var(--sage, #7fa97f)' },
    }
  }
  if (s.status === 'past_due') {
    return {
      title: `${s.tierLabel} · payment failed`,
      detail: 'Update your payment method to keep access.',
      badge: { text: 'Past due', color: 'var(--rust, #d65a3c)' },
    }
  }
  if (s.status === 'canceled') {
    return {
      title: `${s.tierLabel} · canceled`,
      detail: 'Subscription ended. Start a new one to create leagues again.',
      badge: { text: 'Canceled', color: 'var(--cream-mute)' },
    }
  }
  return {
    title: `${s.tierLabel} · ${s.status}`,
    detail: 'Open the customer portal for details.',
    badge: null,
  }
}

// ─── Marketing opt-in toggle ──────────────────────────────────────────────

function MarketingForm({ initialOptIn }: { initialOptIn: boolean }) {
  const router = useRouter()
  const [optIn, setOptIn] = useState(initialOptIn)
  const [, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function onToggle(next: boolean) {
    setOptIn(next)
    setErr(null)
    setSaving(true)
    startTransition(async () => {
      const r = await updateMarketingOptIn({ optIn: next })
      setSaving(false)
      if (!r.ok) {
        setErr(r.error)
        setOptIn(!next)  // revert
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="dc-card-static">
      <label className="dc-checkbox-row" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={optIn}
          disabled={saving}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>
          Email me about new features and product updates
          <span className="dc-checkbox-hint">
            Billing-related emails (subscription confirmations, payment failures) always go out — this only covers
            optional announcements like new platform integrations and product changes.
          </span>
        </span>
      </label>
      {err && <p className="dc-form-error" style={{ marginTop: '.85rem' }}>{err}</p>}
    </div>
  )
}
