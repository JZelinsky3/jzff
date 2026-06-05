'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export type OnboardingStep = {
  label: string
  description: string
  done: boolean
  href?: string
  cta?: string
  // Inline action slot — when set, renders the node instead of the
  // href/cta Link. Lets the parent drop a real button (e.g. SyncButton)
  // directly into the step so users don't have to navigate elsewhere.
  action?: React.ReactNode
}

type Props = {
  storageKey: string
  kicker: string
  title: string
  titleEm?: string
  subtitle: string
  steps: OnboardingStep[]
  hideWhenAllDone?: boolean
  // When true, skip the inline checklist card entirely and surface only
  // the corner FAB. Used on the dashboard where the cards-grid above is
  // the primary CTA and we don't want a second large block stacked under.
  fabOnly?: boolean
}

export function OnboardingChecklist({
  storageKey,
  kicker,
  title,
  titleEm,
  subtitle,
  steps,
  hideWhenAllDone = true,
  fabOnly = false,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  // Whether the main card is currently visible in the viewport. When it
  // scrolls off, we surface the Stripe-style FAB at bottom-right so the
  // user can keep tabs on remaining steps without losing context.
  const [mainVisible, setMainVisible] = useState(true)
  // FAB open/closed states are persisted to localStorage so the user's
  // last interaction (minimized to a pill, or fully closed for the
  // session) survives reloads and route changes. Closed is "soft" — it
  // hides the FAB but leaves the main card visible; the user can re-open
  // by re-summoning from elsewhere, or via the next-page-load reset.
  const [fabOpen, setFabOpen] = useState(true)
  const [fabClosed, setFabClosed] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Storage key suffixes — paired with the per-instance storageKey so
  // different checklists (dashboard vs league) don't share FAB state.
  const fabOpenKey = `${storageKey}__fabOpen`
  const fabClosedKey = `${storageKey}__fabClosed`

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      setDismissed(window.localStorage.getItem(storageKey) === '1')
      const storedOpen = window.localStorage.getItem(fabOpenKey)
      if (storedOpen === '0') setFabOpen(false)
      if (storedOpen === '1') setFabOpen(true)
      if (window.localStorage.getItem(fabClosedKey) === '1') setFabClosed(true)
    }
  }, [storageKey, fabOpenKey, fabClosedKey])

  // Persist FAB state on every change after mount.
  useEffect(() => {
    if (!mounted) return
    try { window.localStorage.setItem(fabOpenKey, fabOpen ? '1' : '0') } catch {}
  }, [fabOpen, mounted, fabOpenKey])
  useEffect(() => {
    if (!mounted) return
    try { window.localStorage.setItem(fabClosedKey, fabClosed ? '1' : '0') } catch {}
  }, [fabClosed, mounted, fabClosedKey])

  useEffect(() => {
    if (!mounted) return
    // fabOnly mode skips the inline card, so there's nothing to observe —
    // pin mainVisible=false so the FAB renders immediately.
    if (fabOnly) { setMainVisible(false); return }
    const el = cardRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setMainVisible(entry.isIntersecting),
      { rootMargin: '-40px 0px 0px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [mounted, fabOnly])

  if (!mounted) return null
  if (dismissed) return null

  const allDone = steps.every((s) => s.done)
  if (hideWhenAllDone && allDone) return null

  const doneCount = steps.filter((s) => s.done).length
  const nextStep = steps.find((s) => !s.done)

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, '1')
    }
    setDismissed(true)
  }

  const stepsList = (
    <ol className="onb-steps">
      {steps.map((step, i) => {
        const isNext = step === nextStep
        return (
          <li
            key={i}
            className={`onb-step ${step.done ? 'done' : ''} ${isNext ? 'next' : ''}`}
          >
            <span className="onb-step-check" aria-hidden>
              {step.done ? '✓' : i + 1}
            </span>
            <div className="onb-step-body">
              <div className="onb-step-label">{step.label}</div>
              <div className="onb-step-desc">{step.description}</div>
            </div>
            {!step.done && (
              step.action ? (
                <div className="onb-step-action">{step.action}</div>
              ) : step.href ? (
                <Link href={step.href} className="onb-step-cta">
                  {step.cta ?? 'Go →'}
                </Link>
              ) : null
            )}
          </li>
        )
      })}
    </ol>
  )

  return (
    <>
      {!fabOnly && (
      <div className="onb-card" ref={cardRef}>
        <button
          type="button"
          className="onb-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss"
          title="Dismiss"
        >
          ×
        </button>
        <div className="onb-kicker">{kicker}</div>
        <div className="onb-title">
          {title}{titleEm ? <> <em>{titleEm}</em></> : null}
        </div>
        <div className="onb-subtitle">{subtitle}</div>

        <div className="onb-progress">
          <div className="onb-progress-track">
            <div
              className="onb-progress-fill"
              style={{ width: `${(doneCount / steps.length) * 100}%` }}
            />
          </div>
          <div className="onb-progress-meta">
            {doneCount} of {steps.length} complete
          </div>
        </div>

        {stepsList}
      </div>
      )}

      {/* Floating fallback — appears once the main card scrolls off-screen
          so the user keeps a path back to remaining steps. Stripe-style. */}
      {!mainVisible && !allDone && !fabClosed && (
        <div className={`onb-fab ${fabOpen ? 'open' : ''}`} role="region" aria-label="Setup checklist">
          {fabOpen ? (
            <div className="onb-fab-panel">
              <div className="onb-fab-head">
                <div>
                  <div className="onb-fab-kicker">{kicker}</div>
                  <div className="onb-fab-title">
                    {doneCount}/{steps.length} complete
                  </div>
                </div>
                <div className="onb-fab-head-actions">
                  <button
                    type="button"
                    className="onb-fab-iconbtn"
                    onClick={() => setFabOpen(false)}
                    aria-label="Minimize"
                    title="Minimize"
                  >
                    –
                  </button>
                  <button
                    type="button"
                    className="onb-fab-iconbtn"
                    onClick={() => setFabClosed(true)}
                    aria-label="Close"
                    title="Close (main checklist stays visible)"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="onb-progress" style={{ marginBottom: '.75rem' }}>
                <div className="onb-progress-track">
                  <div
                    className="onb-progress-fill"
                    style={{ width: `${(doneCount / steps.length) * 100}%` }}
                  />
                </div>
              </div>
              {stepsList}
            </div>
          ) : (
            <button
              type="button"
              className="onb-fab-pill"
              onClick={() => setFabOpen(true)}
              aria-label="Open setup checklist"
            >
              <span className="onb-fab-pill-check" aria-hidden>✓</span>
              <span className="onb-fab-pill-label">
                Setup <strong>{doneCount}/{steps.length}</strong>
              </span>
              <span className="onb-fab-pill-arrow" aria-hidden>↑</span>
            </button>
          )}
        </div>
      )}
    </>
  )
}
