'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// Bump WELCOME_VERSION when the slides below change in a way that
// readers should see again. Cosmetic/typo fixes — leave it alone, the
// popup stays dismissed for returning visitors. Material additions
// (new feature slides, reordered narrative) — bump it, and everyone
// sees the popup once on their next landing.
const WELCOME_VERSION = '2026-06-05-3'
const STORAGE_KEY = 'tsc-welcome-dismissed-v'

// Promo code surfaced on the greeting + promo slides. Single source so
// renaming is one edit. Set to null to hide the promo blocks.
const PROMO_CODE = 'FIRST50'
const PROMO_TAGLINE = '50% off your first issue'

type FeatureSlide = {
  kind: 'feature'
  badge: string
  kicker: string
  title: React.ReactNode
  body: React.ReactNode
  ornament?: 'left' | 'right' | 'starfield'
}

type Slide =
  | { kind: 'greet' }
  | FeatureSlide
  | { kind: 'promo' }
  | { kind: 'closing' }

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
    ornament: 'right',
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
    ornament: 'left',
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
    ornament: 'right',
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
    ornament: 'starfield',
  },
]

const ALL_SLIDES: Slide[] = [
  { kind: 'greet' },
  ...FEATURE_SLIDES,
  { kind: 'promo' },
  { kind: 'closing' },
]

// ── Decorative SVGs ────────────────────────────────────────────────
function Fleuron({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 12" aria-hidden>
      <path d="M0 6h22M38 6h22" stroke="currentColor" strokeWidth=".8" />
      <path d="M30 1.5l1.3 3.4L34.7 6l-3.4 1.1L30 10.5l-1.3-3.4L25.3 6l3.4-1.1L30 1.5z" fill="currentColor" />
    </svg>
  )
}

function SideOrnament({ side }: { side: 'left' | 'right' }) {
  return (
    <svg
      className={`lp-welcome-side lp-welcome-side-${side}`}
      viewBox="0 0 24 240"
      aria-hidden
    >
      <path d="M12 4v60M12 96v48M12 176v60" stroke="currentColor" strokeWidth=".8" />
      <circle cx="12" cy="80" r="2.2" fill="currentColor" />
      <circle cx="12" cy="160" r="2.2" fill="currentColor" />
      <path d="M9 24l3-6 3 6M9 216l3 6 3-6" stroke="currentColor" strokeWidth=".8" fill="none" />
    </svg>
  )
}

function StarField() {
  return (
    <svg className="lp-welcome-starfield" viewBox="0 0 400 600" aria-hidden>
      {[
        [40, 80], [120, 50], [200, 120], [330, 70], [70, 220], [280, 200],
        [180, 320], [60, 400], [340, 380], [150, 480], [300, 520], [90, 540],
        [230, 60], [360, 250], [40, 320], [240, 440], [320, 460], [110, 160],
      ].map(([x, y], i) => (
        <text
          key={i}
          x={x}
          y={y}
          fontSize={i % 3 === 0 ? 14 : i % 2 === 0 ? 9 : 6}
          fill="currentColor"
          opacity={i % 3 === 0 ? 0.18 : i % 2 === 0 ? 0.12 : 0.08}
          textAnchor="middle"
        >
          ★
        </text>
      ))}
    </svg>
  )
}

function MastheadOrnament() {
  return (
    <svg className="lp-welcome-masthead" viewBox="0 0 260 80" aria-hidden>
      <path d="M0 40h100M160 40h100" stroke="currentColor" strokeWidth=".8" />
      <g transform="translate(130 40)">
        <circle r="20" stroke="currentColor" strokeWidth=".8" fill="none" />
        <text x="0" y="6" fontSize="18" fill="currentColor" textAnchor="middle">★</text>
      </g>
      <text x="130" y="74" fontSize="7" fill="currentColor" textAnchor="middle" letterSpacing="3" opacity=".55">
        EST. 2026
      </text>
    </svg>
  )
}

