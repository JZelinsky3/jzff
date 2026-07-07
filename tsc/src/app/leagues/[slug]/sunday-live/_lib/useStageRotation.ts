'use client'

// Producer logic for the featured stage.
//
// Priorities: a pinned matchup always wins (resolved by the caller); a fresh
// high-severity storyline yanks its matchup on stage the moment its frame
// arrives (via onFrame, an event callback from the poll) — once per
// storyline, so it can't keep dragging the tour back; otherwise the stage
// tours every game (live first), advancing every DWELL_MS. Rotation freezes
// while the viewer hovers the stage.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SlLeague } from '@/lib/sundayLive/types'

const DWELL_MS = 10_000
const STORY_MIN_SEVERITY = 70
const STORY_FRESH_MS = 3 * 60_000

export function useStageRotation(initial: SlLeague, pinned: number | null, hovering: boolean) {
  const [featured, setFeatured] = useState<number | null>(initial.matchups[0]?.matchupId ?? null)

  const frameRef = useRef(initial)
  const hoverRef = useRef(hovering)
  const pinnedRef = useRef(pinned)
  const featuredRef = useRef(featured)
  useEffect(() => {
    hoverRef.current = hovering
    pinnedRef.current = pinned
    featuredRef.current = featured
  })

  // Fed by the poll's frame event: keeps the tour pool current and lets a
  // breaking storyline take the stage immediately. Each storyline gets one
  // yank; after that the tour keeps moving.
  const stagedStories = useRef(new Set<string>())
  const onFrame = useCallback((next: SlLeague) => {
    frameRef.current = next
    if (pinnedRef.current != null || hoverRef.current) return
    const now = Date.now()
    const hot = next.storylines.find(
      (s) =>
        s.severity >= STORY_MIN_SEVERITY &&
        s.refs.matchupId != null &&
        now - Date.parse(s.firstSeenAt) < STORY_FRESH_MS &&
        !stagedStories.current.has(s.id),
    )
    if (hot?.refs.matchupId != null && hot.refs.matchupId !== featuredRef.current) {
      stagedStories.current.add(hot.id)
      setFeatured(hot.refs.matchupId)
    }
  }, [])

  // Dwell tour through every game, live ones first.
  useEffect(() => {
    const id = setInterval(() => {
      if (hoverRef.current || pinnedRef.current != null) return
      const f = frameRef.current
      const live = f.matchups.filter((m) => m.status === 'live')
      const pool = live.length ? live : f.matchups
      if (pool.length === 0) return
      const idx = pool.findIndex((m) => m.matchupId === featuredRef.current)
      const next = pool[(idx + 1) % pool.length]
      setFeatured(next.matchupId)
    }, DWELL_MS)
    return () => clearInterval(id)
  }, [])

  return { featured, setFeatured, onFrame }
}
