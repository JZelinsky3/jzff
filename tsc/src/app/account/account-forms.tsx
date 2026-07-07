'use client'

import { useActionState, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { updateEmail, updatePassword, updateMarketingOptIn, updateBackupEmail, updateReferralSource } from './actions'
import { MemberCodeChip } from './member-code-chip'

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

export function AccountForms({
  email,
  memberCode,
  memberSince,
  marketingOptIn,
  leagueCount,
  isOAuth,
  providerLabel,
  hasPassword,
  backupEmail,
  subscription,
  lifetime,
  justSubscribed,
  referralSource,
  referralOther,
}: {
  email: string
  memberCode: string
  memberSince: string
  marketingOptIn: boolean
  leagueCount: number
  isOAuth: boolean
  providerLabel: string
  hasPassword: boolean
  backupEmail: string
  subscription: SubscriptionSummary | null
  lifetime: boolean
  justSubscribed: boolean
  referralSource: string | null
  referralOther: string
}) {
  // The credential card is the account. Plan / email / password are rows
  // on the card; tapping one opens its form in a drawer inside the card.
  // Only one drawer at a time. Fresh checkout lands with the plan drawer
  // open so the "subscription started" note is visible immediately.
  type Panel = 'plan' | 'email' | 'password'
  const [panel, setPanel] = useState<Panel | null>(justSubscribed ? 'plan' : null)
  function toggle(p: Panel) {
    setPanel((v) => (v === p ? null : p))
  }

  const planValue = lifetime
    ? 'Lifetime · Comp'
    : subscription
      ? describeSubscription(subscription).title
      : 'No subscription'
  const sealTier = lifetime ? 'Comp' : subscription?.tierLabel ?? 'No plan'

  return (
    <>
      <div className="acct-pass acct-pass-xl" role="group" aria-label="Your membership card">
        <div className="acct-pass-head">
          <span className="acct-pass-star" aria-hidden>★</span>
          <span className="acct-pass-brand">The Sunday <em>Chronicle.</em></span>
          <span className="acct-pass-star" aria-hidden>★</span>
        </div>
        <div className="acct-pass-kicker">Reader&apos;s credential</div>

        <div className="acct-pass-body">
          <div className="acct-pass-rows">
            <button
              type="button"
              className={`acct-pass-row is-action${panel === 'plan' ? ' is-open' : ''}`}
              onClick={() => toggle('plan')}
              aria-expanded={panel === 'plan'}
            >
              <span>Plan</span>
              <strong>{planValue}</strong>
              {!lifetime && <span className="acct-pass-chip">{panel === 'plan' ? 'Close' : 'Manage'}</span>}
            </button>
            <button
              type="button"
              className={`acct-pass-row is-action${panel === 'email' ? ' is-open' : ''}`}
              onClick={() => toggle('email')}
              aria-expanded={panel === 'email'}
            >
              <span>Member</span>
              <strong className="acct-pass-email">{email}</strong>
              <span className="acct-pass-chip">
                {panel === 'email' ? 'Close' : isOAuth ? 'Backup' : 'Change'}
              </span>
            </button>
            {!isOAuth && (
              <button
                type="button"
                className={`acct-pass-row is-action${panel === 'password' ? ' is-open' : ''}`}
                onClick={() => toggle('password')}
                aria-expanded={panel === 'password'}
              >
                <span>Password</span>
                <strong>{hasPassword ? 'Set' : 'Not set (magic links)'}</strong>
                <span className="acct-pass-chip">
                  {panel === 'password' ? 'Close' : hasPassword ? 'Change' : 'Set'}
                </span>
              </button>
            )}
            <div className="acct-pass-row">
              <span>Since</span>
              <strong>{memberSince}</strong>
            </div>
            <div className="acct-pass-row">
              <span>Leagues</span>
              <strong>{leagueCount} on file</strong>
            </div>
            {isOAuth && (
              <div className="acct-pass-row">
                <span>Signs in</span>
                <strong>Via {providerLabel}</strong>
              </div>
            )}
          </div>
          <div className="acct-pass-seal" aria-hidden>
            <span className="acct-pass-seal-ring">
              <span className="acct-pass-seal-star">★</span>
            </span>
            <span className="acct-pass-seal-tier">{sealTier}</span>
          </div>
        </div>

        {/* Drawer: the active row's form, opened inside the card. */}
        <div className={`acct-pass-drawer${panel ? ' is-open' : ''}`}>
          <div className="acct-pass-drawer-inner">
            {panel === 'plan' && (
              <PlanPanel
                leagueCount={leagueCount}
                subscription={subscription}
                lifetime={lifetime}
                justSubscribed={justSubscribed}
              />
            )}
            {panel === 'email' && (
              isOAuth
                ? <BackupEmailForm primaryEmail={email} initial={backupEmail} providerLabel={providerLabel} startOpen />
                : <EmailForm currentEmail={email} startEditing />
            )}
            {panel === 'password' && <PasswordForm hasPassword={hasPassword} startEditing />}
          </div>
        </div>

        <div className="acct-pass-foot">
          {memberCode ? <MemberCodeChip code={memberCode} /> : <span>Valid Sundays &amp; every other day too</span>}
        </div>
      </div>

      <div className="section">
        <div className="acct-two-col">
          <div>
            <div className="section-header">
              <span className="section-num">§ 01 · Communication</span>
              <span className="section-title">What we send you —</span>
            </div>
            <MarketingForm initialOptIn={marketingOptIn} email={email} />
          </div>
          <div>
            <div className="section-header">
              <span className="section-num">§ 02 · Referral</span>
              <span className="section-title">Where you heard of us —</span>
            </div>
            <ReferralForm initialSource={referralSource} initialOther={referralOther} />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 03 · Sign out</span>
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
          <button type="submit" className="dc-btn-ghost">Sign out</button>
        </form>
      </div>
    </>
  )
}

// ─── Plan panel ───────────────────────────────────────────────────────────
// The plan drawer always shows all three tiers so a subscriber can window-
// shop an upgrade; the tier they're on is stamped "Yours" with its button
// dimmed out. Status/portal controls render above the grid when there's a
// subscription (or comp) to manage.

const PLAN_TIERS: { id: SubscriptionSummary['tier']; name: string; mo: number; yr: number; leagues: string }[] = [
  { id: 'tier1', name: 'Rookie', mo: 3, yr: 15, leagues: '1 league' },
  { id: 'tier2', name: 'Veteran', mo: 5, yr: 25, leagues: 'Up to 3 leagues' },
  { id: 'tier3', name: 'All-Pro', mo: 15, yr: 50, leagues: 'Up to 10 leagues' },
]

function PlanPanel({
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
  // Only stamp a "current" tier while the subscription is actually in
  // force; a canceled sub shouldn't block re-picking the same tier.
  const currentTier = subscription && subscription.status !== 'canceled' ? subscription.tier : null

  return (
    <div>
      {(subscription || lifetime) ? (
        <SubscriptionCard
          leagueCount={leagueCount}
          subscription={subscription}
          lifetime={lifetime}
          justSubscribed={justSubscribed}
        />
      ) : (
        <p style={{ fontSize: '.88rem', color: 'var(--cream-soft)', margin: '0 0 .35rem', lineHeight: 1.6 }}>
          No active plan. You have {leagueCount} {leagueCount === 1 ? 'league' : 'leagues'} on file;
          pick a tier below to keep adding. Every plan starts with a 7-day free trial.
        </p>
      )}

      <div className="acct-plans">
        {PLAN_TIERS.map((t) => {
          const yours = currentTier === t.id
          return (
            <div key={t.id} className={`acct-plan${yours ? ' is-current' : ''}`}>
              {yours && <span className="acct-plan-stamp">★ Yours</span>}
              <span className="acct-plan-tier">{t.name}</span>
              <span className="acct-plan-price">${t.mo}<span>/mo</span></span>
              <span className="acct-plan-alt">or ${t.yr} a year</span>
              <span className="acct-plan-leagues">{t.leagues}</span>
              {yours ? (
                <span className="acct-plan-btn is-yours" aria-hidden>Subscribed</span>
              ) : (
                <Link href="/pricing" className="acct-plan-btn">
                  {lifetime ? 'View' : currentTier ? 'Switch' : 'Start trial'}
                </Link>
              )}
            </div>
          )
        })}
      </div>
      {lifetime && (
        <p style={{ fontSize: '.74rem', color: 'var(--cream-mute)', margin: '.7rem 0 0', textAlign: 'center' }}>
          You&apos;re comped, so these are here for window-shopping only.
        </p>
      )}
    </div>
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
    const res = await fetch('/api/stripe/portal/', { method: 'POST' })
    const body = await res.json()
    setOpening(false)
    if (!res.ok || !body?.url) {
      setErr(body?.error ?? 'Could not open the portal. Try again in a moment.')
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
            You have unlimited access. No billing, no tier limits, no expiration.
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
            You need an active plan to create new leagues. Start a free trial; your card isn&apos;t charged until the trial ends.
          </div>
          <div style={{ opacity: 0.55, fontSize: '.75rem', marginTop: '.6rem' }}>
            You currently have {leagueCount} {leagueCount === 1 ? 'league' : 'leagues'} on file.
          </div>
        </div>
        <button type="button" onClick={() => router.push('/pricing')} className="dc-btn">
          View pricing
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
            Subscription started. Welcome aboard.
          </div>
        )}
        {err && <p className="dc-form-error" style={{ marginTop: '.6rem' }}>{err}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', alignItems: 'flex-end' }}>
        <button type="button" onClick={openPortal} disabled={opening} className="dc-btn">
          {opening ? 'Opening…' : 'Manage subscription'}
        </button>
      </div>
    </div>
  )
}

// ─── Email form ───────────────────────────────────────────────────────────

function EmailForm({ currentEmail, startEditing = false }: { currentEmail: string; startEditing?: boolean }) {
  const [state, action, isPending] = useActionState<Result, FormData>(
    updateEmail as (prev: Result, fd: FormData) => Promise<Result>,
    null
  )
  const [editing, setEditing] = useState(startEditing)
  if (!editing) {
    return (
      <div className="dc-card-static dc-form">
        <div className="dc-field">
          <label className="dc-label">Current email</label>
          <input value={currentEmail} disabled className="dc-input mono" />
        </div>
        <button type="button" className="dc-btn-ghost" onClick={() => setEditing(true)}>
          Change email
        </button>
      </div>
    )
  }
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
          autoFocus
          placeholder="you@newdomain.com"
          className="dc-input mono"
        />
      </div>
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <button type="submit" disabled={isPending} className="dc-btn">
          {isPending ? 'Sending…' : 'Send confirmation links'}
        </button>
        <button type="button" className="dc-btn-ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {state && !state.ok && <p className="dc-form-error">{state.error}</p>}
      {state && state.ok && state.message && <p className="dc-form-ok">{state.message}</p>}
    </form>
  )
}

// ─── Password form ────────────────────────────────────────────────────────
// hasPassword=false drops the "Current password" field — magic-link-only
// accounts have never had a password, so the first submit acts as set-initial.

function PasswordForm({ hasPassword, startEditing = false }: { hasPassword: boolean; startEditing?: boolean }) {
  const [state, action, isPending] = useActionState<Result, FormData>(
    updatePassword as (prev: Result, fd: FormData) => Promise<Result>,
    null
  )
  const [editing, setEditing] = useState(startEditing)
  if (!editing) {
    return (
      <div className="dc-card-static dc-form">
        <div className="dc-field">
          <label className="dc-label">Status</label>
          <input
            value={hasPassword ? 'Password is set' : 'No password (magic links only)'}
            disabled
            className="dc-input mono"
          />
        </div>
        <button type="button" className="dc-btn-ghost" onClick={() => setEditing(true)}>
          {hasPassword ? 'Change password' : 'Set password'}
        </button>
      </div>
    )
  }
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
          autoFocus
          minLength={8}
          autoComplete="new-password"
          className="dc-input mono"
        />
      </div>
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <button type="submit" disabled={isPending} className="dc-btn">
          {isPending
            ? (hasPassword ? 'Updating…' : 'Setting…')
            : (hasPassword ? 'Update password' : 'Set password')}
        </button>
        <button type="button" className="dc-btn-ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
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
  startOpen = false,
}: {
  primaryEmail: string
  initial: string
  providerLabel: string
  startOpen?: boolean
}) {
  const [state, action, isPending] = useActionState<Result, FormData>(
    updateBackupEmail as (prev: Result, fd: FormData) => Promise<Result>,
    null
  )
  const [linking, setLinking] = useState(false)
  const [linkErr, setLinkErr] = useState<string | null>(null)
  // Backup options stay collapsed until the chip is tapped — mobile keeps
  // the section to a single email row.
  const [open, setOpen] = useState(startOpen)

  // Adds a second OAuth identity to the current user so they can sign in
  // with either provider account. Supabase calls this "manual identity
  // linking" — must be enabled on the project (Auth → Settings).
  async function onLinkAnother() {
    setLinkErr(null); setLinking(true)
    const supabase = createBrowserSupabase()
    const redirectTo = new URL('/auth/callback', window.location.origin).toString()
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) { setLinkErr(error.message); setLinking(false) }
    // On success the browser is navigated to Google — no further code runs here.
  }

  return (
    <form action={action} className="dc-card-static dc-form">
      <div className="dc-field">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.6rem', marginBottom: '.35rem' }}>
          <label className="dc-label" style={{ marginBottom: 0 }}>Email</label>
          {/* Backup-access options live behind this chip so the section is
              one quiet row until the user actually wants them. */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            style={{
              fontFamily: 'var(--mono)', fontWeight: 700,
              fontSize: '.58rem', letterSpacing: '.18em', textTransform: 'uppercase',
              color: 'var(--gold)',
              background: 'transparent',
              border: '1px solid var(--gold-deep)',
              borderRadius: '999px',
              padding: '.25rem .6rem',
              cursor: 'pointer',
            }}
          >
            {open ? '× Close' : initial ? '✓ Backup' : '+ Backup'}
          </button>
        </div>
        <input value={primaryEmail} disabled className="dc-input mono" />
      </div>
      {open && (
        <>
          <div className="dc-field">
            <label className="dc-label">Backup email</label>
            <input
              name="email"
              type="email"
              defaultValue={initial}
              autoFocus
              placeholder="you@elsewhere.com"
              className="dc-input mono"
            />
            <span className="dc-checkbox-hint" style={{ marginTop: '.4rem' }}>
              <span className="hide-on-mobile">
                We&apos;ll only use this if you ever lose access to your {providerLabel} account.
                Leave blank to clear.
              </span>
              <span className="show-on-mobile">
                Used only if you lose {providerLabel} access. Blank to clear.
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <button type="submit" disabled={isPending} className="dc-btn">
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onLinkAnother}
              disabled={linking}
              className="dc-btn-ghost"
            >
              {linking ? 'Opening…' : `Link another ${providerLabel} account`}
            </button>
          </div>
          {linkErr && <p className="dc-form-error">{linkErr}</p>}
          {state && !state.ok && <p className="dc-form-error">{state.error}</p>}
          {state && state.ok && state.message && <p className="dc-form-ok">{state.message}</p>}
        </>
      )}
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
        ? `Active until ${periodEnd.toLocaleDateString()}. Won't renew.`
        : `Active until the end of the period. Won't renew.`,
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

// ─── Referral source ──────────────────────────────────────────────────────
// Editable post-signup. Existing users can fill it in; new users land here
// with whatever they picked on the signup form. "Other" reveals a 120-char
// free-form input; switching away clears the detail on save.

const REFERRAL_OPTIONS: { value: '' | 'discord' | 'reddit' | 'twitter' | 'facebook' | 'ai' | 'other'; label: string }[] = [
  { value: '',         label: 'Prefer not to say' },
  { value: 'discord',  label: 'Discord' },
  { value: 'reddit',   label: 'Reddit' },
  { value: 'twitter',  label: 'Twitter / X' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'ai',       label: 'AI (ChatGPT, Claude, etc.)' },
  { value: 'other',    label: 'Other' },
]

function ReferralForm({ initialSource, initialOther }: { initialSource: string | null; initialOther: string }) {
  type Channel = (typeof REFERRAL_OPTIONS)[number]['value']
  const allowed = REFERRAL_OPTIONS.map((o) => o.value) as Channel[]
  const initial = (initialSource && (allowed as string[]).includes(initialSource) ? initialSource : '') as Channel
  const [channel, setChannel] = useState<Channel>(initial)
  const [other, setOther] = useState(initialOther)
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  function onSave(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setOk(null); setSaving(true)
    startTransition(async () => {
      const r = await updateReferralSource({ channel, other })
      setSaving(false)
      if (!r.ok) { setErr(r.error); return }
      setOk(r.message ?? 'Saved.')
    })
  }

  return (
    <form onSubmit={onSave} className="dc-card-static dc-form">
      <div className="dc-field">
        <label htmlFor="account-referral" className="dc-label">Where did you hear about us?</label>
        <select
          id="account-referral"
          value={channel}
          onChange={(e) => { setChannel(e.target.value as Channel); setOk(null) }}
          className="dc-input"
        >
          {REFERRAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {channel === 'other' && (
          <input
            type="text"
            value={other}
            onChange={(e) => { setOther(e.target.value); setOk(null) }}
            placeholder="Tell us where (optional)"
            maxLength={120}
            className="dc-input"
            style={{ marginTop: '.5rem' }}
          />
        )}
      </div>
      {/* marginTop auto: with the two-col cards stretched to equal height,
          the save row rides the card's foot line instead of floating mid-card. */}
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: 'auto' }}>
        <button type="submit" disabled={saving} className="dc-btn">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {err && <p className="dc-form-error">{err}</p>}
      {ok && <p className="dc-form-ok">{ok}</p>}
    </form>
  )
}

// ─── Marketing opt-in toggle ──────────────────────────────────────────────

function MarketingForm({ initialOptIn, email }: { initialOptIn: boolean; email: string }) {
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
            <span className="hide-on-mobile">
              Covers optional announcements like new features and platform integrations.
              Billing emails (receipts, payment issues) always go out regardless.
            </span>
            <span className="show-on-mobile">
              Optional announcements only. Billing emails always send.
            </span>
          </span>
        </span>
      </label>
      {err && <p className="dc-form-error" style={{ marginTop: '.85rem' }}>{err}</p>}
      {/* Mailing ledger: live status rows that carry the card to the same
          foot line as the Referral card next to it. */}
      <div className="acct-mail-lines" aria-live="polite">
        <div className="acct-mail-line">
          <span>Status</span>
          <span className="acct-mail-dots" aria-hidden />
          <strong className={optIn ? 'is-on' : undefined}>{optIn ? 'Subscribed' : 'Opted out'}</strong>
        </div>
        <div className="acct-mail-line">
          <span>Delivers to</span>
          <span className="acct-mail-dots" aria-hidden />
          <strong>{email}</strong>
        </div>
      </div>
    </div>
  )
}
