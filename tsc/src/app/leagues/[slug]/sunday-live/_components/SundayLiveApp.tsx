'use client'

// Client root of the broadcast. Owns the poll, the WP history, stage
// production state, and demo controls. Renders the desk; channel surf (P3)
// mounts as an overlay above it.
//
// Takes everything as props (never reads route params) so a future
// multi-league hub can mount several of these side by side.

import { useCallback, useState } from 'react'
import type { SlLeague } from '@/lib/sundayLive/types'
import type { SlWeekContext } from '@/lib/sundayLive/seasonContext'
import { useSlPoll, type Demo } from '../_lib/useSlPoll'
import { appendWp, type WpPoint } from '../_lib/wpSeries'
import type { ScenarioFlips } from '../_lib/scenarioFlips'
import { useStageRotation } from '../_lib/useStageRotation'
import { SlProvider, type SlContextValue, type SlView } from './SlProvider'
import { Masthead } from './chrome/Masthead'
import { Desk } from './desk/Desk'
import { OffAir } from './chrome/OffAir'
import { Ticker } from './ticker/Ticker'
import { StorylinesPage } from './views/StorylinesPage'
import { LeadersPage } from './views/LeadersPage'
import { NewsPage } from './views/NewsPage'
import { ScenariosPage } from './views/ScenariosPage'
import { BallotPage } from './views/BallotPage'

function wpPointsOf(frame: SlLeague): WpPoint[] {
  return frame.matchups.map((m) => ({
    t: frame.meta.fetchedAt,
    matchupId: m.matchupId,
    wpA: m.a.wp,
  }))
}

// Tracks when THIS client first saw each storyline id. NEW = fresh on the
// server AND fresh here; the client half is the backstop for demo mode, where
// nothing persists and firstSeenAt restarts every poll.
type StorySeen = { at: Map<string, number>; newIds: Set<string> }

const STORY_NEW_MS = 60_000

function storySeenNext(prev: Map<string, number>, frame: SlLeague): StorySeen {
  const now = Date.now()
  const at = new Map(prev)
  const newIds = new Set<string>()
  for (const s of frame.storylines) {
    if (!at.has(s.id)) at.set(s.id, now)
    const clientAge = now - (at.get(s.id) ?? now)
    const serverAge = now - Date.parse(s.firstSeenAt)
    if (clientAge < STORY_NEW_MS && serverAge < STORY_NEW_MS) newIds.add(s.id)
  }
  return { at, newIds }
}

// Score movement between frames, at both grains: per roster (score bump on
// the bugs) and per player (the "just scored" flash on box-score rows). The
// maps are replaced wholesale each poll, so a new score updates the flash
// rather than accumulating.
function deltasBetween(
  prev: SlLeague,
  next: SlLeague,
): { roster: Map<number, number>; player: Map<string, number> } {
  const roster = new Map<number, number>()
  const player = new Map<string, number>()
  const prevScore = new Map<number, number>()
  const prevPts = new Map<string, number>()
  for (const m of prev.matchups) {
    for (const s of [m.a, m.b]) {
      prevScore.set(s.rosterId, s.score)
      for (const p of s.players) prevPts.set(p.playerId, p.points)
    }
  }
  for (const m of next.matchups) {
    for (const s of [m.a, m.b]) {
      const was = prevScore.get(s.rosterId)
      if (was != null && s.score !== was) roster.set(s.rosterId, s.score - was)
      for (const p of s.players) {
        const w = prevPts.get(p.playerId)
        if (w != null && p.points !== w) player.set(p.playerId, p.points - w)
      }
    }
  }
  return { roster, player }
}

// Keep ?view= in the address bar so views are shareable without navigation.
function writeViewUrl(view: SlView) {
  const url = new URL(window.location.href)
  if (view === 'desk') url.searchParams.delete('view')
  else url.searchParams.set('view', view)
  window.history.replaceState(null, '', url)
}

export function SundayLiveApp({
  slug,
  initialFrame,
  initialDemo,
  initialView,
  initialScenarioFlips,
  wpSeed,
  weekContext,
}: {
  slug: string
  initialFrame: SlLeague
  initialDemo: Demo | null
  initialView: SlView
  initialScenarioFlips?: ScenarioFlips
  wpSeed: WpPoint[]
  weekContext: SlWeekContext | null
}) {
  const [demo, setDemo] = useState<Demo | null>(initialDemo)
  const [view, setViewState] = useState<SlView>(initialView)
  const setView = useCallback((v: SlView) => {
    setViewState(v)
    writeViewUrl(v)
  }, [])

  // Derived-per-poll state, updated in the poll's onFrame callback (an event,
  // not an effect, so nothing cascades on render).
  const [wpSeries, setWpSeries] = useState<WpPoint[]>(() =>
    appendWp(wpSeed, wpPointsOf(initialFrame)),
  )
  const [scoreDelta, setScoreDelta] = useState<Map<number, number>>(() => new Map())
  const [playerDelta, setPlayerDelta] = useState<Map<string, number>>(() => new Map())
  const [storySeen, setStorySeen] = useState<StorySeen>(() =>
    storySeenNext(new Map(), initialFrame),
  )

  // Stage production.
  const [pinned, setPinned] = useState<number | null>(null)
  const [hovering, setHovering] = useState(false)
  const rotation = useStageRotation(initialFrame, pinned, hovering)

  const onFrame = useCallback(
    (next: SlLeague, prev: SlLeague) => {
      setWpSeries((s) => appendWp(s, wpPointsOf(next)))
      const deltas = deltasBetween(prev, next)
      setScoreDelta(deltas.roster)
      setPlayerDelta(deltas.player)
      setStorySeen((s) => storySeenNext(s.at, next))
      rotation.onFrame(next)
    },
    [rotation],
  )

  const { frame, health } = useSlPoll(slug, initialFrame, demo, onFrame)

  // Pinned always wins; fall back if the featured matchup vanished (demo week
  // change).
  const rotationExists = frame.matchups.some((m) => m.matchupId === rotation.featured)
  const featured =
    pinned ?? (rotationExists ? rotation.featured : frame.matchups[0]?.matchupId ?? null)

  const value: SlContextValue = {
    frame,
    weekContext,
    wpSeries,
    scoreDelta,
    playerDelta,
    newStorylineIds: storySeen.newIds,
    health,
    view,
    setView,
    featured,
    pinned,
    setPinned,
    feature: rotation.setFeatured,
    setStageHover: setHovering,
    demo,
    setDemo,
  }

  const offAir = frame.matchups.length === 0

  return (
    <SlProvider value={value}>
      <div className="flex min-h-screen flex-col">
        <Masthead />
        <main className="flex-1 pb-16">
          {offAir ? (
            <OffAir />
          ) : view === 'storylines' ? (
            <StorylinesPage />
          ) : view === 'leaders' ? (
            <LeadersPage />
          ) : view === 'news' ? (
            <NewsPage />
          ) : view === 'scenarios' ? (
            <ScenariosPage initialFlips={initialScenarioFlips} />
          ) : view === 'ballot' ? (
            <BallotPage />
          ) : (
            <Desk />
          )}
        </main>
        {!offAir && <Ticker />}
      </div>
    </SlProvider>
  )
}
