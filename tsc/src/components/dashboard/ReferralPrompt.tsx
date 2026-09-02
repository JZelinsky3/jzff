'use client'

// One-time "where did you hear about us" card on the dashboard.
//
// The signup form already asks, but the field sits inside the email/password
// block above the "or" divider, and 87% of accounts arrive through the Google
// button below it. Those users answer 20% of the time; over the last 30 days
// 41 of 55 signups left it blank. Asking here instead costs nothing at the
// moment of conversion and catches the people the form structurally misses.
//
// Shown only when referral_source is null AND the prompt has never been
// answered or dismissed. Either action retires it permanently.

import { useState, useTransition } from 'react'
import { REFERRAL_OPTIONS } from '@/lib/referralChannels'
import { dismissReferralPrompt, updateReferralSource } from '@/app/account/actions'

export function ReferralPrompt() {
  const [gone, setGone] = useState(false)
  const [other, setOther] = useState('')
  const [picked, setPicked] = useState<string>('')
  const [pending, start] = useTransition()

  if (gone) return null

  // "Prefer not to say" is the dismiss path here, so it is dropped from the
  // chips — the X in the corner already covers it.
  const choices = REFERRAL_OPTIONS.filter((o) => o.value !== '')

  function choose(value: string) {
    setPicked(value)
    if (value === 'other') return // wait for the text box
    start(async () => {
      await updateReferralSource({ channel: value as never, other: '' })
      setGone(true)
    })
  }

  function saveOther() {
    start(async () => {
      await updateReferralSource({ channel: 'other', other: other.trim() })
      setGone(true)
    })
  }

  function dismiss() {
    setGone(true)
    start(async () => {
      await dismissReferralPrompt()
    })
  }

  return (
    // Width-capped to match the dashboard banners above it. Unconstrained it
    // stretched the full page and one short question read like a section.
    // Padding is trimmed from .dc-card-static's 2rem for the same reason:
    // this is a one-line ask, not a form.
    <div
      className="dc-card-static"
      style={{
        maxWidth: '880px',
        margin: '1rem auto',
        padding: '.9rem 1.15rem 1rem',
        position: 'relative',
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          position: 'absolute', top: '.6rem', right: '.7rem',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--cream-mute)', fontSize: '1rem', lineHeight: 1, padding: '.2rem',
        }}
      >
        ✕
      </button>

      {/* Question and chips share a row where there's width for it, and the
          chips drop underneath when there isn't. */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          gap: '.5rem .9rem', paddingRight: '1.5rem',
        }}
      >
        <div className="dc-label" style={{ marginBottom: 0 }}>
          One quick thing: where did you hear about us?
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
          {choices.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={pending}
              onClick={() => choose(o.value)}
              className="dc-btn-ghost"
              style={{
                fontSize: '.72rem',
                padding: '.35rem .7rem',
                opacity: picked && picked !== o.value ? 0.45 : 1,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {picked === 'other' && (
        <div style={{ display: 'flex', gap: '.4rem', marginTop: '.6rem' }}>
          <input
            type="text"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Tell us where (optional)"
            maxLength={120}
            className="dc-input"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="dc-btn-ghost"
            disabled={pending}
            onClick={saveOther}
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}
