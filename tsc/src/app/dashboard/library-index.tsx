'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// The Library's nav menu as an open book. The "Index" chip in the nav
// swings a full-screen spread open: the left page is the colophon (brand,
// volume, who's signed in, sign out), the right page is the table of
// contents carrying the actual nav links with dotted leaders and roman
// numerals. Closes on Escape, backdrop click, or the corner ✕.

export type IndexGroup = {
  label: string
  links: { href: string; label: string }[]
}

export function LibraryIndexBook({
  groups,
  email,
}: {
  groups: IndexGroup[]
  email: string | null
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    // Lock the page behind the spread so the shelf doesn't scroll under it.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  let entryNo = 0

  return (
    <>
      {/* The trigger is a small closed book: leather cover with a gilt
          title, the page block peeking out down-right. Hover slides the
          cover as if the book is being cracked open. */}
      <button
        type="button"
        className="lib-idx-book"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open the index"
      >
        <span className="lib-idx-book-pages" aria-hidden />
        <span className="lib-idx-book-cover">
          <span className="lib-idx-book-star" aria-hidden>★</span> Index
        </span>
      </button>

      {open && (
        <div
          className="lib-book-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Library index"
          onClick={() => setOpen(false)}
        >
          <div className="lib-book" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lib-book-close"
              onClick={() => setOpen(false)}
              aria-label="Close the index"
            >
              ✕ Close
            </button>

            <div className="lib-book-page lib-book-left">
              <div className="lib-book-colophon">
                <span className="lib-book-star" aria-hidden>★</span>
                <div className="lib-book-brand">The Sunday <em>Chronicle.</em></div>
                <div className="lib-book-vol">Vol. II · The Library</div>
                <span className="lib-book-rule" aria-hidden />
                <p className="lib-book-epigraph">
                  Every league you keep,<br />bound and shelved.
                </p>
              </div>
              <div className="lib-book-foot">
                {email && <span className="lib-book-member">Issued to {email}</span>}
                <form action="/auth/signout" method="post">
                  <button type="submit" className="lib-book-signout">Sign out</button>
                </form>
              </div>
            </div>

            <div className="lib-book-page lib-book-right">
              <div className="lib-book-toc-head">
                <span className="lib-book-toc-star" aria-hidden>★</span> Contents <span className="lib-book-toc-star" aria-hidden>★</span>
              </div>
              {groups.map((g) => (
                <div key={g.label} className="lib-book-chapter">
                  <div className="lib-book-chapter-lbl">{g.label}</div>
                  {g.links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="lib-book-row"
                      onClick={() => setOpen(false)}
                    >
                      <span className="lib-book-row-label">{l.label}</span>
                      <span className="lib-book-row-leader" aria-hidden />
                      <span className="lib-book-row-num">{toRoman(++entryNo)}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function toRoman(n: number): string {
  const table: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  for (const [v, s] of table) {
    while (n >= v) { out += s; n -= v }
  }
  return out
}
