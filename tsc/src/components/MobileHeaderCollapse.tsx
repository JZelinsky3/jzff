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
// Routes that manage `tsc-hdr-collapsed` themselves.
const MANUAL_PATHS = ['/games/roulette']

export function MobileHeaderCollapse() {
  const pathname = usePathname()

  useEffect(() => {
    // Route changes reset scroll to top — start every page expanded.
    document.body.classList.remove('tsc-hdr-collapsed')

    // Pages that drive the header themselves. Roster Roulette collapses on
    // the spin and holds it while you pick, because its board is sized to
    // fit one screen: there is almost nothing to scroll, so a scroll-driven
    // header would simply never collapse. Bail out entirely rather than
    // have two owners fighting over the same class.
    if (MANUAL_PATHS.some((m) => pathname.startsWith(m))) return

    let lastY = window.scrollY
    let ticking = false
    // Ignore micro-jitter (iOS momentum / rubber-banding) so the header
    // doesn't flicker between states mid-scroll.
    const DELTA = 8
    // Don't collapse until the page is actually scrolled past the header,
    // and always re-expand close to the top.
    const MIN_Y = 90

    // Some pages want the collapse to "stick" — only re-expand when the
    // user actually returns to the top of the page, not on every little
    // upward scroll. Other mobile pages keep the original behavior.
    //
    // The landing page wants it for feel. /games needs it: its header
    // collapses hard (down to a title rail) and the page is short, so the
    // ~60px the collapse removes shrinks the maximum scroll position. The
    // browser then clamps scrollY down to fit, which reads here as an
    // upward scroll, which re-expands the header, which restores the
    // height... and the thing flickers the whole way down the page.
    // Dropping the re-expand-on-any-upward-scroll branch breaks the loop.
    const STICKY_PATHS = ['/', '/games']
    const stickyCollapse = STICKY_PATHS.some(
      (p) => pathname === p || (p !== '/' && pathname.startsWith(`${p}/`))
    )

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
