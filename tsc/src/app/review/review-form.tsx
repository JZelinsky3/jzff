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
// The four sub-ratings (design, finding your way around, speed, is the price
// fair) are taps rather than typing, which is the only reason they earn a spot
// in front of the submit button. They are deliberately NOT stacked as four
// star rows in a column — that reads as a survey and gets one lazy pass of
// identical scores. Each one heads a short numbered section and is followed
// by the written question it belongs to, so the answers stay separated by
// something that takes a different kind of attention.
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
  { key: 'value', label: 'Is the price fair?', short: 'Fair price' },
] as const

type AspectKey = (typeof ASPECTS)[number]['key']

// The site in five answerable pieces. Page-by-page options were too fine a
// cut — half of them are one screen each, so "favourite" turned into a list
// of trivia. These are the sections someone actually spends time in, and the
// note under each name is what makes a group legible without a legend.
// Stored as text so retiring an option later doesn't strand old rows.
const AREAS = [
  { name: 'The whole thing', note: 'Taken together, as one site' },
  { name: 'History', note: 'Standings, seasons, drafts, records' },
  { name: 'Live Season', note: "Pick'ems, power rankings, matchups" },
  { name: 'Trade Desk', note: 'Analyzer, finder, mock trades' },
  { name: 'Games', note: 'Roulette, Gauntlet, Over/Under, Redraft' },
] as const

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
const RUST = 'var(--rust, #a04830)'

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

// A sub-rating: its question on the left, five small stars on the right, and
// a Clear that only exists once there is something to clear. A mis-tap on an
// optional field has to be undoable, or the only way back to "no opinion" is
// reloading the page.
function AspectStars({
  aspect,
  value,
  onChange,
  compact,
}: {
  aspect: (typeof ASPECTS)[number]
  value: number | null
  onChange: (v: number | null) => void
  compact: boolean
}) {
  return (
    <div style={aspectRow(compact)}>
      <span style={{ fontSize: compact ? '.85rem' : '.9rem', color: 'var(--cream, #f4ebd8)' }}>
        {compact ? aspect.short : aspect.label}
      </span>
      {/* marginLeft:auto, not just space-between. On a narrow phone the row
          wraps and the stars land on a line of their own, where
          space-between has nothing to push against and leaves them adrift at
          the left. The auto margin keeps them on the right edge either way. */}
      <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginLeft: 'auto' }}>
        <StarRow
          value={value}
          onChange={onChange}
          size={compact ? 20 : 24}
          gap=".18rem"
          ariaLabel={aspect.label}
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={value === null}
          aria-label={`Clear ${aspect.label}`}
          style={{
            background: 'none', border: 0, padding: '.1rem .2rem',
            fontSize: '.68rem', letterSpacing: '.08em', textTransform: 'uppercase',
            fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
            color: 'var(--cream-soft, #c9c0ad)',
            opacity: value === null ? 0 : 0.55,
            cursor: value === null ? 'default' : 'pointer',
          }}
        >
          Clear
        </button>
      </span>
    </div>
  )
}

