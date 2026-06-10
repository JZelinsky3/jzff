'use client'

// Single poll hook for the entire hub. The server seeds the first frame; this
// hook fetches successive frames every 30s while at least one matchup is
// in-motion. Demo mode pauses the live poll and lets the user step progress
// manually instead.

import { useCallback, useEffect, useState } from 'react'
import type { SlLeague } from '@/lib/sundayLive/types'

export type Demo = { year: number; week: number; progress: number }
export type RefreshState = 'live' | 'updating' | 'retrying' | 'demo' | 'idle'

const REFRESH_MS = 30 * 1000

export function useSundayLivePoll(
  slug: string,
  initial: SlLeague,
  initialDemo: Demo | null,
) {
  const [state, setState] = useState<{ league: SlLeague; prev: SlLeague | null }>({
    league: initial,
    prev: null,
  })
  const [refresh, setRefresh] = useState<RefreshState>(initialDemo ? 'demo' : 'live')
  const [demo, setDemo] = useState<Demo | null>(initialDemo)

  const dataUrl = useCallback(
    (d: Demo | null) => {
      let u = `/leagues/${slug}/sunday-live/data/`
      if (d) {
        const q = new URLSearchParams()
        q.set('demoWeek', `${d.year}-${d.week}`)
        q.set('progress', d.progress.toFixed(2))
        u += `?${q.toString()}`
      }
      return u
    },
    [slug],
  )

  const fetchWith = useCallback(
    async (d: Demo | null) => {
      setRefresh('updating')
      try {
        const r = await fetch(dataUrl(d), { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const next: SlLeague = await r.json()
        setState((s) => ({ league: next, prev: s.league }))
        setRefresh(d ? 'demo' : 'live')
      } catch (e) {
        console.warn('sunday-live poll failed', e)
        setRefresh('retrying')
      }
    },
    [dataUrl],
  )

  const phase = state.league.league.phase
  const anyMotion = phase === 'live' || phase === 'pre-kickoff'

  useEffect(() => {
    if (demo) return
    if (!anyMotion) {
      setRefresh('idle')
      return
    }
    const t = setInterval(() => void fetchWith(null), REFRESH_MS)
    return () => clearInterval(t)
  }, [demo, anyMotion, fetchWith])

  const nudgeDemo = useCallback(
    (delta: number) => {
      if (!demo) return
      const next: Demo = { ...demo, progress: Math.max(0, Math.min(1, demo.progress + delta)) }
      const q = new URLSearchParams(window.location.search)
      q.set('demoWeek', `${next.year}-${next.week}`)
      q.set('progress', next.progress.toFixed(2))
      window.history.replaceState(null, '', `?${q.toString()}`)
      setDemo(next)
      void fetchWith(next)
    },
    [demo, fetchWith],
  )

  const exitDemo = useCallback(() => {
    window.location.href = window.location.pathname
  }, [])

  return {
    league: state.league,
    prev: state.prev,
    refresh,
    demo,
    nudgeDemo,
    exitDemo,
  }
}
