'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const TURN_MS = 420

// Turns the page when you move between chapters of a league.
//
// Intercepts clicks on same-league links, sweeps a sheet across the
// viewport on its hinge, then navigates. Deliberately conservative about
// what it hijacks: anything the browser would treat specially (new tab,
// modified click, download, external host, hash jump) is left alone, and
// with reduced motion the navigation happens immediately.
export function PageTurn() {
  const router = useRouter()
  const [turning, setTurning] = useState(false)
  // Guards against a second click landing mid-sweep and stacking timers.
  const busy = useRef(false)

  const reducedMotion = useCallback(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Let the browser handle anything that isn't a plain left click.
      if (e.defaultPrevented) return
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const el = (e.target as HTMLElement | null)?.closest?.('a')
      if (!el) return
      const anchor = el as HTMLAnchorElement
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return
      if (anchor.dataset.noTurn !== undefined) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return

      // Same-origin, and inside the league management surface only. The
      // public almanac opens in a new tab and shouldn't animate.
      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (!url.pathname.startsWith('/league/')) return
      // Already here: nothing to turn to.
      if (url.pathname.replace(/\/+$/, '') === window.location.pathname.replace(/\/+$/, '')) return

      if (reducedMotion()) return
      if (busy.current) return

      e.preventDefault()
      busy.current = true
      setTurning(true)
      window.setTimeout(() => {
        router.push(url.pathname + url.search)
        // Clear a little after the push so the sheet covers the swap.
        window.setTimeout(() => {
          setTurning(false)
          busy.current = false
        }, 120)
      }, TURN_MS)
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [router, reducedMotion])

  return (
    <div className={`lo-turn${turning ? ' is-turning' : ''}`} aria-hidden>
      <div className="lo-turn-sheet" />
    </div>
  )
}
