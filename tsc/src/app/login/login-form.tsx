'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup'
type Status = 'idle' | 'submitting' | 'sent' | 'error'

// Tabbed sign-in / sign-up form. Password auth is the primary path; magic
// link stays as a fallback for users who don't want to manage one. Google
// OAuth is on both tabs — Supabase creates the account on first sign-in
// either way, so there's no functional difference between "sign in with
// Google" and "sign up with Google" beyond the button label.
type ReferralChannel = '' | 'discord' | 'reddit' | 'twitter' | 'facebook' | 'ai' | 'other'

export function LoginForm({ next, initialMode = 'signin' }: { next?: string; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referral, setReferral] = useState<ReferralChannel>('')
  const [referralOther, setReferralOther] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function reset() {
    setStatus('idle'); setError(null); setInfo(null)
  }

  // ─── Password sign-in / sign-up ──────────────────────────────────────────
  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    reset(); setStatus('submitting')
    const supabase = createClient()

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setStatus('error'); setError(error.message)
        return
      }
      // Hard-navigate so server components on the next page see the new session
      // (a router.push would client-route without rehydrating session state).
      // Default landing is the Clubhouse.
      window.location.assign(next || '/hub')
      return
    }

    // Sign up. Supabase will send a confirmation email if "Confirm email" is
    // enabled in the project's Auth settings (it is by default). Until they
    // click the link the session is null and we can't redirect to /dashboard.
    const redirectTo = new URL('/auth/callback', window.location.origin)
    if (next) redirectTo.searchParams.set('next', next)
    // Referral fields are optional — only pass them when something is set
    // so existing user_metadata defaults stay clean for blank submissions.
    const meta: Record<string, string> = {}
    if (referral) meta.referral_source = referral
    const otherTrim = referralOther.trim()
    if (otherTrim) meta.referral_source_other = otherTrim.slice(0, 120)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo.toString(),
        ...(Object.keys(meta).length ? { data: meta } : {}),
      },
    })
    if (error) {
      setStatus('error'); setError(error.message)
      return
    }
    if (data.session) {
      // Email confirmation is OFF in this Supabase project — they're signed
      // in immediately.
      window.location.assign(next || '/hub')
      return
    }
    setStatus('sent')
    setInfo(`Confirm your email — we sent a verification link to ${email}.`)
  }

  // ─── Magic link (sign-in tab fallback) ───────────────────────────────────
  async function onMagicLink() {
    reset(); setStatus('submitting')
    const supabase = createClient()
    const redirectTo = new URL('/auth/callback', window.location.origin)
    if (next) redirectTo.searchParams.set('next', next)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo.toString() },
    })
    if (error) {
      setStatus('error'); setError(error.message)
      return
    }
    setStatus('sent')
    setInfo(`Check your inbox — a magic link is on its way to ${email}.`)
  }

  // ─── Password reset ──────────────────────────────────────────────────────
  // We don't have a dedicated "set new password" page — the reset email
  // delivers a one-time magic link that signs the user in and drops them on
  // /account, where they change their password using the normal form.
  async function onForgotPassword() {
    if (!email) {
      setError('Enter your email above first, then click Forgot password.')
      setStatus('error')
      return
    }
    reset(); setStatus('submitting')
    const supabase = createClient()
    const redirectTo = new URL('/auth/callback', window.location.origin)
    redirectTo.searchParams.set('next', '/account')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo.toString(),
    })
    if (error) {
      setStatus('error'); setError(error.message)
      return
    }
    setStatus('sent')
    setInfo(`Password reset link sent to ${email}. Click it, then change your password from your account page.`)
  }

  // ─── Google OAuth ────────────────────────────────────────────────────────
  // Supabase handles the round-trip to Google's consent screen. On return
  // the user lands at /auth/callback which exchanges the code for a session.
  // signInWithOAuth navigates the browser away on success, so we only reach
  // the post-call code path on a setup error (e.g. provider not configured).
  async function onGoogle() {
    reset(); setStatus('submitting')
    const supabase = createClient()
    const redirectTo = new URL('/auth/callback', window.location.origin)
    if (next) redirectTo.searchParams.set('next', next)
    // OAuth has no form fields, so we round-trip the referral selection
    // through the redirectTo URL. /auth/callback picks it up and writes to
    // the profile only if it's still empty there (no overwrites).
    if (mode === 'signup' && referral) {
      redirectTo.searchParams.set('ref', referral)
      const otherTrim = referralOther.trim()
      if (referral === 'other' && otherTrim) {
        redirectTo.searchParams.set('ref_other', otherTrim.slice(0, 120))
      }
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.toString() },
    })
    if (error) {
      setStatus('error'); setError(error.message)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (status === 'sent') {
    return (
      <div style={{ textAlign: 'center', padding: '1rem 0' }}>
        <div className="card-roman" style={{ fontSize: '2.5rem' }}>✓</div>
        <div className="card-title" style={{ marginTop: '1rem' }}>Check your <em>inbox.</em></div>
        <p className="card-desc" style={{ marginTop: '.75rem' }}>{info}</p>
        <button type="button" onClick={reset} className="dc-btn-ghost" style={{ marginTop: '1.5rem' }}>
          ← Back
        </button>
      </div>
    )
  }

  const submitting = status === 'submitting'

  return (
    <div>
      {/* Tabs */}
      <div role="tablist" aria-label="Auth mode" style={{
        display: 'flex',
        gap: '.25rem',
        marginBottom: '1.5rem',
        borderBottom: '1px solid var(--ink-line)',
      }}>
        {(['signin', 'signup'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            type="button"
            onClick={() => { setMode(m); reset() }}
            style={{
              flex: 1,
              padding: '.75rem 1rem',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${mode === m ? 'var(--gold)' : 'transparent'}`,
              color: mode === m ? 'var(--gold)' : 'var(--cream-soft)',
              fontFamily: 'var(--mono)',
              fontSize: '.72rem',
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'color .15s, border-color .15s',
              marginBottom: '-1px',
            }}
          >
            {m === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        ))}
      </div>

      <form onSubmit={onPasswordSubmit} className="dc-form">
        <div className="dc-field">
          <label htmlFor="email" className="dc-label">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="dc-input"
          />
        </div>
        <div className="dc-field">
          <label htmlFor="password" className="dc-label">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={mode === 'signup' ? 8 : 1}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
            className="dc-input mono"
          />
          {mode === 'signin' && (
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={submitting}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--cream-soft)',
                fontFamily: 'var(--mono)',
                fontSize: '.65rem',
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                padding: '.35rem 0 0',
                textAlign: 'left',
                alignSelf: 'flex-start',
              }}
            >
              Forgot password?
            </button>
          )}
        </div>

        {mode === 'signup' && (
          <div className="dc-field">
            <label htmlFor="referral" className="dc-label">
              Where did you hear about us? <span style={{ opacity: 0.55, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <select
              id="referral"
              value={referral}
              onChange={(e) => setReferral(e.target.value as ReferralChannel)}
              className="dc-input"
            >
              <option value="">Prefer not to say</option>
              <option value="discord">Discord</option>
              <option value="reddit">Reddit</option>
              <option value="twitter">Twitter / X</option>
              <option value="facebook">Facebook</option>
              <option value="ai">AI (ChatGPT, Claude, etc.)</option>
              <option value="other">Other</option>
            </select>
            {referral === 'other' && (
              <input
                type="text"
                value={referralOther}
                onChange={(e) => setReferralOther(e.target.value)}
                placeholder="Tell us where (optional)"
                maxLength={120}
                className="dc-input"
                style={{ marginTop: '.5rem' }}
              />
            )}
          </div>
        )}

        <button type="submit" disabled={submitting} className="dc-btn dc-btn-block">
          {submitting
            ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
            : (mode === 'signin' ? 'Sign in →' : 'Create account →')}
        </button>

        {error && <p className="dc-form-error">{error}</p>}
      </form>

      {/* Divider */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '.75rem',
        margin: '1.5rem 0',
        color: 'var(--cream-mute)',
        fontFamily: 'var(--mono)',
        fontSize: '.6rem',
        letterSpacing: '.25em',
        textTransform: 'uppercase',
      }}>
        <span style={{ flex: 1, height: '1px', background: 'var(--ink-line)' }} />
        <span>or</span>
        <span style={{ flex: 1, height: '1px', background: 'var(--ink-line)' }} />
      </div>

      {/* Google */}
      <button
        type="button"
        onClick={onGoogle}
        disabled={submitting}
        className="dc-btn-ghost dc-btn-block"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.65rem' }}
      >
        <GoogleIcon />
        <span>Continue with Google</span>
      </button>

      {/* Magic link — sign-in tab only */}
      {mode === 'signin' && (
        <button
          type="button"
          onClick={onMagicLink}
          disabled={submitting || !email}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--cream-soft)',
            fontFamily: 'var(--mono)',
            fontSize: '.65rem',
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            cursor: email ? 'pointer' : 'not-allowed',
            padding: '1rem 0 0',
            width: '100%',
            textAlign: 'center',
            opacity: email ? 1 : 0.5,
          }}
          title={!email ? 'Enter your email above first' : undefined}
        >
          Send me a magic link instead →
        </button>
      )}
    </div>
  )
}

// Google "G" mark in the official colors. Inlined so we don't pull a brand
// asset file just for one button.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.614z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}
