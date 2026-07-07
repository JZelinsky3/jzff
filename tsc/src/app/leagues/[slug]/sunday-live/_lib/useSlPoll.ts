'use client'

// The one poll. Fetches a fresh SlLeague frame on an interval, pauses while
// the tab is hidden, backs off on errors, and exposes a manual refetch for
// the demo controls. Every component reads the frame through SlProvider;
// nothing else fetches.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SlLeague } from '@/lib/sundayLive/types'

export type Demo = { year: number; week: number; progress: number }

export type PollHealth = {
  status: 'ok' | 'error'
  lastOkAt: string          // ISO of the last good frame
  failures: number
}

function dataUrl(slug: string, demo: Demo | null): string {
  const base = `/leagues/${slug}/sunday-live/data/`
  if (!demo) return base
  const q = new URLSearchParams({
    demoWeek: `${demo.year}-${demo.week}`,
    progress: String(demo.progress),
  })
  return `${base}?${q}`
}

// Slow lane multipliers: finished/idle boards barely change, don't hammer.
function intervalFor(frame: SlLeague, failures: number): number {
  const base = frame.meta.pollMs || 30_000
  const phaseMult = frame.league.phase === 'live' || frame.league.phase === 'pre-kickoff' ? 1 : 6
  const backoff = Math.min(2 ** failures, 4) // 30s -> 60s -> 120s cap
  return base * phaseMult * backoff
}

export function useSlPoll(
  slug: string,
  initial: SlLeague,
  demo: Demo | null,
  // Fires on every fresh frame with the one it replaced. This is where the
  // app derives per-poll state (WP history, score deltas): an event callback,
  // never an effect, so nothing cascades.
  onFrame?: (next: SlLeague, prev: SlLeague) => void,
) {
  const [frame, setFrame] = useState<SlLeague>(initial)
  const [health, setHealth] = useState<PollHealth>({
    status: 'ok',
    lastOkAt: initial.meta.fetchedAt,
    failures: 0,
  })

  const demoRef = useRef(demo)
  const onFrameRef = useRef(onFrame)
  const frameRef = useRef(frame)
  useEffect(() => {
    demoRef.current = demo
    onFrameRef.current = onFrame
    frameRef.current = frame
  })

  const failuresRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const fetchFrame = useCallback(async (): Promise<void> => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await fetch(dataUrl(slug, demoRef.current), { signal: ctrl.signal, cache: 'no-store' })
      if (!res.ok) throw new Error(`poll ${res.status}`)
      const next = (await res.json()) as SlLeague
      failuresRef.current = 0
      onFrameRef.current?.(next, frameRef.current)
      frameRef.current = next
      setFrame(next)
      setHealth({ status: 'ok', lastOkAt: next.meta.fetchedAt, failures: 0 })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      failuresRef.current += 1
      setHealth((h) => ({ ...h, status: 'error', failures: failuresRef.current }))
    }
  }, [slug])

  // Interval loop: self-rescheduling timeout so the cadence can react to
  // phase changes and error backoff without re-mounting.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const tick = async () => {
      if (stopped) return
      if (!document.hidden) await fetchFrame()
      if (stopped) return
      timer = setTimeout(tick, intervalFor(frameRef.current, failuresRef.current))
    }
    timer = setTimeout(tick, intervalFor(frameRef.current, failuresRef.current))

    // Coming back to the tab: refresh immediately instead of waiting out
    // whatever remains of a stale interval.
    const onVisible = () => {
      if (!document.hidden) void fetchFrame()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      abortRef.current?.abort()
    }
  }, [fetchFrame])

  // Demo progress changes should reflect immediately.
  const demoKey = demo ? `${demo.year}-${demo.week}-${demo.progress}` : ''
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    void fetchFrame()
  }, [demoKey, fetchFrame])

  return { frame, health, refetch: fetchFrame }
}
