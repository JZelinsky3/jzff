'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup'
type Status = 'idle' | 'submitting' | 'sent' | 'error'

// Mobile-native auth form. Same auth flows as the desktop LoginForm
// (password sign-in/up, magic link, password reset, Google OAuth), but
// laid out as an app screen — segmented control, large pill inputs,
// bottom-anchored primary CTA.
export function MobileLoginForm({ next, initialMode = 'signin' }: { next?: string; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [showPw, setShowPw] = useState(false)

  function reset() {
    setStatus('idle'); setError(null); setInfo(null)
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    reset(); setStatus('submitting')
    const supabase = createClient()

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setStatus('error'); setError(error.message); return }
      window.location.assign(next || '/hub')
      return
    }

    const redirectTo = new URL('/auth/callback', window.location.origin)
    if (next) redirectTo.searchParams.set('next', next)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo.toString() },
    })
    if (error) { setStatus('error'); setError(error.message); return }
    if (data.session) {
      window.location.assign(next || '/hub')
      return
    }
    setStatus('sent')
    setInfo(`Confirm your email — we sent a verification link to ${email}.`)
  }

  async function onMagicLink() {
    reset(); setStatus('submitting')
    const supabase = createClient()
    const redirectTo = new URL('/auth/callback', window.location.origin)
    if (next) redirectTo.searchParams.set('next', next)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo.toString() },
    })
    if (error) { setStatus('error'); setError(error.message); return }
    setStatus('sent')
    setInfo(`Check your inbox — a magic link is on its way to ${email}.`)
  }

  async function onForgotPassword() {
    if (!email) {
      setError('Enter your email above first, then tap Forgot password.')
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
    if (error) { setStatus('error'); setError(error.message); return }
    setStatus('sent')
    setInfo(`Password reset link sent to ${email}. Tap it, then change your password from your account page.`)
  }

  async function onGoogle() {
    reset(); setStatus('submitting')
    const supabase = createClient()
    const redirectTo = new URL('/auth/callback', window.location.origin)
    if (next) redirectTo.searchParams.set('next', next)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.toString() },
    })
    if (error) { setStatus('error'); setError(error.message) }
  }

  if (status === 'sent') {
    return (
      <div className="mlogin-sent">
        <div className="mlogin-sent-mark">✓</div>
        <div className="mlogin-sent-title">Check your <em>inbox.</em></div>
        <p className="mlogin-sent-body">{info}</p>
        <button type="button" onClick={reset} className="mlogin-sent-back">
          Back
        </button>
      </div>
    )
  }

  const submitting = status === 'submitting'

  return (
    <div className="mlogin-form">
      <div className="mlogin-seg" role="tablist" aria-label="Auth mode">
        {(['signin', 'signup'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            type="button"
            onClick={() => { setMode(m); reset() }}
            className={`mlogin-seg-btn${mode === m ? ' is-active' : ''}`}
          >
            {m === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        ))}
      </div>

      <form onSubmit={onPasswordSubmit} className="mlogin-fields">
        <label className="mlogin-field">
          <span className="mlogin-field-label">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mlogin-input"
          />
        </label>

        <label className="mlogin-field">
          <span className="mlogin-field-label">Password</span>
          <div className="mlogin-input-wrap">
            <input
              type={showPw ? 'text' : 'password'}
              required
              minLength={mode === 'signup' ? 8 : 1}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
              className="mlogin-input mlogin-input-pw"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="mlogin-pw-toggle"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
          {mode === 'signin' && (
            <button
              type="button"
              onClick={onForgotPassword}
              disabled={submitting}
              className="mlogin-forgot"
            >
              Forgot password?
            </button>
          )}
        </label>

        {error && <p className="mlogin-error">{error}</p>}

        <button type="submit" disabled={submitting} className="mlogin-cta">
          {submitting
            ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
            : (mode === 'signin' ? 'Sign in' : 'Create account')}
        </button>
      </form>

      <div className="mlogin-or">
        <span /><span className="mlogin-or-txt">or</span><span />
      </div>

      <button
        type="button"
        onClick={onGoogle}
        disabled={submitting}
        className="mlogin-google"
      >
        <GoogleIcon />
        <span>Continue with Google</span>
      </button>

      {mode === 'signin' && (
        <button
          type="button"
          onClick={onMagicLink}
          disabled={submitting || !email}
          className="mlogin-magic"
          title={!email ? 'Enter your email above first' : undefined}
        >
          Send me a magic link instead
        </button>
      )}
    </div>
  )
}

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
