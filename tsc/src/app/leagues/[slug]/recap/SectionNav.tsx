'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './recap.module.css'

// The "Inside" bar. Sitting in the page it wears a red rule top and bottom
// like the sections around it; once it sticks to the top of the screen the
// rules go, so it reads as a toolbar rather than a stray band. A zero-height
// marker just above the bar says which: off screen means stuck.
export function SectionNav({ links }: { links: { id: string; label: string }[] }) {
  const marker = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const el = marker.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <>
      <div ref={marker} className={styles.jumpsMarker} aria-hidden />
      <nav className={styles.jumps} data-stuck={stuck ? 'true' : undefined} aria-label="Sections">
        <span className={styles.jumpsLabel}>Inside</span>
        {links.map((j) => (
          <a key={j.id} href={`#${j.id}`}>
            {j.label}
          </a>
        ))}
      </nav>
    </>
  )
}
