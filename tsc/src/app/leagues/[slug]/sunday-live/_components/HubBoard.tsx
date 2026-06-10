'use client'

// The client surface that orchestrates the live hub. Owns the poll, owns which
// matchup is on the hero, and renders every section beneath the status strip.
//
// Layout (desktop): column 1 ≈ 1.9fr hero + wire below, column 2 ≈ 1fr
// scoreboard + NFL strip below. Bottom ticker is fixed in viewport.

import { useState } from 'react'
import type { SlLeague } from '@/lib/sundayLive/types'
import { useSundayLivePoll, type Demo } from '../_lib/useSundayLivePoll'
import { StatusStrip } from './StatusStrip'
import { DemoBanner } from './DemoBanner'
import { HeroMatchup } from './HeroMatchup'
import { LeagueScoreboard } from './LeagueScoreboard'
import { NFLStrip } from './NFLStrip'
import { TheWire } from './TheWire'
import { BottomTicker } from './BottomTicker'
import { EmptyState } from './EmptyState'
import { LeagueStacks } from './LeagueStacks'
import { InactivesRadar } from './InactivesRadar'
import { SinceKickoff } from './SinceKickoff'
import { PowerPulse } from './PowerPulse'

export function HubBoard({
  slug,
  initial,
  initialDemo,
}: {
  slug: string
  initial: SlLeague
  initialDemo: Demo | null
}) {
  const { league, refresh, demo, nudgeDemo, exitDemo } = useSundayLivePoll(slug, initial, initialDemo)
  const [activeId, setActiveId] = useState<number | null>(null)

  // When the side scoreboard is clicked, we promote that matchup to the front
  // of the cycle. Cheap implementation: rotate the array so the picked one is
  // first and the hero starts from index 0.
  const matchups = activeId == null
    ? league.matchups
    : (() => {
        const idx = league.matchups.findIndex((m) => m.matchupId === activeId)
        if (idx < 0) return league.matchups
        return [league.matchups[idx], ...league.matchups.slice(0, idx), ...league.matchups.slice(idx + 1)]
      })()

  return (
    <>
      <StatusStrip league={league} refresh={refresh} />

      {demo && (
        <DemoBanner
          demo={demo}
          onBack={() => nudgeDemo(-0.1)}
          onFwd={() => nudgeDemo(0.1)}
          onExit={exitDemo}
        />
      )}

      <InactivesRadar phase={league.league.phase} inactives={league.inactives} />
      <SinceKickoff league={league} />

      {league.matchups.length === 0 ? (
        <EmptyState kicker="No live week" title="Matchups will appear here every Sunday.">
          Once your league sets the current week, the broadcast lights up automatically.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.9fr_1fr]">
          {/* Column 1: hero + NFL strip + wire */}
          <div className="flex min-w-0 flex-col gap-4">
            <HeroMatchup slug={slug} matchups={matchups} onSelect={() => undefined} />
            <NFLStrip slug={slug} games={league.nflGames} />
            <TheWire slug={slug} events={league.wire} />
          </div>

          {/* Column 2: scoreboard + league stacks + power pulse */}
          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[88px] lg:self-start">
            <LeagueScoreboard
              matchups={league.matchups}
              activeId={activeId}
              onPick={(id) => setActiveId(id)}
            />
            <PowerPulse rows={league.powerPulse} />
            <LeagueStacks stacks={league.stacks} />
          </div>
        </div>
      )}

      <BottomTicker board={league.ticker} slug={slug} />
    </>
  )
}
