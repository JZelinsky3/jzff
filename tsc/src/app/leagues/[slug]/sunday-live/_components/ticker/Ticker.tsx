'use client'

// The bottom ticker. One board at a time, in three beats: the board flies up
// from the bottom of the strip (entries staggered left-to-right, the plate
// rising with them when its text changes), holds a moment, crawls left at a
// constant speed until the last entry has cleared the strip, then sits empty
// for a beat before the next board rises. The plate stays put through the
// crawl; "LEADERS" holds across the whole QB/RB/WR/TE run while the position
// block swaps between boards. Hover pauses the cycle.

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SlLeague, TickerEntry, TickerScope } from '@/lib/sundayLive/types'
import { useSl } from '../SlProvider'
import { fmtPts } from '../../_lib/format'

const BOARDS: { scope: TickerScope; title: string; pos?: string }[] = [
  { scope: 'all',   title: 'TOP PERFORMERS' },
  { scope: 'qb',    title: 'LEADERS', pos: 'QB' },
  { scope: 'rb',    title: 'LEADERS', pos: 'RB' },
  { scope: 'wr',    title: 'LEADERS', pos: 'WR' },
  { scope: 'te',    title: 'LEADERS', pos: 'TE' },
  { scope: 'boom',  title: 'OVER PROJECTION' },
  { scope: 'bench', title: 'BEST LEFT ON BENCH' },
  { scope: 'duds',  title: 'THE DUDS' },
]

/* Crawl speed in px/s; duration is measured off the track so it stays
   constant no matter how many entries a board has. */
const SPEED_PX_S = 90
const FALLBACK_S = 30
const STAGGER_MS = 70
const RISE_MS = 450
const HOLD_MS = 1_200
const GAP_MS = 500

type Phase = 'rise' | 'scroll' | 'gap'

function boardsOf(frame: SlLeague) {
  return BOARDS.map((b) => ({ ...b, entries: (frame.ticker[b.scope] ?? []).slice(0, 10) })).filter(
    (b) => b.entries.length > 0,
  )
}

// Position boards already announce the position on the plate, so each entry
// skips it; the mixed boards (top performers, duds...) keep it, worn between
// the rank and the name.
function Entry({ e, i, showPos }: { e: TickerEntry; i: number; showPos: boolean }) {
  return (
    <span
      className="sl-tick-in inline-flex shrink-0 items-baseline gap-2 px-4"
      style={{ animationDelay: `${i * STAGGER_MS}ms` }}
    >
      <span className="sl-num text-[11px] text-sl-dim">{e.rank}</span>
      {showPos && e.position && (
        <span className="sl-num self-center rounded-[2px] bg-sl-navy/40 px-1 py-0.5 text-[8.5px] font-bold leading-none text-sl-cream">
          {e.position}
        </span>
      )}
      <span className="sl-display text-[15px] text-sl-text">{e.name}</span>
      {e.team && <span className="sl-num text-[10px] text-sl-dim">{e.team}</span>}
      <span className="sl-num text-[14.5px] font-semibold text-sl-glow">{fmtPts(e.points)}</span>
    </span>
  )
}

export function Ticker() {
  const { frame } = useSl()
  const boards = boardsOf(frame)

  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('rise')
  const [paused, setPaused] = useState(false)
  const [dur, setDur] = useState(FALLBACK_S)
  const trackRef = useRef<HTMLDivElement>(null)

  const count = boards.length
  const board = count > 0 ? boards[idx % count] : null
  const n = board?.entries.length ?? 0

  // Let the rise finish, hold a beat, then start the crawl. Hover restarts
  // the hold when it ends.
  useEffect(() => {
    if (phase !== 'rise' || paused || n === 0) return
    const t = setTimeout(() => setPhase('scroll'), n * STAGGER_MS + RISE_MS + HOLD_MS)
    return () => clearTimeout(t)
  }, [idx, phase, paused, n])

  // The empty beat after the last entry clears, before the next board rises.
  useEffect(() => {
    if (phase !== 'gap') return
    const t = setTimeout(() => {
      setIdx((i) => i + 1)
      setPhase('rise')
    }, GAP_MS)
    return () => clearTimeout(t)
  }, [phase])

  // Size the crawl to the board before paint so speed stays constant.
  useLayoutEffect(() => {
    if (phase !== 'scroll') return
    const el = trackRef.current
    if (el) setDur(Math.max(6, el.scrollWidth / SPEED_PX_S))
  }, [phase])

  if (!board) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sl-line bg-sl-studio/95 backdrop-blur"
      aria-label="Stat ticker"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex h-12 items-center">
        {/* The plate: keyed on the title so LEADERS holds the left edge
            across the whole position run instead of re-entering each board. */}
        <span
          key={`plate-${board.title}`}
          className="sl-tick-in z-10 flex h-full shrink-0 items-center border-r border-sl-line bg-sl-studio px-6"
        >
          <span className="sl-display text-[17px] tracking-wide text-sl-electric">{board.title}</span>
        </span>
        {/* The position block: its own plate, fixed in place while the
            board crawls, swapped when the next position takes over. */}
        {board.pos && (
          <span
            key={`pos-${idx}`}
            className="sl-tick-in z-10 flex h-full shrink-0 items-center border-r border-sl-line bg-sl-studio px-3"
          >
            <span className="sl-chip border-sl-navy/60 bg-sl-navy/25 text-sl-cream!">{board.pos}</span>
          </span>
        )}
        <div className="h-full flex-1 overflow-hidden">
          {/* The crawl class stays on through the gap so the finished
              animation keeps the track parked off the left edge. */}
          <div
            key={`row-${idx}`}
            ref={trackRef}
            className={`flex h-full w-max items-center ${phase === 'rise' ? '' : 'sl-tick-scroll'}`}
            style={
              phase === 'rise'
                ? undefined
                : { animationDuration: `${dur}s`, animationPlayState: paused ? 'paused' : 'running' }
            }
            onAnimationEnd={(ev) => {
              // Entry rise animations bubble up; only the track's own crawl
              // should advance the board.
              if (ev.target !== ev.currentTarget) return
              setPhase('gap')
            }}
          >
            {board.entries.map((e, i) => (
              <Fragment key={e.playerId}>
                {i > 0 && (
                  <span
                    aria-hidden
                    className="sl-tick-in h-5 w-px shrink-0 bg-sl-line"
                    style={{ animationDelay: `${i * STAGGER_MS}ms` }}
                  />
                )}
                <Entry e={e} i={i} showPos={!board.pos} />
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