// The option list as picked cells rather than a run of chips. Used twice:
// favourite and least favourite, both multi-select. `accent` is what
// separates the second one visually — rust reads as the negative answer
// without needing the word "worst" anywhere.
//
// Each cell carries the group name and, under it, the pages it covers. The
// second line is the reason this is a cell and not a chip: a bare word like
// "History" doesn't say what is inside it, and eight bare words in a row was
// the wall that made this section unreadable.
function OptionCells({
  selected,
  onPick,
  accent,
  compact,
}: {
  selected: string[]
  onPick: (name: string) => void
  accent: string
  compact: boolean
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
        gap: '.4rem',
      }}
    >
      {AREAS.map(({ name, note }) => {
        const on = selected.includes(name)
        return (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name)}
            aria-pressed={on}
            style={{
              display: 'block',
              textAlign: 'left',
              padding: compact ? '.45rem .6rem' : '.5rem .7rem',
              cursor: 'pointer',
              background: on ? accent : 'transparent',
              color: on ? 'var(--ink, #0e1620)' : 'var(--cream, #f4ebd8)',
              border: `1px solid ${on ? accent : 'var(--ink-line, #2a3645)'}`,
              fontFamily: 'inherit',
            }}
          >
            <span style={{ display: 'block', fontSize: compact ? '.8rem' : '.82rem' }}>{name}</span>
            <span
              style={{
                display: 'block',
                marginTop: '.12rem',
                fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
                fontSize: '.58rem',
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: on ? 'var(--ink, #0e1620)' : 'var(--cream-soft, #c9c0ad)',
                opacity: on ? 0.7 : 0.5,
              }}
            >
              {note}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// The head of one question inside a section. Serif italic, a size up from
// everything under it: the cells are small sans, so the question can't be
// mistaken for one more option. No "pick one / pick any" tag — both
// questions take as many answers as you want, and a rule nobody needs told
// is just another line of text competing with the question.
function QuestionHead({ children, compact }: { children: React.ReactNode; compact: boolean }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-dm-serif), Georgia, serif',
        fontStyle: 'italic',
        fontSize: compact ? '1.02rem' : '1.1rem',
        color: 'var(--cream, #f4ebd8)',
        marginBottom: compact ? '.55rem' : '.6rem',
      }}
    >
      {children}
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
  // Favourite / least favourite over the same five groups, both multi-select.
  // Nothing stops the same group appearing in both — people are allowed to
  // love a section and hate one page of it, and forcing a choice there just
  // loses the answer.
  const [favorite, setFavorite] = useState<string[]>([])
  const [leastFavorite, setLeastFavorite] = useState<string[]>([])
  const [wish, setWish] = useState('')
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
  function setAspect(key: AspectKey, v: number | null) {
    setAspects((prev) => ({ ...prev, [key]: v }))
  }

  // Second tap on a lit cell clears it, which is the only way back to "no
  // answer" on an optional question.
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>) => (name: string) =>
    set((prev) => (prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]))

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
          favorite_areas: favorite.length ? favorite : null,
          least_favorite_areas: leastFavorite.length ? leastFavorite : null,
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

      <p style={{ fontSize: compact ? '.78rem' : '.82rem', lineHeight: 1.6, opacity: 0.6, margin: compact ? '1.2rem 0 0' : '1.5rem 0 0', textAlign: 'center' }}>
        The rest is optional. Skip anything you have no opinion on.
      </p>

      {/* ── § 01 · The look ───────────────────────────────────────── */}
      <section style={sectionBox(compact)}>
        <div style={sectionHead(compact)}>§ 01 · The look</div>
        <AspectStars
          aspect={ASPECTS[0]}
          value={aspects.design}
          onChange={(v) => setAspect('design', v)}
          compact={compact}
        />
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
      </section>

      {/* ── § 02 · Getting around ─────────────────────────────────── */}
      <section style={sectionBox(compact)}>
        <div style={sectionHead(compact)}>§ 02 · Getting around</div>
        <AspectStars
          aspect={ASPECTS[1]}
          value={aspects.navigation}
          onChange={(v) => setAspect('navigation', v)}
          compact={compact}
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
      </section>

      {/* ── § 03 · The sections ───────────────────────────────────── */}
      <section style={sectionBox(compact)}>
        <div style={sectionHead(compact)}>§ 03 · The sections</div>
        <AspectStars
          aspect={ASPECTS[2]}
          value={aspects.speed}
          onChange={(v) => setAspect('speed', v)}
          compact={compact}
        />

        {/* Two questions, two ruled blocks. Favourite and least favourite are
            the answers that rank the sections against each other, which is
            what decides what gets built next. */}
        <div style={qBlock(compact)}>
          <QuestionHead compact={compact}>What was your favorite part?</QuestionHead>
          <OptionCells
            selected={favorite}
            onPick={toggle(setFavorite)}
            accent={GOLD}
            compact={compact}
          />
        </div>

        <div style={qBlock(compact)}>
          <QuestionHead compact={compact}>And your least favorite?</QuestionHead>
          <OptionCells
            selected={leastFavorite}
            onPick={toggle(setLeastFavorite)}
            accent={RUST}
            compact={compact}
          />
        </div>
      </section>

      {/* ── § 04 · The price ──────────────────────────────────────── */}
      <section style={sectionBox(compact)}>
        <div style={sectionHead(compact)}>§ 04 · The price</div>
        <AspectStars
          aspect={ASPECTS[3]}
          value={aspects.value}
          onChange={(v) => setAspect('value', v)}
          compact={compact}
        />
        <label style={label(compact)} htmlFor="wish">What would you like to see added?</label>
        <textarea
          id="wish"
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          rows={2}
          maxLength={3000}
          placeholder={compact ? 'A page, a stat, a tool you would want next' : 'A page, a stat, a tool you would want next.'}
          style={field}
        />
      </section>

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

// Each optional section is a panel inside the panel, so nobody mistakes the
// numbered blocks below the required stars for four more required questions.
const sectionBox = (compact: boolean): React.CSSProperties => ({
  marginTop: compact ? '1rem' : '1.2rem',
  padding: compact ? '.85rem .85rem 1rem' : '1rem 1.1rem 1.2rem',
  background: 'var(--ink, #0e1620)',
  border: '1px solid var(--ink-line, #2a3645)',
})

// Section headers (§ 01 .. § 04). Deliberately NOT the same treatment as the
// questions underneath them: mono, uppercase, gold, and sitting on a rule.
// The questions are sentence-case cream sans. Two different typefaces, two
// different colours and a line between them, so a section title can never be
// mistaken for one more thing being asked.
const sectionHead = (compact: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
  fontSize: '.66rem',
  letterSpacing: '.22em',
  textTransform: 'uppercase',
  color: GOLD,
  borderBottom: '1px solid var(--ink-line, #2a3645)',
  paddingBottom: compact ? '.5rem' : '.55rem',
})

// One question inside a section. The rule on top is what gives §03 three
// visible bands instead of one run-on column.
const qBlock = (compact: boolean): React.CSSProperties => ({
  marginTop: compact ? '.9rem' : '1.1rem',
  paddingTop: compact ? '.9rem' : '1rem',
  borderTop: '1px solid var(--ink-line, #2a3645)',
})

const aspectRow = (compact: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '.4rem .8rem',
  marginTop: compact ? '.5rem' : '.6rem',
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
