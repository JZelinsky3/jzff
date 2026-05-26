'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BLOCK_INDEX } from '../_lib/blocks'
import { STORAGE_KEY, type Deck } from '../_lib/types'
import type { LeaguePresentationData } from '../_lib/leagueData'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; deck: Deck }

export function Presenter({
  slug,
  leagueName,
  data,
}: {
  slug: string
  leagueName: string
  data: LeaguePresentationData
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [index, setIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Pull the deck from sessionStorage once on mount. We deliberately do not
  // subscribe to storage events — this surface is meant to be a frozen
  // playback of whatever the builder produced at navigation time.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY(slug))
      if (!raw) return setState({ kind: 'empty' })
      const parsed = JSON.parse(raw) as Deck
      if (parsed?.version !== 1 || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
        return setState({ kind: 'empty' })
      }
      setState({ kind: 'ready', deck: { ...parsed, leagueName } })
    } catch {
      setState({ kind: 'empty' })
    }
  }, [slug, leagueName])

  const total = state.kind === 'ready' ? state.deck.slides.length : 0

  const go = useCallback((delta: number) => {
    setIndex((i) => {
      const next = i + delta
      if (next < 0) return 0
      if (next >= total) return total - 1
      return next
    })
  }, [total])

  const restart = useCallback(() => setIndex(0), [])

  const toggleFullscreen = useCallback(async () => {
    const el = rootRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      try { await el.requestFullscreen() } catch { /* user-gesture only — ignore */ }
    } else {
      try { await document.exitFullscreen() } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (state.kind !== 'ready') return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault(); go(1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); go(-1)
      } else if (e.key === 'r' || e.key === 'R') {
        restart()
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      } else if (e.key === 'Home') {
        setIndex(0)
      } else if (e.key === 'End') {
        setIndex(total - 1)
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.kind, go, restart, toggleFullscreen, total])

  if (state.kind === 'loading') {
    return <div className="present-run-loading">Loading…</div>
  }

  if (state.kind === 'empty') {
    return (
      <div className="present-run-empty">
        <div className="present-run-empty-card">
          <div className="present-run-empty-kicker">No deck in this tab</div>
          <h1>Nothing to present yet.</h1>
          <p>
            Decks live only in this browser tab. Build one, then come back here to present.
          </p>
          <Link href={`/league/${slug}/present`} className="present-btn present-btn--primary">
            Open builder
          </Link>
        </div>
      </div>
    )
  }

  const deck = state.deck
  const slide = deck.slides[index]
  const def = BLOCK_INDEX[slide.blockId]

  return (
    <div ref={rootRef} className={`present-run present-theme-${deck.theme}`} data-slide-id={slide.id}>
      <div className="present-run-stage">
        {def ? def.render({ values: slide.values, theme: deck.theme, leagueName: deck.leagueName, data }) : (
          <div className="present-slide">
            <p>Unknown block: {slide.blockId}</p>
          </div>
        )}
      </div>

      <div className="present-run-chrome">
        <div className="present-run-progress">
          {index + 1} / {deck.slides.length}
        </div>
        <div className="present-run-controls">
          <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous">←</button>
          <button type="button" onClick={() => go(1)} disabled={index === deck.slides.length - 1} aria-label="Next">→</button>
          <button type="button" onClick={restart} aria-label="Restart">↺</button>
          <button type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">⛶</button>
          <Link href={`/league/${slug}/present`} className="present-run-exit">Exit</Link>
        </div>
        <div className="present-run-hint">← → space · R restart · F fullscreen · Esc exit fullscreen</div>
      </div>
    </div>
  )
}
