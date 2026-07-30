'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { SharePage } from '@/lib/sharePages'
import s from './see.module.css'

// Header for the public share pages: wordmark on the left (which is also
// the way to the landing page) and a nav button on the right. The global
// MobileSiteMenu is suppressed on these routes, so this is the only
// navigation on the page and it sits in the layout rather than floating
// over it.
export function SeeHeader({
  pages,
  currentKey,
  demoHref,
}: {
  pages: Array<Pick<SharePage, 'key' | 'title'>>
  currentKey: string
  demoHref: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click and on Escape, so the panel never strands a
  // visitor on a phone with no obvious way to dismiss it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <header className={s.header} ref={wrapRef}>
      <div className={s.headerRow}>
        <Link href="/" className={s.wordmark} aria-label="The Sunday Chronicle home">
          <span>The Sunday</span>
          <span className={s.wordmarkTail}>Chronicle</span>
        </Link>

        <button
          type="button"
          className={s.menuBtn}
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
        >
          <span className={s.menuIcon} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      {open && (
        <nav className={s.panel}>
          <Link href="/" className={s.panelLink} onClick={() => setOpen(false)}>
            Home
          </Link>
          <Link href={demoHref} className={s.panelLink} onClick={() => setOpen(false)}>
            Read the demo league
          </Link>

          <p className={s.panelHead}>In the book</p>
          {pages
            .filter((p) => p.key !== currentKey)
            .map((p) => (
              <Link
                key={p.key}
                href={`/see/${p.key}`}
                className={s.panelLink}
                onClick={() => setOpen(false)}
              >
                {p.title}
              </Link>
            ))}

          <Link href="/login?mode=signup" className={s.panelPrimary} onClick={() => setOpen(false)}>
            Start free
          </Link>
        </nav>
      )}
    </header>
  )
}
