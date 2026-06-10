'use client'

// Matchup-booth client wrapper. Polls the same hub data endpoint and renders
// the booth components for ONE matchup. Coach Mode collapses the page to
// "what should I have done differently" essentials only.

import Link from 'next/link'
import { useState } from 'react'
import type { SlLeague } from '@/lib/sundayLive/types'
import { useSundayLivePoll, type Demo } from '../../_lib/useSundayLivePoll'
import { StatusStrip } from '../StatusStrip'
import { DemoBanner } from '../DemoBanner'
import { EmptyState } from '../EmptyState'
import { MatchupHero } from './MatchupHero'
import { PositionH2H } from './PositionH2H'
import { StarterTiles } from './StarterTiles'
import { BenchRemorse } from './BenchRemorse'
import { StackTracker } from './StackTracker'
import { DudWatch } from './DudWatch'
import { ComebackMath } from './ComebackMath'
import { MatchupMoments } from './MatchupMoments'
import { CoachModeToggle } from './CoachModeToggle'

export function BoothBoard({
  slug,
  matchupId,
  initial,
  initialDemo,
}: {
  slug: string
  matchupId: number
  initial: SlLeague
  initialDemo: Demo | null
}) {
  const { league, refresh, demo, nudgeDemo, exitDemo } = useSundayLivePoll(slug, initial, initialDemo)
  const [coach, setCoach] = useState(false)

  const matchup = league.matchups.find((m) => m.matchupId === matchupId)
  if (!matchup) {
    return (
      <>
        <StatusStrip league={league} refresh={refresh} />
        <EmptyState kicker="Matchup not found" title="This booth is empty.">
          The matchup may not exist in the current week.{' '}
          <Link href={`/leagues/${slug}/sunday-live/`} className="text-sl-ember hover:underline">
            Back to the hub →
          </Link>
        </EmptyState>
      </>
    )
  }

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

      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={`/leagues/${slug}/sunday-live/`}
          className="sl-ff-mono text-[0.6rem] uppercase tracking-[0.22em] text-sl-mute hover:text-sl-ember"
        >
          ← Back to broadcast
        </Link>
        <CoachModeToggle on={coach} onChange={setCoach} />
      </div>

      {/* Hero always shown */}
      <MatchupHero matchup={matchup} />

      {coach ? (
        // COACH MODE — bench remorse + dud watch + inactives only
        <div className="mt-4 flex flex-col gap-4">
          <BenchRemorse matchup={matchup} />
          <DudWatch matchup={matchup} />
        </div>
      ) : (
        // FULL VIEW — every booth card
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <PositionH2H matchup={matchup} />
            <StarterTiles matchup={matchup} />
            <BenchRemorse matchup={matchup} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <DudWatch matchup={matchup} />
            <ComebackMath matchup={matchup} />
            <MatchupMoments matchup={matchup} moments={league.moments} />
            <StackTracker matchup={matchup} />
          </div>
        </div>
      )}
    </>
  )
}
