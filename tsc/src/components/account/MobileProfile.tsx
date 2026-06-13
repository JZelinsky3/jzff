'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { updateEmail, updatePassword, updateMarketingOptIn, updateBackupEmail } from '@/app/account/actions'
import { MemberCodeChip } from '@/app/account/member-code-chip'

type Result = { ok: false; error: string } | { ok: true; message?: string } | null

type SubscriptionSummary = {
  tier: 'tier1' | 'tier2' | 'tier3'
  tierLabel: string
  billingPeriod: 'monthly' | 'yearly'
  status: string
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export function MobileProfile({
  email,
  memberCode,
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
  memberCode: string
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
  return (
    <main className="mprof">
      {/* ── Top bar ── */}
      <header className="mprof-bar">
        <Link href="/dashboard" className="mprof-bar-back" aria-label="Back to library">
          <svg viewBox="0 0 8 14" width="10" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <span className="mprof-bar-title">Account</span>
        <span className="mprof-bar-spacer" />
      </header>

      {/* ── Identity card ── */}
      <div className="mprof-identity">
        <div className="mprof-identity-avatar">
          {email.charAt(0).toUpperCase()}
        </div>
        <div className="mprof-identity-email">{email}</div>
        {memberCode && <MemberCodeChip code={memberCode} />}
      </div>

      {/* ── Subscription ── */}
      <MobileSubscriptionCard
        leagueCount={leagueCount}
        subscription={subscription}
        lifetime={lifetime}
        justSubscribed={justSubscribed}
      />

      {/* ── Email ── */}
      {isOAuth ? (
        <MobileBackupEmailSection
          primaryEmail={email}
          initial={backupEmail}
          providerLabel={providerLabel}
        />
      ) : (
        <MobileEmailSection currentEmail={email} />
      )}

      {/* ── Password (email users only) ── */}
      {!isOAuth && <MobilePasswordSection hasPassword={hasPassword} />}

      {/* ── Communication ── */}
      <MobileMarketingSection initialOptIn={marketingOptIn} />

      {/* ── Sign out ── */}
      <div className="mprof-section">
        <div className="mprof-section-label">Sign out</div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="mprof-signout">
            <span>Sign out</span>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
              <polyline points="10 12 14 8 10 4" />
              <line x1="14" y1="8" x2="6" y2="8" />
            </svg>
          </button>
        </form>
      </div>

      <div className="mprof-footer">
        <Link href="/dashboard" className="mprof-footer-link">Library</Link>
        <span className="mprof-footer-sep">·</span>
        <Link href="/" className="mprof-footer-link">Home</Link>
        <span className="mprof-footer-sep">·</span>
        <Link href="/pricing" className="mprof-footer-link">Pricing</Link>
      </div>
    </main>
  )
}

/* ─── Subscription card ─── */

function MobileSubscriptionCard({
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
    const res = await fetch('/api/stripe/portal/', { method: 'POST' })
    const body = await res.json()
    setOpening(false)
    if (!res.ok || !body?.url) {
      setErr(body?.error ?? 'Could not open portal.')
      return
    }
    window.location.assign(body.url)
  }

  if (lifetime) {
    return (
      <div className="mprof-section">
        <div className="mprof-section-label">Plan</div>
        <div className="mprof-card">
          <div className="mprof-card-row">
            <span className="mprof-card-title">Lifetime</span>
            <span className="mprof-badge comp">Comp</span>
          </div>
          <div className="mprof-card-detail">Unlimited access. {leagueCount} {leagueCount === 1 ? 'league' : 'leagues'}.</div>
        </div>
      </div>
    )
  }

  if (!subscription) {
    return (
      <div className="mprof-section">
        <div className="mprof-section-label">Plan</div>
        <div className="mprof-card">
          <div className="mprof-card-title">No subscription</div>
          <div className="mprof-card-detail">
            {leagueCount} {leagueCount === 1 ? 'league' : 'leagues'} on file.
          </div>
          <button type="button" onClick={() => router.push('/pricing')} className="mprof-card-btn">
            View pricing
          </button>
        </div>
      </div>
    )
  }

  const { title, detail, badge } = describeSubscription(subscription)
  return (
    <div className="mprof-section">
      <div className="mprof-section-label">Plan</div>
      <div className="mprof-card">
        <div className="mprof-card-row">
          <span className="mprof-card-title">{title}</span>
          {badge && <span className="mprof-badge" style={{ color: badge.color, borderColor: badge.color }}>{badge.text}</span>}
        </div>
        <div className="mprof-card-detail">{detail}</div>
        <div className="mprof-card-detail" style={{ opacity: 0.5 }}>
          {leagueCount} {leagueCount === 1 ? 'league' : 'leagues'} on file.
        </div>
        {justSubscribed && <div className="mprof-ok">Subscription started.</div>}
        {err && <div className="mprof-err">{err}</div>}
        <div className="mprof-card-btns">
          <button type="button" onClick={openPortal} disabled={opening} className="mprof-card-btn">
            {opening ? 'Opening...' : 'Manage'}
          </button>
          <button type="button" onClick={() => router.push('/pricing')} className="mprof-card-btn ghost">
            Compare plans
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Email section ─── */

function MobileEmailSection({ currentEmail }: { currentEmail: string }) {
  const [editing, setEditing] = useState(false)
  const [state, action, isPending] = useActionState<Result, FormData>(
    updateEmail as (prev: Result, fd: FormData) => Promise<Result>,
    null
  )

  return (
    <div className="mprof-section">
      <div className="mprof-section-label">Email</div>
      {!editing ? (
        <div className="mprof-card">
          <div className="mprof-card-val">{currentEmail}</div>
          <button type="button" onClick={() => setEditing(true)} className="mprof-card-btn ghost">
            Change
          </button>
        </div>
      ) : (
        <form action={action} className="mprof-card">
          <div className="mprof-field">
            <label className="mprof-field-label">Current</label>
            <input value={currentEmail} disabled className="mprof-input" />
          </div>
          <div className="mprof-field">
            <label className="mprof-field-label">New email</label>
            <input name="email" type="email" required autoFocus placeholder="you@new.com" className="mprof-input" />
          </div>
          <div className="mprof-card-btns">
            <button type="submit" disabled={isPending} className="mprof-card-btn">
              {isPending ? 'Sending...' : 'Confirm'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="mprof-card-btn ghost">
              Cancel
            </button>
          </div>
          {state && !state.ok && <div className="mprof-err">{state.error}</div>}
          {state?.ok && state.message && <div className="mprof-ok">{state.message}</div>}
        </form>
      )}
    </div>
  )
}

/* ─── Password section ─── */

function MobilePasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const [editing, setEditing] = useState(false)
  const [state, action, isPending] = useActionState<Result, FormData>(
    updatePassword as (prev: Result, fd: FormData) => Promise<Result>,
    null
  )

  return (
    <div className="mprof-section">
      <div className="mprof-section-label">Password</div>
      {!editing ? (
        <div className="mprof-card">
          <div className="mprof-card-val">
            {hasPassword ? 'Password is set' : 'No password set'}
          </div>
          <button type="button" onClick={() => setEditing(true)} className="mprof-card-btn ghost">
            {hasPassword ? 'Change' : 'Set password'}
          </button>
        </div>
      ) : (
        <form action={action} className="mprof-card">
          {hasPassword && (
            <div className="mprof-field">
              <label className="mprof-field-label">Current</label>
              <input name="currentPassword" type="password" required autoComplete="current-password" className="mprof-input" />
            </div>
          )}
          <div className="mprof-field">
            <label className="mprof-field-label">{hasPassword ? 'New password' : 'Password'}</label>
            <input name="newPassword" type="password" required autoFocus minLength={8} autoComplete="new-password" className="mprof-input" />
          </div>
          <div className="mprof-card-btns">
            <button type="submit" disabled={isPending} className="mprof-card-btn">
              {isPending ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="mprof-card-btn ghost">
              Cancel
            </button>
          </div>
          {state && !state.ok && <div className="mprof-err">{state.error}</div>}
          {state?.ok && state.message && <div className="mprof-ok">{state.message}</div>}
        </form>
      )}
    </div>
  )
}

/* ─── Backup email (OAuth) ─── */

function MobileBackupEmailSection({
  primaryEmail,
  initial,
  providerLabel,
}: {
  primaryEmail: string
  initial: string
  providerLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [state, action, isPending] = useActionState<Result, FormData>(
    updateBackupEmail as (prev: Result, fd: FormData) => Promise<Result>,
    null
  )
  const [linking, setLinking] = useState(false)
  const [linkErr, setLinkErr] = useState<string | null>(null)

  async function onLinkAnother() {
    setLinkErr(null); setLinking(true)
    const supabase = createBrowserSupabase()
    const redirectTo = new URL('/auth/callback', window.location.origin).toString()
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) { setLinkErr(error.message); setLinking(false) }
  }

  return (
    <div className="mprof-section">
      <div className="mprof-section-label">Email</div>
      <div className="mprof-card">
        <div className="mprof-card-row">
          <div className="mprof-card-val">{primaryEmail}</div>
          <button type="button" onClick={() => setOpen((v) => !v)} className="mprof-badge-btn">
            {open ? 'Close' : initial ? 'Backup' : '+ Backup'}
          </button>
        </div>
        <div className="mprof-card-detail" style={{ opacity: 0.5 }}>Via {providerLabel}</div>
        {open && (
          <form action={action} style={{ marginTop: '.75rem' }}>
            <div className="mprof-field">
              <label className="mprof-field-label">Backup email</label>
              <input name="email" type="email" defaultValue={initial} autoFocus placeholder="you@elsewhere.com" className="mprof-input" />
            </div>
            <div className="mprof-card-btns">
              <button type="submit" disabled={isPending} className="mprof-card-btn">
                {isPending ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={onLinkAnother} disabled={linking} className="mprof-card-btn ghost">
                {linking ? 'Opening...' : `Link ${providerLabel}`}
              </button>
            </div>
            {linkErr && <div className="mprof-err">{linkErr}</div>}
            {state && !state.ok && <div className="mprof-err">{state.error}</div>}
            {state?.ok && state.message && <div className="mprof-ok">{state.message}</div>}
          </form>
        )}
      </div>
    </div>
  )
}

/* ─── Marketing toggle ─── */

function MobileMarketingSection({ initialOptIn }: { initialOptIn: boolean }) {
  const router = useRouter()
  const [optIn, setOptIn] = useState(initialOptIn)
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function onToggle(next: boolean) {
    setOptIn(next)
    setErr(null)
    setSaving(true)
    startTransition(async () => {
      const r = await updateMarketingOptIn({ optIn: next })
      setSaving(false)
      if (!r.ok) { setErr(r.error); setOptIn(!next); return }
      router.refresh()
    })
  }

  return (
    <div className="mprof-section">
      <div className="mprof-section-label">Communication</div>
      <div className="mprof-card">
        <label className="mprof-toggle-row">
          <input
            type="checkbox"
            checked={optIn}
            disabled={saving}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="mprof-toggle-text">
            Email me about new features
            <span className="mprof-toggle-hint">Billing emails always send regardless.</span>
          </span>
        </label>
        {err && <div className="mprof-err">{err}</div>}
      </div>
    </div>
  )
}

/* ─── Helpers ─── */

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
      title: `${s.tierLabel} · trial`,
      detail: trialEnd ? `${daysLeft}d left · charges ${trialEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : `Trial active (${periodLabel})`,
      badge: { text: 'Trial', color: 'var(--gold)' },
    }
  }
  if (s.status === 'active' && s.cancelAtPeriodEnd) {
    return {
      title: `${s.tierLabel}`,
      detail: periodEnd ? `Ends ${periodEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Canceling',
      badge: { text: 'Canceling', color: 'var(--rust, #d65a3c)' },
    }
  }
  if (s.status === 'active') {
    return {
      title: `${s.tierLabel} · ${periodLabel}`,
      detail: periodEnd ? `Renews ${periodEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Active',
      badge: { text: 'Active', color: 'var(--sage, #7fa97f)' },
    }
  }
  if (s.status === 'past_due') {
    return {
      title: `${s.tierLabel}`,
      detail: 'Payment failed — update your method.',
      badge: { text: 'Past due', color: 'var(--rust, #d65a3c)' },
    }
  }
  if (s.status === 'canceled') {
    return {
      title: `${s.tierLabel}`,
      detail: 'Ended. Start a new plan to continue.',
      badge: { text: 'Canceled', color: 'var(--cream-mute)' },
    }
  }
  return { title: `${s.tierLabel} · ${s.status}`, detail: 'Open portal for details.', badge: null }
}
