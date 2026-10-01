'use client'

import { useState } from 'react'
import styles from './recap.module.css'

// The league's mailing list, as a clip-out subscription coupon. Anyone in
// the league can put their own address on it and get the paper every
// Tuesday, so it doesn't depend on the commissioner passing the link on.
// Double opt-in: the first thing that arrives is a confirmation email, and
// the copy says where to look for it, because that first email from a new
// sender is the one most likely to land in spam.
export function JoinList({ slug, league, from }: { slug: string; league: string; from: string }) {
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'already' | 'error'>('idle')
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state === 'busy') return
    setState('busy')
    try {
      const res = await fetch('/api/recap/subscribe/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email, website }),
      })
      const r = (await res.json().catch(() => null)) as { ok?: boolean; state?: string; error?: string } | null
      if (r?.ok) setState(r.state === 'already' ? 'already' : 'sent')
      else {
        setError(r?.error ?? 'Something went wrong. Try again in a minute.')
        setState('error')
      }
    } catch {
      setError('Something went wrong. Try again in a minute.')
      setState('error')
    }
  }

  return (
    <section className={styles.coupon} id="join" aria-labelledby="join-title">
      <div className={styles.couponTag}>The mailing list</div>
      <h2 id="join-title" className={styles.couponTitle}>
        Get the paper every Tuesday
      </h2>
      {state === 'sent' ? (
        <div className={styles.couponDone} role="status">
          <p>
            <b>Check your inbox.</b> A confirmation is on its way from <b>{from}</b>. Press the button in it and
            you&apos;re on the list.
          </p>
          <p className={styles.couponHint}>
            Not there in a minute? Look in spam or promotions and mark it as not spam, so Tuesday&apos;s paper lands in
            your inbox.
          </p>
        </div>
      ) : state === 'already' ? (
        <div className={styles.couponDone} role="status">
          <p>
            <b>You&apos;re already on the list.</b> The next paper comes the Tuesday after Monday night.
          </p>
        </div>
      ) : (
        <>
          <p className={styles.couponText}>
            Don&apos;t wait on the commish to post the link. Put your own email on the {league} list and the paper comes
            to you the morning after Monday night. One email a week, leave any time.
          </p>
          <form className={styles.couponForm} onSubmit={onSubmit}>
            <label className={styles.srOnly} htmlFor="join-email">
              Your email
            </label>
            <input
              id="join-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {/* Honeypot: hidden from people, filled by bots. */}
            <input
              className={styles.srOnly}
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
            <button type="submit" disabled={state === 'busy'}>
              {state === 'busy' ? 'Sending' : 'Join the list'}
            </button>
          </form>
          {state === 'error' ? (
            <p className={styles.couponError} role="alert">
              {error}
            </p>
          ) : (
            <p className={styles.couponHint}>
              We&apos;ll send one email to confirm it&apos;s you. If it isn&apos;t in your inbox, check spam.
            </p>
          )}
        </>
      )}
    </section>
  )
}
