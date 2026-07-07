'use client'

// Broadcast context. SundayLiveApp builds this once; every panel reads from
// it. Components never fetch and never keep their own copy of frame data.

import { createContext, useContext } from 'react'
import type { SlLeague } from '@/lib/sundayLive/types'
import type { SlWeekContext } from '@/lib/sundayLive/seasonContext'
import type { Demo, PollHealth } from '../_lib/useSlPoll'
import type { WpPoint } from '../_lib/wpSeries'

// Desk sub-views. One mounted app, one poll; switching views swaps which
// slice of the frame is in the DOM (the "pages" are free).
export type SlView = 'desk' | 'storylines' | 'leaders' | 'news' | 'scenarios' | 'ballot'

export type SlContextValue = {
  frame: SlLeague
  // Week-static context (h2h records, streaks, power ranks) built once at SSR;
  // never rides the poll payload. Null when the season context was cold.
  weekContext: SlWeekContext | null
  wpSeries: WpPoint[]
  // rosterId -> points gained since the previous frame (score bump trigger).
  scoreDelta: Map<number, number>
  // playerId -> points gained since the previous frame ("just scored" flash).
  playerDelta: Map<string, number>
  // Storyline ids that arrived recently (client-side sighting; drives the NEW
  // tag and the entrance animation backstop in demo where firstSeenAt renews
  // every poll).
  newStorylineIds: Set<string>
  health: PollHealth
  // Current desk view + navigation (URL-synced via history.replaceState).
  view: SlView
  setView: (v: SlView) => void
  // Stage production state.
  featured: number | null
  pinned: number | null
  setPinned: (id: number | null) => void
  feature: (id: number) => void
  setStageHover: (h: boolean) => void
  // Demo controls.
  demo: Demo | null
  setDemo: (d: Demo | null) => void
}

const SlContext = createContext<SlContextValue | null>(null)

export function SlProvider({ value, children }: { value: SlContextValue; children: React.ReactNode }) {
  return <SlContext.Provider value={value}>{children}</SlContext.Provider>
}

export function useSl(): SlContextValue {
  const ctx = useContext(SlContext)
  if (!ctx) throw new Error('useSl outside SlProvider')
  return ctx
}
