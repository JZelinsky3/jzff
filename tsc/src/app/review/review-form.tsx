'use client'

// Star control + review form for /review. Shared by the desktop page and the
// mobile tree; `compact` shrinks the control, tightens the padding, and swaps
// in shorter labels rather than shipping a second copy of the form.
//
// The overall rating is the only required field. Everything below it is
// optional on purpose: the email's one-click stars drop people here with a
// rating already chosen, and the fastest path from "clicked a star" to
// "submitted" is one button. Prose is a bonus, not a toll.
//
// The four sub-ratings (design, finding your way around, speed, worth paying
// for) are taps rather than typing, which is the only reason they earn a spot
// in front of the submit button. On compact they start collapsed so the
// one-tap path stays one tap; on desktop there is room to show them open.
//
// Half stars are real, not decorative. Each star is two hit zones (left half
// = x.5, right half = x.0), which is why the control is hand-built rather
// than a radio group of five.

import { useId, useState } from 'react'

const STARS = [1, 2, 3, 4, 5]

// Sub-ratings, in the order they appear. `key` matches the API field and the
// column in site_reviews.
const ASPECTS = [
  { key: 'design', label: 'Design and look', short: 'Design' },
  { key: 'navigation', label: 'Finding your way around', short: 'Getting around' },
  { key: 'speed', label: 'How fast it felt', short: 'Speed' },
  { key: 'value', label: 'Worth paying for', short: 'Worth paying for' },
] as const

type AspectKey = (typeof ASPECTS)[number]['key']

// Surfaces someone can plausibly have opened. Deliberately not every page:
// this is a "what did you actually use" checklist, and a list long enough to
// scroll gets skipped. Stored as text so retiring an option later doesn't
// strand old rows.
const AREAS = [
  'League almanac',
  'Records & Hall',
  'Draft tools',
  "Pick'ems",
  'Power Rankings',
  'Live Season',
  'Trade Desk',
  'Games',
]

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

const GOLD = 'var(--gold, #e8c889)'
const GOLD_DEEP = 'var(--gold-deep, #a88a4a)'

