import { notFound } from 'next/navigation'
import { PAMS_ROSTER, buildRecaps } from '@/lib/winBallot'
import { leagueForToken, readBallots, readBoard, readVotes, submittedNames, votedNames } from '../actions'
import { BallotClient, VoteClient } from '../ballot-client'
import { ResultsView } from '../results-view'
import '../ballot.css'

export const dynamic = 'force-dynamic'

/**
 * The unfurl in the group chat. Title and card both follow the phase, so a
 * link pasted twice a month apart says two different true things instead of
 * one stale one. The token rides into the image route, which resolves it
 * again itself rather than trusting a phase in a query string.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const league = await leagueForToken(token)
  const board = league ? await readBoard(league.id) : null

  const copy = !league
    ? { title: 'Wrong door', description: 'This ballot link is not the live one. Ask Joey for the one he sent the group.' }
    : !board
    ? {
        title: 'Win-total ballot · PA Milk Society',
        description: 'Twelve managers, fourteen games. Call every win total and the room turns the twelve ballots into the lines.',
      }
    : board.revealed
    ? {
        title: 'The board · PA Milk Society 2026',
        description: 'Every line, every side the room took, and the props. Set before a snap was played.',
      }
    : {
        title: 'Over/under · PA Milk Society 2026',
        description: 'The lines are up. Take a side on all eleven, call four props, and pick rivalry week.',
      }

  const image = `/api/og/ballot/${encodeURIComponent(token)}`
  return {
    title: copy.title,
    description: copy.description,
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      title: copy.title,
      description: copy.description,
      siteName: 'The Sunday Chronicle',
      images: [{ url: image, width: 1200, height: 630, alt: copy.title }],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: copy.title,
      description: copy.description,
      images: [image],
    },
  }
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
    const [ballots, votes] = await Promise.all([readBallots(league.id), readVotes(league.id)])
    // The recaps are built here only for their order, so this board and the
    // recap page can never seat the same two managers differently.
    const order = buildRecaps(PAMS_ROSTER, ballots, board, votes).map((r) => r.manager.name)
    return <ResultsView roster={PAMS_ROSTER} board={board} votes={votes} token={token} order={order} />
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
