'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// The shelf: the dashboard's primary league surface. One large book spine
// per league; clicking a book opens a card above it with the real actions
// (Setup / open the public Archive). Unused plan slots follow as blacked-out
// spines with scribbled titles; tapping one pops a create-a-league card.
// Bookmarked almanacs shelve at the end as dashed "borrowed" volumes that
// link straight out, no popover.

export type ShelfLeague = {
  id: string
  name: string
  slug: string
  platform: string
  lastSyncedAt: string | null
  published: boolean
}

export type ShelfBookmark = {
  id: string
  name: string
  slug: string
}

export function Bookshelf({
  leagues,
  bookmarks,
  placeholders = 0,
}: {
  leagues: ShelfLeague[]
  bookmarks: ShelfBookmark[]
  placeholders?: number
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Close the popover on Escape and on any click that isn't a book or its
  // popover. Checking .dc-shelf-slot (not just the wrap) means clicking the
  // shelf background, caption, or anywhere else in the section dismisses it.
  useEffect(() => {
    if (!openId) return
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(t) || !t.closest('.dc-shelf-slot')) setOpenId(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [openId])

  return (
    <div className="dc-shelf-wrap" ref={wrapRef}>
      <div className="dc-shelf-unit">
      <div className="dc-shelf">
        <span className="dc-shelf-end" aria-hidden />
        {leagues.map((l, i) => {
          const look = spineLook(l.name)
          const open = openId === l.id
          return (
            <div key={l.id} className={`dc-shelf-slot${open ? ' is-open' : ''}`} style={{ ['--i' as string]: i }}>
              {open && (
                <div className="dc-shelf-pop" role="dialog" aria-label={l.name}>
                  <div className="dc-shelf-pop-corner">Vol. {toRoman(i + 1)} · {l.platform}</div>
                  <div className="dc-shelf-pop-title">{l.name}</div>
                  <div className="dc-shelf-pop-meta">
                    {l.lastSyncedAt
                      ? `Last synced ${new Date(l.lastSyncedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      : 'Not synced yet'}
                    {l.published ? ' · Published' : ' · Draft'}
                  </div>
                  <div className="dc-shelf-pop-btns">
                    <Link href={`/league/${l.slug}`} className="dc-shelf-pop-btn is-primary">Setup</Link>
                    {l.published && (
                      <a href={`/leagues/${l.slug}/`} target="_blank" rel="noopener" className="dc-shelf-pop-btn">
                        Archive <span aria-hidden>↗</span>
                      </a>
                    )}
                  </div>
                  <span className="dc-shelf-pop-tail" aria-hidden />
                </div>
              )}
              <button
                type="button"
                onClick={() => setOpenId(open ? null : l.id)}
                aria-expanded={open}
                className={`dc-shelf-book${look.lean && !open ? ' is-leaning' : ''}${open ? ' is-open' : ''}`}
                style={{ height: look.height, width: look.width, background: look.tint }}
                title={l.name}
              >
                <span className="dc-shelf-book-band" aria-hidden />
                <span
                  className="dc-shelf-book-label"
                  style={{ fontSize: look.fontSize, maxHeight: look.height - 76 }}
                >
                  {l.name}
                </span>
                <span className="dc-shelf-book-foot" aria-hidden>{toRoman(i + 1)}</span>
              </button>
            </div>
          )
        })}
        {Array.from({ length: placeholders }).map((_, i) => {
          const id = `void-${i}`
          const open = openId === id
          const height = 192 + ((i * 53) % 4) * 12
          const width = 60 + ((i * 29) % 3) * 7
          const vol = toRoman(leagues.length + i + 1)
          return (
            <div key={id} className={`dc-shelf-slot${open ? ' is-open' : ''}`} style={{ ['--i' as string]: leagues.length + i }}>
              {open && (
                <div className="dc-shelf-pop" role="dialog" aria-label="Unwritten volume">
                  <div className="dc-shelf-pop-corner">Vol. {vol} · Unwritten</div>
                  <div className="dc-shelf-pop-title">This spot is yours.</div>
                  <div className="dc-shelf-pop-meta">Your plan has room for another league. Bind it and the spine fills in.</div>
                  <div className="dc-shelf-pop-btns">
                    <Link href="/dashboard/new" className="dc-shelf-pop-btn is-primary">+ New archive</Link>
                  </div>
                  <span className="dc-shelf-pop-tail" aria-hidden />
                </div>
              )}
              <button
                type="button"
                onClick={() => setOpenId(open ? null : id)}
                aria-expanded={open}
                className={`dc-shelf-book is-void${open ? ' is-open' : ''}`}
                style={{ height, width }}
                title="An unwritten volume"
              >
                <span className="dc-shelf-book-band" aria-hidden />
                <span
                  className="dc-shelf-book-label dc-shelf-book-label-void"
                  style={{ fontSize: '.82rem', maxHeight: height - 76 }}
                >
                  Coming soon
                </span>
                <span className="dc-shelf-book-foot" aria-hidden>{vol}</span>
              </button>
            </div>
          )
        })}
        {bookmarks.map((b, i) => {
          const look = spineLook(b.name)
          return (
            <div key={b.id} className="dc-shelf-slot" style={{ ['--i' as string]: leagues.length + placeholders + i }}>
              <a
                href={`/leagues/${b.slug}/`}
                className="dc-shelf-book is-borrowed"
                title={`${b.name} · bookmarked`}
                style={{ height: look.height, width: look.width }}
              >
                <span
                  className="dc-shelf-book-label"
                  style={{ fontSize: look.fontSize, maxHeight: look.height - 60 }}
                >
                  {b.name}
                </span>
                <span className="dc-shelf-book-foot" aria-hidden>★</span>
              </a>
            </div>
          )
        })}
        <span className="dc-shelf-end" aria-hidden />
      </div>
      <div className="dc-shelf-board" aria-hidden />
      </div>
      <div className="dc-shelf-caption">
        {leagues.length} {leagues.length === 1 ? 'volume' : 'volumes'}
        {placeholders > 0 && <> · {placeholders} unwritten</>}
        {bookmarks.length > 0 && <> · {bookmarks.length} borrowed</>}
        <span className="dc-shelf-caption-hint"> · Tap a spine</span>
      </div>
    </div>
  )
}

// Volume numbering. Oldest league = Vol. I; plans cap at 10 leagues.
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

// Deterministic spine styling from the league name, so a given league
// always gets the same book. Plain char-sum hash; collisions are fine,
// two similar books on a shelf is realistic. Long titles get a taller,
// slightly wider book and a smaller type size so the full name fits
// down the spine instead of truncating.
function spineLook(name: string): { height: number; width: number; tint: string; lean: boolean; fontSize: string } {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const tints = [
    'linear-gradient(180deg, #1a2532, #16202c)',
    'linear-gradient(180deg, #22303f, #1a2532)',
    'linear-gradient(180deg, #2a2320, #1f1a18)',
    'linear-gradient(180deg, #263242, #1c2836)',
    'linear-gradient(180deg, #31261c, #241d17)',
  ]
  const len = name.length
  const fontSize = len <= 8 ? '1.2rem' : len <= 14 ? '1.05rem' : len <= 22 ? '.92rem' : '.8rem'
  return {
    height: 200 + (h % 5) * 14 + (len > 18 ? 22 : 0), // 200..278px
    width: 64 + ((h >> 3) % 4) * 9 + (len > 14 ? 8 : 0), // 64..99px
    tint: tints[(h >> 5) % tints.length],
    lean: (h >> 7) % 7 === 0,          // roughly one in seven books leans
    fontSize,
  }
}