// ── Component ──────────────────────────────────────────────────────
export function WelcomePopup({ signedIn }: { signedIn: boolean }) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  // Once the user has dismissed at least once, render a small sticky
  // reopen button at bottom-right so they can pull the popup back up.
  // Dismissal state persists across reloads; reopen state is derived
  // from "current localStorage matches WELCOME_VERSION".
  const [hasDismissed, setHasDismissed] = useState(false)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setMounted(true)
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY)
      if (dismissed === WELCOME_VERSION) {
        setHasDismissed(true)
      } else {
        setOpen(true)
      }
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
    setHasDismissed(true)
    setIndex(0)
  }

  function reopen() {
    setIndex(0)
    setOpen(true)
  }

  if (!mounted) return null

  if (!open) {
    if (!hasDismissed) return null
    return (
      <button
        type="button"
        className="lp-welcome-reopen"
        onClick={reopen}
        aria-label="Reopen what's new"
        title="What's new"
      >
        <span aria-hidden>★</span>
      </button>
    )
  }

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

        <div className="lp-welcome-body">
          {slide.kind === 'greet' && (
            <div className="lp-welcome-stage lp-welcome-stage-greet">
              <MastheadOrnament />
              <div className="lp-welcome-eyebrow">Vol. II · The Sunday Chronicle</div>
              <h2 className="lp-welcome-display" id="lp-welcome-heading">
                {signedIn ? <>Welcome <em>back</em> to the desk.</> : <>A new <em>page</em> turns.</>}
              </h2>
              <p className="lp-welcome-greet-lede">
                {signedIn
                  ? 'A few headlines from the desk since you last turned the page.'
                  : 'A handful of headlines before you turn the first page of your league’s almanac.'}
              </p>

              {PROMO_CODE && (
                <div className="lp-welcome-promo-pill" role="note">
                  <span className="lp-welcome-promo-label">Use code</span>
                  <span className="lp-welcome-promo-code">{PROMO_CODE}</span>
                  <span className="lp-welcome-promo-tag">{PROMO_TAGLINE}</span>
                </div>
              )}

              <Fleuron className="lp-welcome-fleuron" />
            </div>
          )}

          {slide.kind === 'feature' && (
            <div className="lp-welcome-stage">
              {slide.ornament === 'left' && <SideOrnament side="left" />}
              {slide.ornament === 'right' && <SideOrnament side="right" />}
              {slide.ornament === 'starfield' && <StarField />}

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

          {slide.kind === 'promo' && (
            <div className="lp-welcome-stage lp-welcome-stage-promo">
              <StarField />
              <div className="lp-welcome-eyebrow">A note from the publisher</div>
              <h2 className="lp-welcome-title" id="lp-welcome-heading">
                Half off your<br /><em>first issue.</em>
              </h2>
              <p className="lp-welcome-text">
                A token of welcome — apply <strong>{PROMO_CODE}</strong> at checkout
                for <strong>{PROMO_TAGLINE.toLowerCase()}</strong>. Good on any
                paid tier the first time you upgrade. One per reader.
              </p>

              <div className="lp-welcome-promo-card">
                <div className="lp-welcome-promo-card-label">Promo code</div>
                <div className="lp-welcome-promo-card-code">{PROMO_CODE}</div>
                <div className="lp-welcome-promo-card-tag">{PROMO_TAGLINE}</div>
              </div>
            </div>
          )}

          {slide.kind === 'closing' && (
            <div className="lp-welcome-stage lp-welcome-stage-closing">
              <div className="lp-welcome-mark" aria-hidden>§</div>
              <div className="lp-welcome-eyebrow">Open the book</div>
              <h2 className="lp-welcome-display" id="lp-welcome-heading">
                {signedIn ? <>Pick up where<br />you <em>left off.</em></> : <>Start your<br /><em>archive.</em></>}
              </h2>
              <p className="lp-welcome-text">
                {signedIn
                  ? 'Your library is waiting — every new feature above is live in your dashboard.'
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
              <Fleuron className="lp-welcome-fleuron" />
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
