'use client'

import { useState } from 'react'

// Tiny inline chip that sits in the hero meta line under the email/league count.
// Shows the user's permanent member code in mono with a small clipboard button
// next to it. Used as the handle the user shares when redeeming promos / comps.

export function MemberCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // clipboard blocked; harmless no-op
    }
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '.4rem',
        marginTop: '.45rem',
        fontFamily: 'var(--mono)',
        fontSize: '.7rem',
        letterSpacing: '.18em',
        opacity: 0.7,
      }}
    >
      <span style={{ opacity: 0.65 }}>Member code</span>
      <span style={{ color: 'var(--gold)', letterSpacing: '.22em' }}>{code}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy member code'}
        title={copied ? 'Copied' : 'Copy'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1.4rem',
          height: '1.4rem',
          padding: 0,
          background: 'transparent',
          border: '1px solid var(--ink-line)',
          borderRadius: '2px',
          color: copied ? 'var(--gold)' : 'var(--cream-soft)',
          cursor: 'pointer',
        }}
      >
        {copied ? (
          <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2 7 6 11 12 3" />
          </svg>
        ) : (
          <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="3.5" y="3.5" width="7.5" height="9" rx="1" />
            <path d="M5.5 3V2.25A.75.75 0 0 1 6.25 1.5h4.5A.75.75 0 0 1 11.5 2.25v6.5" />
          </svg>
        )}
      </button>
    </span>
  )
}
