'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Mobile shrinking masthead (the Medium / news-site pattern): scrolling
// down past the header adds `tsc-hdr-collapsed` to <body>, which the
// mobile-only CSS in globals.css uses to slim the sticky .nav down to a
// thin title rail and fade out the corner controls (back arrow, nav
// clusters, and the fixed hamburger). Any upward scroll — or being near
// the top — removes the class and restores the full header.
//
// The class toggles at every width; all visual effects live behind a
// max-width media query, so desktop never changes. Renders nothing.
export function MobileHeaderCollapse() {
  const pathname = usePathname()

  useEffect(() => {
    // Route changes reset scroll to top — start every page expanded.
    document.body.classList.remove('tsc-hdr-collapsed')

    let lastY = window.scrollY
    let ticking = false
    // Ignore micro-jitter (iOS momentum / rubber-banding) so the header
    // doesn't flicker between states mid-scroll.
    const DELTA = 8
    // Don't collapse until the page is actually scrolled past the header,
    // and always re-expand close to the top.
    const MIN_Y = 90

    // Landing page wants the collapse to "stick" — only re-expand when
    // the user actually returns to the top of the page, not on every
    // little upward scroll. Other mobile pages keep the original behavior.
    const stickyCollapse = pathname === '/'

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        // Clamp: iOS overscroll reports negative scrollY at the top.
        const y = Math.max(0, window.scrollY)
        const dy = y - lastY
        if (y < MIN_Y) {
          document.body.classList.remove('tsc-hdr-collapsed')
        } else if (dy > DELTA) {
          document.body.classList.add('tsc-hdr-collapsed')
        } else if (dy < -DELTA && !stickyCollapse) {
          document.body.classList.remove('tsc-hdr-collapsed')
        }
        lastY = y
        ticking = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.body.classList.remove('tsc-hdr-collapsed')
    }
  }, [pathname])

  return null
}
