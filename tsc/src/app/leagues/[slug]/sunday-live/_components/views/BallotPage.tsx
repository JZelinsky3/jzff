'use client'

// The full ballot: every game's pick'ems vote, who took whom, and the day's
// best ballots. Names stay sealed on games that have not kicked off.

import { Ballot } from '../desk/Ballot'
import { NflStrip } from '../desk/NflStrip'
import { useSl } from '../SlProvider'

export function BallotPage() {
  const { frame } = useSl()
  const hasVotes = frame.matchups.some((m) => m.pickems && m.pickems.totalVotes > 0)
  return (
    <div className="space-y-3 pt-3">
      <div className="mx-auto max-w-[1840px] px-4">
        <NflStrip />
      </div>
      <div className="mx-auto max-w-[900px] space-y-3 px-4">
        <div className="flex items-baseline justify-between">
          <h1 className="sl-display text-2xl text-sl-text">The Ballot</h1>
          <span className="sl-kicker">WHO THE LEAGUE PICKED</span>
        </div>
        {hasVotes ? (
          <Ballot frame={frame} />
        ) : (
          <p className="sl-panel px-4 py-8 text-center text-[13px] text-sl-dim">
            No ballots this week. The box opens when the league votes in pick&apos;ems.
          </p>
        )}
      </div>
    </div>
  )
}
