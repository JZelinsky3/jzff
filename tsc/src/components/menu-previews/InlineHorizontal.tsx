'use client'

import { useEffect, useRef, useState } from 'react'

// Option C — Inline horizontal nav. No hamburger on desktop. Top-level
// groups sit inline; hover or click reveals a small flyout below each.
// Sign-out is a separate inline link at the right.
export function InlineHorizontal() {
  const [open, setOpen] = useState<'library' | 'account' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className="mp-inline">
      <div
        className={`mp-inline-group${open === 'library' ? ' is-open' : ''}`}
        onMouseEnter={() => setOpen('library')}
        onMouseLeave={() => setOpen(null)}
      >
        <button
          type="button"
          className="mp-inline-trigger"
          onClick={() => setOpen((o) => (o === 'library' ? null : 'library'))}
          aria-expanded={open === 'library'}
        >
          Library <span className="mp-inline-arr" aria-hidden="true">▾</span>
        </button>
        <div className="mp-inline-flyout">
          <a href="#">Your leagues</a>
          <a href="#">New archive</a>
        </div>
      </div>

      <div
        className={`mp-inline-group${open === 'account' ? ' is-open' : ''}`}
        onMouseEnter={() => setOpen('account')}
        onMouseLeave={() => setOpen(null)}
      >
        <button
          type="button"
          className="mp-inline-trigger"
          onClick={() => setOpen((o) => (o === 'account' ? null : 'account'))}
          aria-expanded={open === 'account'}
        >
          Account <span className="mp-inline-arr" aria-hidden="true">▾</span>
        </button>
        <div className="mp-inline-flyout">
          <a href="#">Profile &amp; subscription</a>
        </div>
      </div>

      <button type="button" className="mp-inline-signout">Sign out</button>
    </div>
  )
}
