'use client'

import dynamic from 'next/dynamic'
import type { BallotManager, LockedBoard } from '@/lib/winBallot'

function Loading({ title, sub, form }: { title: React.ReactNode; sub: string; form: string }) {
  return (
    <div className="wb">
      <div className="wb-shell">
        <div className="wb-stage">
          <div className="wb-slide">
            <div className="wb-card">
              <div className="wb-card-top"><span>PA Milk Society</span><span>{form} · 2026</span></div>
              <h1>{title}</h1>
              <div className="wb-card-sub">{sub}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Both decks restore a saved draft from the device during their first render,
// so server-rendering them would guarantee a hydration mismatch (the server
// has no localStorage). There is nothing to gain from SSR on a form behind a
// private token, so they ship client-only.
const BallotDeck = dynamic(() => import('./ballot-deck').then((m) => m.BallotDeck), {
  ssr: false,
  loading: () => <Loading title={<>Call all <em>twelve.</em></>} sub="Win-total ballot · 14 games" form="Form W/L" />,
})

const VoteDeck = dynamic(() => import('./vote-deck').then((m) => m.VoteDeck), {
  ssr: false,
  loading: () => <Loading title={<>The board is <em>up.</em></>} sub="Over/under · 14 games" form="Form O/U" />,
})

export function BallotClient(props: {
  leagueId: string
  token: string
  roster: BallotManager[]
  alreadyIn: string[]
}) {
  return <BallotDeck {...props} />
}

export function VoteClient(props: {
  leagueId: string
  token: string
  roster: BallotManager[]
  board: LockedBoard
  alreadyVoted: string[]
}) {
  return <VoteDeck {...props} />
}