function Star({ fill, gradientId }: { fill: 'full' | 'half' | 'empty'; gradientId: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      {/* Only the half state needs a gradient, and at most one star per row is
          ever half-filled, but the page now carries five star rows, so the id
          is scoped per row rather than hardcoded. The empty half is
          transparent rather than a dark fill: an unrated control should read
          as five outlined stars, not five dark blobs. */}
      {fill === 'half' && (
        <defs>
          <linearGradient id={gradientId}>
            <stop offset="50%" stopColor={GOLD} />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2.2l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.26l-5.9 3.1 1.12-6.57L2.45 9.14l6.6-.96L12 2.2z"
        fill={fill === 'full' ? GOLD : fill === 'half' ? `url(#${gradientId})` : 'transparent'}
        stroke={fill === 'empty' ? GOLD_DEEP : GOLD}
        strokeWidth={fill === 'empty' ? 1.1 : 0.7}
        strokeLinejoin="round"
      />
    </svg>
  )
}

// One row of five half-steppable stars. Hover lives inside the row so a
// preview in one row can't light up another; `onHover` is only for the main
// control, which prints the hovered value in its readout.
function StarRow({
  value,
  onChange,
  size,
  ariaLabel,
  gap = '.5rem',
  onHover,
}: {
  value: number | null
  onChange: (v: number) => void
  size: number
  ariaLabel: string
  gap?: string
  onHover?: (v: number | null) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const uid = useId()
  const shown = hover ?? value

  function hoverTo(v: number | null) {
    setHover(v)
    onHover?.(v)
  }

  return (
    <div
      style={{ display: 'flex', gap }}
      onMouseLeave={() => hoverTo(null)}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {STARS.map((n) => {
        const fill = shown === null || shown < n - 0.5 ? 'empty' : shown < n ? 'half' : 'full'
        return (
          <div key={n} style={{ position: 'relative', width: size, height: size }}>
            <Star fill={fill} gradientId={`${uid}-half`} />
            {/* Two invisible hit zones per star: left half = n-0.5, right = n. */}
            {[n - 0.5, n].map((val, i) => (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={value === val}
                aria-label={`${val} star${val === 1 ? '' : 's'}`}
                onMouseEnter={() => hoverTo(val)}
                onFocus={() => hoverTo(val)}
                onBlur={() => hoverTo(null)}
                onClick={() => onChange(val)}
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
    </div>
  )
}

export function ReviewForm({
  initialRating,
  source,
  signedInEmail,
  compact = false,
}: {
  initialRating: number | null
  source: string | null
  signedInEmail: string | null
  compact?: boolean
}) {
  const [rating, setRating] = useState<number | null>(initialRating)
  const [hover, setHover] = useState<number | null>(null)
  // Has the user touched the stars on THIS page? A rating carried in from the
  // email is a real choice, but it's one made in an inbox, where the 1-star
  // link is the leftmost and easiest to hit by accident. Until they confirm
  // it here, say out loud which rating is loaded so a mis-tap is visible
  // before it's submitted rather than after.
  const [touched, setTouched] = useState(false)
  const carriedIn = initialRating !== null && !touched
  // Sub-ratings, all null until touched. Kept in one object so the payload
  // and the "did they answer any of this" check stay one line each.
  const [aspects, setAspects] = useState<Record<AspectKey, number | null>>({
    design: null, navigation: null, speed: null, value: null,
  })
  const [areas, setAreas] = useState<string[]>([])
  const [wish, setWish] = useState('')
  // The detail block is a lot of control for a form whose whole pitch is
  // "one minute". Open on desktop where it costs nothing, closed on a phone
  // where it would push the submit button off the screen.
  const [detailOpen, setDetailOpen] = useState(!compact)
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
  const starSize = compact ? 38 : 46
  const answeredDetail =
    ASPECTS.filter((a) => aspects[a.key] !== null).length + (areas.length ? 1 : 0) + (wish.trim() ? 1 : 0)

  function setAspect(key: AspectKey, v: number | null) {
    setAspects((prev) => ({ ...prev, [key]: v }))
  }

  function toggleArea(name: string) {
    setAreas((prev) => (prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]))
  }

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
          rating_design: aspects.design,
          rating_navigation: aspects.navigation,
          rating_speed: aspects.speed,
          rating_value: aspects.value,
          used_areas: areas.length ? areas : null,
          wish: wish.trim() || null,
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
      <div style={{ ...panel(compact), textAlign: 'center' }}>
        <div style={kicker}>Filed</div>
        <p style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: compact ? '1.4rem' : '1.6rem', margin: '.5rem 0 .8rem' }}>
          Thanks.
        </p>
        <p style={{ opacity: 0.75, lineHeight: 1.65, margin: 0, fontSize: compact ? '.9rem' : '1rem' }}>
          {rating !== null && rating <= 3
            ? 'This one gets read first. If you left a note, expect a reply from a person.'
            : 'Your free month is already on your account, nothing to claim.'}
        </p>

        {/* The discount lands here rather than in the email. Shown for every
            submission, never conditioned on the rating: gating a reward on a
            good review is both bad feedback hygiene and the thing the FTC
            actually goes after. A 1-star review earns the same code. */}
        <div style={stub(compact)}>
          <div style={{ ...kicker, opacity: 1, color: 'var(--cream-soft, #c9c0ad)' }}>
            Promo code
          </div>
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
              fontWeight: 500,
              fontSize: compact ? '1.5rem' : '1.8rem',
              letterSpacing: '.3em',
              // Letter-spacing pads the right edge; nudge it back to centre.
              textIndent: '.3em',
              color: GOLD,
              background: 'var(--ink, #0e1620)',
              border: `1px dashed ${GOLD_DEEP}`,
              padding: compact ? '.7rem .5rem' : '.85rem .8rem',
              margin: '.9rem 0 .8rem',
              userSelect: 'all',
            }}
          >
            FIRST50
          </div>
          <div style={{ fontSize: compact ? '.82rem' : '.88rem', lineHeight: 1.6, opacity: 0.8 }}>
            50% off your first bill, once the free month ends. Enter it at checkout.
          </div>
        </div>

        <a href="/pricing" style={{ ...cta, display: 'inline-block', marginTop: '1.4rem' }}>
          See the plans
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={panel(compact)}>
      {/* ── Stars ─────────────────────────────────────────────────── */}
      <div style={{ ...kicker, textAlign: 'center' }}>The rating</div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          margin: compact ? '.8rem 0 .5rem' : '.9rem 0 .6rem',
        }}
      >
        <StarRow
          value={rating}
          onChange={(v) => { setRating(v); setTouched(true); setError(null) }}
          onHover={setHover}
          size={starSize}
          gap={compact ? '.35rem' : '.5rem'}
          ariaLabel="Rating out of five stars"
        />
      </div>
      {/* Readout sits under the row rather than beside it. Inline, it pushed
          the control off the side of a narrow phone. */}
      <div
        style={{
          textAlign: 'center',
          fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
          fontSize: '.75rem',
          letterSpacing: '.1em',
          color: shown === null ? 'var(--cream-soft, #c9c0ad)' : GOLD,
          opacity: shown === null ? 0.5 : 1,
          minHeight: '1.2em',
        }}
      >
        {shown === null ? 'TAP A STAR' : `${shown.toFixed(1)} · ${LABELS[String(shown)] ?? ''}`.toUpperCase()}
      </div>
      {carriedIn && (
        <div
          style={{
            textAlign: 'center',
            fontSize: '.8rem',
            lineHeight: 1.5,
            color: 'var(--cream-soft, #c9c0ad)',
            opacity: 0.75,
            marginTop: '.5rem',
          }}
        >
          Carried over from your email. Tap a star to change it.
        </div>
      )}

      {/* ── Detail (optional) ─────────────────────────────────────── */}
      <div style={detailWrap(compact)}>
        <button
          type="button"
          onClick={() => setDetailOpen((o) => !o)}
          style={detailToggle}
          aria-expanded={detailOpen}
        >
          <span style={{ ...kicker, opacity: 1 }}>
            The details {answeredDetail > 0 ? `· ${answeredDetail} answered` : '· optional'}
          </span>
          <span style={{ color: GOLD, fontSize: '.9rem', lineHeight: 1 }}>{detailOpen ? '▾' : '▸'}</span>
        </button>

        {detailOpen && (
          <>
            <p style={{ fontSize: compact ? '.78rem' : '.82rem', lineHeight: 1.6, opacity: 0.6, margin: '.7rem 0 1rem' }}>
              Skip anything you have no opinion on. Blank is a fine answer.
            </p>

            {ASPECTS.map((a) => (
              <div key={a.key} style={aspectRow(compact)}>
                <span style={{ fontSize: compact ? '.85rem' : '.9rem', color: 'var(--cream, #f4ebd8)' }}>
                  {compact ? a.short : a.label}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <StarRow
                    value={aspects[a.key]}
                    onChange={(v) => setAspect(a.key, v)}
                    size={compact ? 20 : 24}
                    gap=".18rem"
                    ariaLabel={a.label}
                  />
                  {/* A mis-tap on an optional field has to be undoable, or the
                      only way back to "no opinion" is reloading the page. */}
                  <button
                    type="button"
                    onClick={() => setAspect(a.key, null)}
                    disabled={aspects[a.key] === null}
                    aria-label={`Clear ${a.label}`}
                    style={{
                      background: 'none', border: 0, padding: '.1rem .2rem',
                      fontSize: '.68rem', letterSpacing: '.08em', textTransform: 'uppercase',
                      fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
                      color: 'var(--cream-soft, #c9c0ad)',
                      opacity: aspects[a.key] === null ? 0 : 0.55,
                      cursor: aspects[a.key] === null ? 'default' : 'pointer',
                    }}
                  >
                    Clear
                  </button>
                </span>
              </div>
            ))}

            <div style={{ ...label(compact), marginTop: compact ? '1.1rem' : '1.3rem' }}>
              Which parts did you actually use?
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
              {AREAS.map((name) => {
                const on = areas.includes(name)
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleArea(name)}
                    aria-pressed={on}
                    style={{
                      fontSize: '.75rem',
                      padding: '.4rem .7rem',
                      cursor: 'pointer',
                      background: on ? GOLD : 'transparent',
                      color: on ? 'var(--ink, #0e1620)' : 'var(--cream, #f4ebd8)',
                      border: `1px solid ${on ? GOLD : 'var(--ink-line, #2a3645)'}`,
                      fontFamily: 'inherit',
                    }}
                  >
                    {name}
                  </button>
                )
              })}
            </div>

            <label style={label(compact)} htmlFor="wish">Anything missing you wanted?</label>
            <textarea
              id="wish"
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              rows={2}
              maxLength={3000}
              placeholder={compact ? 'A page or stat you went looking for' : 'A page, a stat, a setting you went looking for and it was not there.'}
              style={field}
            />
          </>
        )}
      </div>

      {/* ── Prose ─────────────────────────────────────────────────── */}
      <label style={label(compact)} htmlFor="best">What did you like?</label>
      <textarea
        id="best"
        value={bestPart}
        onChange={(e) => setBestPart(e.target.value)}
        rows={3}
        maxLength={3000}
        placeholder={compact ? 'A page you kept going back to' : 'A page you kept going back to, a stat that surprised you.'}
        style={field}
      />

      <label style={label(compact)} htmlFor="worst">What was broken or confusing?</label>
      <textarea
        id="worst"
        value={needsWork}
        onChange={(e) => setNeedsWork(e.target.value)}
        rows={3}
        maxLength={3000}
        placeholder={compact ? 'A bug, or something that confused you' : 'A bug, a page that confused you, something you expected and could not find.'}
        style={field}
      />

      {!signedInEmail && (
        <>
          <label style={label(compact)} htmlFor="email">Your email</label>
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
      <label style={{ ...checkRow, marginTop: '1.3rem' }}>
        <input
          type="checkbox"
          checked={canQuote}
          onChange={(e) => setCanQuote(e.target.checked)}
          style={{ accentColor: GOLD, width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
        />
        <span>You can quote me on the site.</span>
      </label>
      {canQuote && (
        <input
          type="text"
          value={quoteName}
          onChange={(e) => setQuoteName(e.target.value)}
          maxLength={120}
          placeholder="Name to use"
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
        <p style={{ color: '#c14b36', fontSize: '.85rem', margin: '1rem 0 0', textAlign: 'center' }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={sending}
        style={{ ...cta, marginTop: '1.5rem', width: '100%', opacity: sending ? 0.6 : 1 }}
      >
        {sending ? 'Sending…' : 'Send it in'}
      </button>
      <p style={{ fontSize: '.7rem', opacity: 0.5, margin: '.8rem 0 0', lineHeight: 1.6, textAlign: 'center' }}>
        Nothing is published unless you tick the box.
      </p>
    </form>
  )
}

// ── Styles ───────────────────────────────────────────────────────────
// Inline rather than a module: this page is one form and the tokens it
// borrows (--ink-card, --gold, --cream) already carry the broadsheet skin.

const panel = (compact: boolean): React.CSSProperties => ({
  position: 'relative',
  background: 'var(--ink-card, #1a2532)',
  border: '1px solid var(--ink-line, #2a3645)',
  padding: compact ? '1.1rem 1rem 1.3rem' : 'clamp(1.4rem, 3vw, 2.4rem)',
  maxWidth: 680,
  margin: '0 auto',
})

// Coupon stub on the thank-you screen. Same treatment as the email's, so
// the code looks like the same object in both places.
const stub = (compact: boolean): React.CSSProperties => ({
  background: 'var(--ink, #0e1620)',
  border: '1px solid var(--ink-line, #2a3645)',
  borderTop: `3px solid ${GOLD_DEEP}`,
  padding: compact ? '1rem .9rem' : '1.3rem 1.2rem',
  marginTop: '1.6rem',
})

// The optional block reads as a panel inside the panel, so nobody mistakes
// the four extra star rows for four more required questions.
const detailWrap = (compact: boolean): React.CSSProperties => ({
  marginTop: compact ? '1.3rem' : '1.6rem',
  padding: compact ? '.8rem .85rem 1rem' : '1rem 1.1rem 1.2rem',
  background: 'var(--ink, #0e1620)',
  border: '1px solid var(--ink-line, #2a3645)',
})

const detailToggle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '.6rem',
  width: '100%',
  background: 'none',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  textAlign: 'left',
}

const aspectRow = (compact: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '.4rem .8rem',
  padding: compact ? '.45rem 0' : '.5rem 0',
  borderTop: '1px solid var(--ink-line, #2a3645)',
})

const kicker: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
  fontSize: '.66rem',
  letterSpacing: '.22em',
  textTransform: 'uppercase',
  color: 'var(--cream-soft, #c9c0ad)',
  opacity: 0.7,
}

const label = (compact: boolean): React.CSSProperties => ({
  display: 'block',
  fontSize: compact ? '.85rem' : '.9rem',
  margin: compact ? '1.1rem 0 .4rem' : '1.3rem 0 .45rem',
  color: 'var(--cream, #f4ebd8)',
})

const field: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--ink, #0e1620)',
  border: '1px solid var(--ink-line, #2a3645)',
  color: 'var(--cream, #f4ebd8)',
  padding: '.7rem .85rem',
  // 16px keeps iOS Safari from zooming the viewport on focus.
  fontSize: '16px',
  lineHeight: 1.55,
  fontFamily: 'inherit',
  resize: 'vertical',
}

const checkRow: React.CSSProperties = {
  display: 'flex',
  gap: '.6rem',
  alignItems: 'flex-start',
  fontSize: '.85rem',
  color: 'var(--cream, #f4ebd8)',
  cursor: 'pointer',
}

const cta: React.CSSProperties = {
  background: GOLD,
  color: 'var(--ink, #0e1620)',
  border: 0,
  padding: '.85rem 1.9rem',
  fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
  fontSize: '.78rem',
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  textDecoration: 'none',
  textAlign: 'center',
}
