'use client'

import { useState } from 'react'

// Collapsible section shell for the dashboard. The shelf is the primary
// league surface now, so the full card grid lives behind this toggle.
// Children arrive as server-rendered nodes; this component only owns the
// open/closed state.

export function CollapsedSection({
  num,
  title,
  meta,
  defaultOpen = false,
  plain = false,
  children,
}: {
  num: string
  title: string
  meta?: string
  defaultOpen?: boolean
  // plain: render without the .section wrapper so the toggle can nest
  // inside an existing section (the shelf's checkout-desk drawer).
  plain?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={plain ? 'dc-shelf-drawer' : 'section'}>
      <button
        type="button"
        className="dc-collapse-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="section-num">{num}</span>
        <span className="section-title">{title}</span>
        <span className="dc-collapse-right">
          {meta && <span className="section-meta">{meta}</span>}
          <span className={`dc-collapse-toggle${open ? ' is-open' : ''}`}>
            {open ? 'Close' : 'View all'}
            <span className="dc-collapse-glyph" aria-hidden>+</span>
          </span>
        </span>
      </button>
      <div className={`dc-collapse-body${open ? ' is-open' : ''}`}>
        <div className="dc-collapse-inner">{children}</div>
      </div>
    </div>
  )
}
