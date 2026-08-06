'use client'

import dynamic from 'next/dynamic'
import type { BallotManager } from '@/lib/winBallot'

// The deck restores a saved draft from the device during its first render,
// so server-rendering it would guarantee a hydration mismatch (the server
// has no localStorage). There is nothing to gain from SSR on a form behind
// a private token, so it ships client-only.
const BallotDeck = dynamic(() => import('./ballot-deck').then((m) => m.BallotDeck), {
  ssr: false,
  loading: () => (
    <div className="wb">
      <div className="wb-shell">
        <div className="wb-stage">
          <div className="wb-slide">
            <div className="wb-card">
              <div className="wb-card-top"><span>PA Milk Society</span><span>Form W/L · 2026</span></div>
              <h1>Call all <em>twelve.</em></h1>
              <div className="wb-card-sub">Win-total ballot · 14 games</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
})

export function BallotClient(props: {
  leagueId: string
  token: string
  roster: BallotManager[]
  alreadyIn: string[]
}) {
  return <BallotDeck {...props} />
}
