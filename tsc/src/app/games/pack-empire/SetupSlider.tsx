'use client'

// A setup row with a slider instead of a row of tabs, for a number with a lot of
// choices: how many teams make the playoffs (Joey, 2026-11-07: twelve buttons is
// too many). The number it's on sits big beside it, with the ends marked under it.
// `onCommit` fires when the thumb is let go, for a setting that saves to the server.

import { useState } from 'react'

export function SetupSlider({
  label,
  min,
  max,
  value,
  onChange,
  onCommit,
  format = (n) => String(n),
  disabled = false,
}: {
  label: string
  min: number
  max: number
  value: number
  onChange?: (n: number) => void
  onCommit?: (n: number) => void
  format?: (n: number) => string
  disabled?: boolean
}) {
  const [live, setLive] = useState<number | null>(null)
  const shown = live ?? value
  const pct = max > min ? ((shown - min) / (max - min)) * 100 : 0
  const commit = () => {
    if (live != null && live !== value) onCommit?.(live)
    setLive(null)
  }
  return (
    <div className="pe-setup-row">
      <span className="pe-setup-label">{label}</span>
      <div className="pe-slide">
        <b className="pe-slide-num">{format(shown)}</b>
        <div className="pe-slide-track">
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={shown}
            disabled={disabled || max <= min}
            aria-label={label}
            style={{ '--pct': `${pct}%` } as React.CSSProperties}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (onCommit) setLive(n)
              onChange?.(n)
            }}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
          <span className="pe-slide-ends">
            <i>{format(min)}</i>
            <i>{format(max)}</i>
          </span>
        </div>
      </div>
    </div>
  )
}
