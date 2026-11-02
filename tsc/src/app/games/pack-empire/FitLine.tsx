'use client'

// One line of text with a shorter version for when it won't fit: the full one is
// measured off-screen against the room there is, and the short one only takes over
// when the full one would run out of it. Re-checked whenever the room changes.

import { useEffect, useRef, useState } from 'react'

export function FitLine({ full, short, className }: { full: string; short: string; className?: string }) {
  const box = useRef<HTMLElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const [tight, setTight] = useState(false)

  useEffect(() => {
    const el = box.current
    const p = probe.current
    if (!el || !p || full === short) return
    const ro = new ResizeObserver(() => setTight(p.offsetWidth > el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [full, short])

  return (
    <small ref={box} className={className} title={tight ? full : undefined} style={{ position: 'relative' }}>
      {tight ? short : full}
      <span ref={probe} aria-hidden style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', whiteSpace: 'nowrap' }}>
        {full}
      </span>
    </small>
  )
}
