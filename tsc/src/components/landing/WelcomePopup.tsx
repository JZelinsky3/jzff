'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// Bump WELCOME_VERSION when the slides below change in a way that
// readers should see again. Cosmetic/typo fixes — leave it alone, the
// popup stays dismissed for returning visitors. Material additions
// (new feature slides, reordered narrative) — bump it, and everyone
// sees the popup once on their next landing.
const WELCOME_VERSION = '2026-06-05-2'
const STORAGE_KEY = 'tsc-welcome-dismissed-v'

type FeatureSlide = {
  kind: 'feature'
  badge: string
  kicker: string
  title: React.ReactNode
  body: React.ReactNode
}

type GreetSlide = {
  kind: 'greet'
}

type ClosingSlide = {
  kind: 'closing'
}

type Slide = GreetSlide | FeatureSlide | ClosingSlide

// Slide 1 (greeting) is rendered specially using the signedIn prop —
// hence not in this array. Same for the closing slide. Feature slides
// in between are the "what's new" headlines.
const FEATURE_SLIDES: FeatureSlide[] = [
  {
    kind: 'feature',
    badge: 'NEW',
    kicker: '★ UDFA · Free forever',
    title: (
      <>
        Your first league —<br />
        <em>on the house.</em>
      </>
    ),
    body: (
      <>
        One league. No credit card. No expiration. Run the whole almanac for
        free, forever. Upgrade to <strong>Vol. II</strong> when you want
        Pick&apos;ems, Power Rankings, the Live Season Hub, and the Manager Hub.
      </>
    ),
  },
  {
    kind: 'feature',
    badge: 'LIVE',
    kicker: '§ Live Season Hub',
    title: (
      <>
        The almanac,<br />
        <em>week by week.</em>
      </>
    ),
    body: (
      <>
        <strong>Matchup Preview</strong> lays out the upcoming slate with form,
        narrative, and rivalry weight. <strong>Best Coach Tracker</strong> grades
        start/sit decisions league-wide. The off-season chronicle now has a
        Sunday voice.
      </>
    ),
  },
  {
    kind: 'feature',
    badge: 'NEW',
    kicker: '✦ Manager Hub',
    title: (
      <>
        A career chronicle<br />
        <em>for every manager.</em>
      </>
    ),
    body: (
      <>
        Six issues — Dynasty, Wire, Records, Rivalries, Legacy, Future — across
        every league a manager touches. Personal, editorial, and pulling live
        Sleeper data through per-chronicle aliases.
      </>
    ),
  },
  {
    kind: 'feature',
    badge: 'EXPANDED',
    kicker: '★ Platforms',
    title: (
      <>
        Now reading<br />
        <em>Yahoo & ESPN.</em>
      </>
    ),
    body: (
      <>
        Sleeper, Yahoo, ESPN, and NFL.com all bind into the same almanac. Bring
        a league ID and we walk every season back to the beginning — no matter
        where it&apos;s hosted.
      </>
    ),
  },
]

const ALL_SLIDES: Slide[] = [
  { kind: 'greet' },
  ...FEATURE_SLIDES,
  { kind: 'closing' },
]

export function WelcomePopup({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY)
      if (dismissed !== WELCOME_VERSION) setOpen(true)
    } catch {
      setOpen(true)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss()
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(ALL_SLIDES.length - 1, i + 1))
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function dismiss() {
    try { window.localStorage.setItem(STORAGE_KEY, WELCOME_VERSION) } catch {}
    setOpen(false)
  }

  if (!open) return null

  const slide = ALL_SLIDES[index]
  const isFirst = index === 0
  const isLast = index === ALL_SLIDES.length - 1

  return (
    <div
      className="lp-welcome-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lp-welcome-heading"
      onClick={dismiss}
    >
      <div className="lp-welcome-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="lp-welcome-close"
          aria-label="Close"
          onClick={dismiss}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <div className="lp-welcome-bar" aria-hidden>
          <div
            className="lp-welcome-bar-fill"
            style={{ width: `${((index + 1) / ALL_SLIDES.length) * 100}%` }}
          />
        </div>

        <div className="lp-welcome-body">
          {slide.kind === 'greet' && (
            <div className="lp-welcome-stage lp-welcome-stage-greet">
              <div className="lp-welcome-mark" aria-hidden>★</div>
              <div className="lp-welcome-eyebrow">Vol. II · The Sunday Chronicle</div>
              <h2 className="lp-welcome-hello" id="lp-welcome-heading">
                {signedIn ? <>Welcome <em>back.</em></> : <>Hello.</>}
              </h2>
              <p className="lp-welcome-greet-lede">
                {signedIn
                  ? 'A few headlines from the desk since you last turned the page.'
                  : 'A few headlines from the desk before you turn the first page.'}
              </p>
              <div className="lp-welcome-greet-tease">
                <span>What&apos;s in this issue —</span>
                <ul>
                  <li>A free-forever tier called UDFA</li>
                  <li>The Live Season Hub goes live</li>
                  <li>A six-issue Manager Hub</li>
                  <li>Yahoo &amp; ESPN now reading</li>
                </ul>
              </div>
            </div>
          )}

          {slide.kind === 'feature' && (
            <div className="lp-welcome-stage">
              <div className="lp-welcome-row">
                <span className="lp-welcome-badge">{slide.badge}</span>
                <span className="lp-welcome-counter">
                  {String(index).padStart(2, '0')} / {String(ALL_SLIDES.length - 2).padStart(2, '0')}
                </span>
              </div>
              <div className="lp-welcome-kicker">{slide.kicker}</div>
              <h2 className="lp-welcome-title" id="lp-welcome-heading">{slide.title}</h2>
              <p className="lp-welcome-text">{slide.body}</p>
            </div>
          )}

          {slide.kind === 'closing' && (
            <div className="lp-welcome-stage lp-welcome-stage-closing">
              <div className="lp-welcome-mark" aria-hidden>§</div>
              <div className="lp-welcome-eyebrow">Open the book</div>
              <h2 className="lp-welcome-title" id="lp-welcome-heading">
                {signedIn ? <>Pick up where you<br /><em>left off.</em></> : <>Start your<br /><em>archive.</em></>}
              </h2>
              <p className="lp-welcome-text">
                {signedIn
                  ? 'Your library is waiting — and every new feature above is live in your dashboard.'
                  : 'Bring a league ID and we walk every season back to the beginning. Free forever to start, no card.'}
              </p>
              <div className="lp-welcome-cta-row">
                <Link
                  href={signedIn ? '/dashboard' : '/login?mode=signup'}
                  className="dc-btn lp-welcome-cta"
                  onClick={dismiss}
                >
                  {signedIn ? 'Open dashboard →' : 'Start your archive →'}
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="lp-welcome-foot">
          <div className="lp-welcome-dots" aria-hidden>
            {ALL_SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`lp-welcome-dot${i === index ? ' is-active' : ''}`}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>

          <div className="lp-welcome-arrows">
            <button
              type="button"
              className="lp-welcome-arrow"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={isFirst}
              aria-label="Previous"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M9 1L3 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </button>
            <button
              type="button"
              className="lp-welcome-arrow lp-welcome-arrow-primary"
              onClick={() => {
                if (isLast) dismiss()
                else setIndex((i) => Math.min(ALL_SLIDES.length - 1, i + 1))
              }}
              aria-label={isLast ? 'Done' : 'Next'}
            >
              {isLast ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M2 7.5l3.2 3.2L12 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M5 1l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
