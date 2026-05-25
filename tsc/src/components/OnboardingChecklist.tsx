'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export type OnboardingStep = {
  label: string
  description: string
  done: boolean
  href?: string
  cta?: string
}

type Props = {
  storageKey: string
  kicker: string
  title: string
  titleEm?: string
  subtitle: string
  steps: OnboardingStep[]
  hideWhenAllDone?: boolean
}

export function OnboardingChecklist({
  storageKey,
  kicker,
  title,
  titleEm,
  subtitle,
  steps,
  hideWhenAllDone = true,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      setDismissed(window.localStorage.getItem(storageKey) === '1')
    }
  }, [storageKey])

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

  return (
    <div className="onb-card">
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
              {step.href && !step.done && (
                <Link href={step.href} className="onb-step-cta">
                  {step.cta ?? 'Go →'}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
