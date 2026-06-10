'use client'

// Bottom ticker — broadcast-style sliding board.
//
// Layout (left → right):
//   [ TOP PERFORMERS ]   |   Quarterbacks   1. Mahomes  38.4 ▲  KC · Joey   2. …
//        static badge        sliding row (enters from below, scrolls left, exits up)
//
// Per scope:
//   enter (0–600ms)        slide up from below
//   hold-entry (1.5s)      label + first entries visible
//   scroll-left (6s)       reveal the rest of the 10 entries
//   hold-end (1.4s)        last entries visible
//   exit (500ms)           fly up
// Total ~10s; advances to next scope on each animation iteration.
// Pauses on hover. Clickable dots below pin a scope.

import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TickerBoard, TickerEntry, TickerScope } from '@/lib/sundayLive/types'
import { fmtScore } from '../_lib/format'

const SCOPES: { key: TickerScope; label: string }[] = [
  { key: 'all',   label: 'Overall' },
  { key: 'qb',    label: 'Quarterbacks' },
  { key: 'rb',    label: 'Running Backs' },
  { key: 'wr',    label: 'Wide Receivers' },
  { key: 'te',    label: 'Tight Ends' },
  { key: 'k',     label: 'Kickers' },
  { key: 'def',   label: 'Defenses' },
  { key: 'bench', label: 'Best Left on Bench' },
  { key: 'duds',  label: 'Worst Starters' },
]

export function BottomTicker({ board, slug }: { board: TickerBoard; slug: string }) {
  const [scopeIdx, setScopeIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [scrollPx, setScrollPx] = useState(0)

  const viewportRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const scope = SCOPES[scopeIdx]
  const rows = board[scope.key]

  // Measure how far the row needs to translate to expose its last entry.
  // Runs whenever the scope changes — different scopes have different widths.
  useLayoutEffect(() => {
    const v = viewportRef.current
    const r = rowRef.current
    if (!v || !r) return
    const overflow = Math.max(0, r.scrollWidth - v.clientWidth + 24)
    setScrollPx(overflow)
  }, [scopeIdx])

  const advance = () => setScopeIdx((i) => (i + 1) % SCOPES.length)

  // Keyboard a11y — left/right arrows step through scopes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setScopeIdx((i) => (i + 1) % SCOPES.length)
      if (e.key === 'ArrowLeft')  setScopeIdx((i) => (i - 1 + SCOPES.length) % SCOPES.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sl-edge bg-sl-ink/95 backdrop-blur-md"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Top performers ticker"
    >
      <div className="mx-auto flex h-[88px] max-w-[1500px] items-center gap-4 px-4 sm:gap-6 sm:px-6">
        {/* Static anchor badge */}
        <div className="shrink-0">
          <div className="sl-ff-mono text-[0.62rem] uppercase tracking-[0.32em] text-sl-mute">
            [ <span className="text-sl-cream">Top Performers</span> ]
          </div>
          <Link
            href={`/leagues/${slug}/sunday-live/players/`}
            className="sl-ff-mono mt-1 inline-block text-[0.52rem] uppercase tracking-[0.22em] text-sl-dim hover:text-sl-ember"
          >
            Leaderboard →
          </Link>
        </div>

        {/* Vertical separator */}
        <div className="h-12 w-px shrink-0 bg-sl-edge-soft" />

        {/* Animated viewport */}
        <div ref={viewportRef} className="relative min-w-0 flex-1 overflow-hidden">
          <div
            ref={rowRef}
            key={scopeIdx}
            className={`sl-ticker-row ${paused ? 'is-paused' : ''}`}
            style={{ ['--sl-tk-scroll' as string]: `-${scrollPx}px` }}
            onAnimationIteration={advance}
          >
            <div className="sl-ff-serif mr-6 shrink-0 italic text-sl-ember" style={{ fontSize: '1.35rem', letterSpacing: '-0.01em' }}>
              {scope.label}
            </div>
            <div className="flex items-center gap-7">
              {rows.slice(0, 10).map((r) => (
                <Entry key={r.playerId} row={r} />
              ))}
              {rows.length === 0 && (
                <span className="sl-ff-mono text-[0.62rem] uppercase tracking-[0.22em] text-sl-dim">
                  No entries yet.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="mx-auto flex max-w-[1500px] items-center justify-center gap-2 pb-1.5">
        {SCOPES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            aria-label={`Switch to ${s.label}`}
            onClick={() => setScopeIdx(i)}
            className={`sl-ticker-dot ${i === scopeIdx ? 'is-active' : ''}`}
          />
        ))}
      </div>
    </div>
  )
}

function Entry({ row }: { row: TickerEntry }) {
  const trend = row.projDelta >= 0 ? '▲' : '▼'
  const trendCls = row.projDelta >= 0 ? 'text-sl-green' : 'text-sl-signal'
  return (
    <div className="flex shrink-0 items-baseline gap-2.5 text-[0.82rem]">
      <span className="sl-ff-mono w-5 shrink-0 text-right text-[0.62rem] text-sl-dim sl-tnum">{row.rank}.</span>
      <div className="flex flex-col">
        <div className="flex items-baseline gap-1.5">
          <span className="font-medium text-sl-cream">{row.name}</span>
          <span className="sl-tnum font-semibold text-sl-ember">{fmtScore(row.points)}</span>
          <span className={`text-[0.58rem] ${trendCls}`}>{trend}</span>
        </div>
        <div className="sl-ff-mono mt-0.5 text-[0.55rem] uppercase tracking-[0.16em] text-sl-dim">
          {row.team ?? '—'}
          {row.benchedByOwner && <span className="ml-1.5 text-sl-signal">· benched {row.benchedByOwner}</span>}
          {!row.benchedByOwner && row.startedByOwner && <span className="ml-1.5 text-sl-mute">· {row.startedByOwner}</span>}
          {row.freeAgent && <span className="ml-1.5 text-sl-violet">· FA</span>}
        </div>
      </div>
    </div>
  )
}
