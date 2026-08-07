import { notFound } from 'next/navigation'
import { PAMS_ROSTER } from '@/lib/winBallot'
import { leagueForToken, readBoard, readVotes, submittedNames, votedNames } from '../actions'
import { BallotClient, VoteClient } from '../ballot-client'
import { ResultsView } from '../results-view'
import '../ballot.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Win totals · PA Milk Society',
  description: 'Twelve managers, one win total each. The room sets the lines, then takes a side on every one of them.',
}

// Deliberately NOT under /league/[slug]: that layout redirects signed-out
// visitors to /login, and the whole point of this link is that eleven people
// can open it without an account. The token in the path is both the address
// and the authorization.
//
// One link, three phases, decided by the league's state rather than by the
// URL, so nobody has to be sent a second address:
//   no board            -> file a win-total ballot
//   board, sealed       -> take a side on the lines
//   board, opened       -> read what the room did
export default async function BallotPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const league = await leagueForToken(token)
  if (!league) {
    return (
      <div className="wb">
        <div className="wb-shell">
          <div className="wb-stage">
            <div className="wb-slide">
              <div className="wb-card">
                <div className="wb-card-top"><span>PA Milk Society</span><span>Form W/L · 2026</span></div>
                <h1>Wrong <em>door.</em></h1>
                <div className="wb-card-sub">This link isn&apos;t the live one</div>
              </div>
              <div className="wb-brief">
                <p>
                  The ballot is open by invitation only, and this link either
                  expired or was never the current one.
                </p>
                <p>Ask Joey for the link he sent the group and open that instead.</p>
              </div>
            </div>
          </div>
          <div className="wb-foot">PA Milk Society · 2026</div>
        </div>
      </div>
    )
  }

  if (!PAMS_ROSTER.length) notFound()

  const board = await readBoard(league.id)

  if (!board) {
    const alreadyIn = await submittedNames(league.id)
    return (
      <BallotClient
        leagueId={league.id}
        token={token}
        roster={PAMS_ROSTER}
        alreadyIn={alreadyIn}
      />
    )
  }

  if (board.revealed) {
    const votes = await readVotes(league.id)
    return <ResultsView roster={PAMS_ROSTER} board={board} votes={votes} />
  }

  const alreadyVoted = await votedNames(league.id)
  return (
    <VoteClient
      leagueId={league.id}
      token={token}
      roster={PAMS_ROSTER}
      board={board}
      alreadyVoted={alreadyVoted}
    />
  )
}
