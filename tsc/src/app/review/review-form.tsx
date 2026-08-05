'use client'

// Star control + review form for /review.
//
// The rating is the only required field. Everything below it is optional on
// purpose: the email's one-click stars drop people here with a rating already
// chosen, and the fastest path from "clicked a star" to "submitted" is one
// button. Prose is a bonus, not a toll.
//
// Half stars are real, not decorative. Each star is two hit zones (left half
// = x.5, right half = x.0), which is why the control is hand-built rather
// than a radio group of five.

import { useState } from 'react'

const STARS = [1, 2, 3, 4, 5]

const LABELS: Record<string, string> = {
  '1': 'Rough',
  '1.5': 'Rough',
  '2': 'Needs work',
  '2.5': 'Needs work',
  '3': 'Fine',
  '3.5': 'Good',
  '4': 'Good',
  '4.5': 'Great',
  '5': 'Perfect',
}

function Star({ fill }: { fill: 'full' | 'half' | 'empty' }) {
  const gold = 'var(--gold, #e8c889)'
  const dim = 'var(--ink-line, #2a3645)'
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      {/* Only the half state needs a gradient, and at most one star is ever
          half-filled — so this id stays unique in the document. */}
      {fill === 'half' && (
        <defs>
          <linearGradient id="tsc-star-half">
            <stop offset="50%" stopColor={gold} />
            <stop offset="50%" stopColor={dim} />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2.2l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.26l-5.9 3.1 1.12-6.57L2.45 9.14l6.6-.96L12 2.2z"
        fill={fill === 'full' ? gold : fill === 'half' ? 'url(#tsc-star-half)' : dim}
        stroke={fill === 'empty' ? dim : 'var(--gold-deep, #a88a4a)'}
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ReviewForm({
  initialRating,
  source,
  signedInEmail,
}: {
  initialRating: number | null
  source: string | null
  signedInEmail: string | null
}) {
  const [rating, setRating] = useState<number | null>(initialRating)
  const [hover, setHover] = useState<number | null>(null)
  const [bestPart, setBestPart] = useState('')
  const [needsWork, setNeedsWork] = useState('')
  const [canQuote, setCanQuote] = useState(false)
  const [quoteName, setQuoteName] = useState('')
  const [email, setEmail] = useState('')
  const [hp, setHp] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Hover wins over the committed value so the control previews as you move.
  const shown = hover ?? rating

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === null) {
      setError('Pick a star rating first.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          best_part: bestPart.trim() || null,
          needs_work: needsWork.trim() || null,
          can_quote: canQuote,
          quote_name: canQuote ? quoteName.trim() || null : null,
          // Signed-in users are identified server-side; only ask signed-out
          // visitors, and only so a reply is possible.
          email: signedInEmail ? null : email.trim() || null,
          source,
          hp,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Could not send that. Try again shortly.')
        setSending(false)
        return
      }
      setDone(true)
    } catch {
      setError('Could not send that. Check your connection and try again.')
      setSending(false)
    }
  }

  if (done) {
    return (
      <div style={panel}>
        <div style={{ ...kicker, color: 'var(--gold, #e8c889)' }}>Filed</div>
        <p style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: '1.6rem', margin: '.4rem 0 .8rem' }}>
          Thank you. Genuinely.
        </p>
        <p style={{ opacity: 0.75, lineHeight: 1.65, margin: 0 }}>
          {rating !== null && rating <= 3
            ? 'This one gets read first. If you left a note about what needs work, expect a reply from a person, not a template.'
            : 'Every note gets read. Your free month is already attached to your account, nothing to claim.'}
        </p>
        <a href="/dashboard" style={{ ...cta, display: 'inline-block', marginTop: '1.4rem' }}>
          Back to your leagues
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={panel}>
      {/* ── Stars ─────────────────────────────────────────────────── */}
      <div style={kicker}>Step one · The rating</div>
      <div
        style={{ display: 'flex', gap: '.5rem', margin: '.9rem 0 .5rem' }}
        onMouseLeave={() => setHover(null)}
        role="radiogroup"
        aria-label="Rating out of five stars"
      >
        {STARS.map((n) => {
          const fill = shown === null || shown < n - 0.5 ? 'empty' : shown < n ? 'half' : 'full'
          return (
            <div key={n} style={{ position: 'relative', width: 46, height: 46 }}>
              <Star fill={fill} />
              {/* Two invisible hit zones per star: left half = n-0.5, right = n. */}
              {[n - 0.5, n].map((val, i) => (
                <button
                  key={val}
                  type="button"
                  role="radio"
                  aria-checked={rating === val}
                  aria-label={`${val} star${val === 1 ? '' : 's'}`}
                  onMouseEnter={() => setHover(val)}
                  onFocus={() => setHover(val)}
                  onBlur={() => setHover(null)}
                  onClick={() => { setRating(val); setError(null) }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: i === 0 ? 0 : '50%',
                    width: '50%',
                    height: '100%',
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          )
        })}
        <div
          style={{
            alignSelf: 'center',
            marginLeft: '.8rem',
            fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
            fontSize: '.8rem',
            letterSpacing: '.1em',
            color: shown === null ? 'var(--cream-soft, #c9c0ad)' : 'var(--gold, #e8c889)',
            opacity: shown === null ? 0.5 : 1,
          }}
        >
          {shown === null ? 'PICK ONE' : `${shown.toFixed(1)} · ${LABELS[String(shown)] ?? ''}`.toUpperCase()}
        </div>
      </div>

      {/* ── Prose ─────────────────────────────────────────────────── */}
      <div style={{ ...kicker, marginTop: '2rem' }}>Step two · Optional, but the useful part</div>
      <label style={label} htmlFor="best">What did you actually like?</label>
      <textarea
        id="best"
        value={bestPart}
        onChange={(e) => setBestPart(e.target.value)}
        rows={3}
        maxLength={3000}
        placeholder="A page you kept going back to, a stat that surprised you, something your league reacted to."
        style={field}
      />

      <label style={label} htmlFor="worst">What was broken, confusing, or missing?</label>
      <textarea
        id="worst"
        value={needsWork}
        onChange={(e) => setNeedsWork(e.target.value)}
        rows={3}
        maxLength={3000}
        placeholder="Be blunt. This is the part that changes what gets built next."
        style={field}
      />

      {!signedInEmail && (
        <>
          <label style={label} htmlFor="email">Your email (only so a reply is possible)</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            placeholder="you@example.com"
            style={field}
          />
        </>
      )}

      {/* ── Consent ───────────────────────────────────────────────── */}
      <label style={{ ...checkRow, marginTop: '1.4rem' }}>
        <input
          type="checkbox"
          checked={canQuote}
          onChange={(e) => setCanQuote(e.target.checked)}
          style={{ accentColor: 'var(--gold, #e8c889)', width: 16, height: 16, marginTop: 2 }}
        />
        <span>You can quote me on the site.</span>
      </label>
      {canQuote && (
        <input
          type="text"
          value={quoteName}
          onChange={(e) => setQuoteName(e.target.value)}
          maxLength={120}
          placeholder="Name to use. First name and league is plenty"
          style={{ ...field, marginTop: '.6rem' }}
        />
      )}

      {/* Honeypot. Off-screen, never focusable by a real user. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />

      {error && (
        <p style={{ color: '#c14b36', fontSize: '.85rem', margin: '1rem 0 0' }}>{error}</p>
      )}

      <button type="submit" disabled={sending} style={{ ...cta, marginTop: '1.6rem', opacity: sending ? 0.6 : 1 }}>
        {sending ? 'Sending…' : 'Send it in'}
      </button>
      <p style={{ fontSize: '.72rem', opacity: 0.5, margin: '.9rem 0 0', lineHeight: 1.6 }}>
        Nothing here is published without the box above ticked.
      </p>
    </form>
  )
}

// ── Styles ───────────────────────────────────────────────────────────
// Inline rather than a module: this page is one form and the tokens it
// borrows (--ink-card, --gold, --cream) already carry the broadsheet skin.

const panel: React.CSSProperties = {
  position: 'relative',
  background: 'var(--ink-card, #1a2532)',
  border: '1px solid var(--ink-line, #2a3645)',
  padding: 'clamp(1.4rem, 3vw, 2.4rem)',
  maxWidth: 680,
  margin: '0 auto',
}

const kicker: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
  fontSize: '.68rem',
  letterSpacing: '.22em',
  textTransform: 'uppercase',
  color: 'var(--cream-soft, #c9c0ad)',
  opacity: 0.7,
}

const label: React.CSSProperties = {
  display: 'block',
  fontSize: '.9rem',
  margin: '1.3rem 0 .45rem',
  color: 'var(--cream, #f4ebd8)',
}

const field: React.CSSProperties = {
  width: '100%',
  background: 'var(--ink, #0e1620)',
  border: '1px solid var(--ink-line, #2a3645)',
  color: 'var(--cream, #f4ebd8)',
  padding: '.7rem .85rem',
  fontSize: '.92rem',
  lineHeight: 1.6,
  fontFamily: 'inherit',
  resize: 'vertical',
}

const checkRow: React.CSSProperties = {
  display: 'flex',
  gap: '.6rem',
  alignItems: 'flex-start',
  fontSize: '.88rem',
  color: 'var(--cream, #f4ebd8)',
  cursor: 'pointer',
}

const cta: React.CSSProperties = {
  background: 'var(--gold, #e8c889)',
  color: 'var(--ink, #0e1620)',
  border: 0,
  padding: '.85rem 1.9rem',
  fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
  fontSize: '.78rem',
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  textDecoration: 'none',
}
