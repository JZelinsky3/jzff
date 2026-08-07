'use client'

import dynamic from 'next/dynamic'
import type { Ballot, Results, RoundId } from '@/lib/greatestTeam'

// The deck restores a saved draft from the device during its first render, so
// server-rendering it would guarantee a hydration mismatch. There is nothing
// to gain from SSR on a form behind a private token, so it ships client-only.
const VoteDeck = dynamic(() => import('./vote-deck').then((m) => m.VoteDeck), {
  ssr: false,
  loading: () => (
    <div className="gt">
      <div className="gt-shell">
        <div className="gt-head">
          <div className="gt-kicker">PA Milk Society</div>
          <h1>The <em>greatest</em> team we&apos;ve had</h1>
          <div className="gt-sub">Sixteen teams, one winner</div>
        </div>
      </div>
    </div>
  ),
})

export function VoteClient(props: {
  leagueId: string
  token: string
  round: RoundId
  results: Results
  roster: readonly string[]
  alreadyVoted: string[]
}) {
  return <VoteDeck {...props} />
}

export type { Ballot }
