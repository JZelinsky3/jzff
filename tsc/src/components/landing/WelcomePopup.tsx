'use client'

import { useEffect, useState } from 'react'

// Bump WELCOME_VERSION when the slides below change in a way that
// readers should see again. Cosmetic/typo fixes — leave it alone, the
// popup stays dismissed for returning visitors. Material additions
// (new feature slides, reordered narrative) — bump it, and everyone
// sees the popup once on their next landing.
const WELCOME_VERSION = '2026-06-05-1'
const STORAGE_KEY = 'tsc-welcome-dismissed-v'

type Slide = {
  kicker: string
  title: string
  body: string
}

const SLIDES: Slide[] = [
  {
    kicker: '★ What\'s new this issue',
    title: 'Live Season Hub, Manager Hub, and more.',
    body:
      'The Chronicle has grown beyond the off-season almanac. New tools follow your league as the season unfolds — and a new editorial Hub follows each manager across their entire career. Tap Next to read the headlines.',
  },
  {
    kicker: '§ Live Season Hub',
    title: 'Matchup Preview & Best Coach Tracker.',
    body:
      'Every week, a Matchup Preview lays out the upcoming slate with form, narrative, and rivalry weight. The Best Coach Tracker grades start/sit decisions league-wide, so every Sunday\'s post-mortem writes itself.',
  },
  {
    kicker: '✦ Manager Hub',
    title: 'A six-issue chronicle for every manager.',
    body:
      'The Manager Hub is a personal almanac — drafts, trades, rivalries, and records across every league a manager has touched. The redesigned Dynasty and Wire issues now pull live Sleeper data and per-chronicle league aliases.',
  },
  {
    kicker: '★ Coming soon',
    title: 'Weekly Recap. Manager DNA.',
    body:
      'A Sunday-night Recap that writes the league\'s story for you, and a Manager DNA report that turns five years of decisions into a profile. Both are in the queue — watch the ticker for the launch.',
  },
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
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(SLIDES.length - 1, i + 1))
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

  const slide = SLIDES[index]
  const greeting = signedIn ? 'Welcome back.' : 'Hello.'
  const isLast = index === SLIDES.length - 1

  return (
    <div
      className="lp-welcome-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lp-welcome-greeting"
      onClick={dismiss}
    >
      <div className="lp-welcome-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="lp-welcome-close"
          aria-label="Close"
          onClick={dismiss}
        >
          ×
        </button>

        <div className="lp-welcome-head">
          <div className="lp-welcome-issue">Vol. II · The Sunday Chronicle</div>
          <div className="lp-welcome-greeting" id="lp-welcome-greeting">{greeting}</div>
          <div className="lp-welcome-lede">
            A note from the desk — what&apos;s changed since you last turned the page.
          </div>
        </div>

        <div className="lp-welcome-slide">
          <div className="lp-welcome-kicker">{slide.kicker}</div>
          <div className="lp-welcome-title">{slide.title}</div>
          <p className="lp-welcome-body">{slide.body}</p>
        </div>

        <div className="lp-welcome-foot">
          <button
            type="button"
            className="dc-btn-ghost lp-welcome-nav"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
          >
            ← Back
          </button>

          <div className="lp-welcome-dots" aria-hidden>
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`lp-welcome-dot${i === index ? ' is-active' : ''}`}
              />
            ))}
          </div>

          {isLast ? (
            <button type="button" className="dc-btn lp-welcome-nav" onClick={dismiss}>
              Done →
            </button>
          ) : (
            <button
              type="button"
              className="dc-btn lp-welcome-nav"
              onClick={() => setIndex((i) => Math.min(SLIDES.length - 1, i + 1))}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
