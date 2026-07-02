'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import s from './MobileHomeCover.module.css'

// Bottom action dock for the mobile landing. Three states driven by scroll
// direction (same DELTA/rAF pattern as the global MobileHeaderCollapse):
//
//   hidden — near the top of the page, where the hero already shows the
//            primary CTA right on screen; the dock would just double it.
//   slim   — scrolling DOWN through content: stays reachable but tucks to
//            a thin bar so it doesn't eat the viewport.
//   full   — any upward scroll: reader is reconsidering, give them the
//            comfortable targets back.
export function MobileHomeDock({ signedIn }: { signedIn: boolean }) {
  const [state, setState] = useState<'hidden' | 'slim' | 'full'>('hidden')

  useEffect(() => {
    let lastY = window.scrollY
    let ticking = false
    // Ignore micro-jitter from iOS momentum/rubber-band scrolling.
    const DELTA = 8
    // Roughly where the hero CTA leaves the viewport on common phones.
    const SHOW_Y = 420

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY)
        const dy = y - lastY
        if (y < SHOW_Y) {
          setState('hidden')
        } else if (dy > DELTA) {
          setState('slim')
        } else if (dy < -DELTA) {
          setState('full')
        }
        lastY = y
        ticking = false
      })
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const primaryHref = signedIn ? '/dashboard' : '/login?mode=signup'
  const primaryLabel = signedIn ? 'Open your library' : 'Start your archive'

  return (
    <div
      className={`${s.dock} ${state === 'hidden' ? s.dockHidden : ''} ${state === 'slim' ? s.dockSlim : ''}`}
    >
      <Link href={primaryHref} className={s.dockPrimary}>
        {primaryLabel}
      </Link>
      {signedIn ? (
        <Link href="/dashboard/new" className={s.dockGhost}>
          Add a league
        </Link>
      ) : (
        <Link href="/demo/" target="_blank" rel="noopener" className={s.dockGhost}>
          Demo
        </Link>
      )}
    </div>
  )
}
