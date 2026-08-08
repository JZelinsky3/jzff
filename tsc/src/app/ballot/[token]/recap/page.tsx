import Link from 'next/link'
import { PAMS_ROSTER, SEASON, buildRecaps } from '@/lib/winBallot'
import { leagueForToken, readBallots, readBoard, readVotes } from '../../actions'
import { RecapClient } from '../../recap-client'
import '../../ballot.css'
import './recap.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const league = await leagueForToken(token)
  const board = league ? await readBoard(league.id) : null

  const copy = !league || !board?.revealed
    ? { title: 'Wrong door', description: 'This recap is not open yet.' }
    : {
        title: `The recap · PA Milk Society ${SEASON}`,
        description: 'Twelve managers, twelve cards. Every ballot behind every line, and the side the room took on it.',
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

/**
 * The recap, as a page rather than twelve screenshots.
 *
 * Same public token as the ballot, one level down, so the group chat gets a
 * second link and no second account. One card at a time, picked by name, with
 * the name in the hash so a single card is still linkable. Sealed until the
 * room is opened: the cards carry who projected what, which is the whole
 * point of the ballot being sealed in the first place.
 */
export default async function RecapPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const league = await leagueForToken(token)
  const board = league ? await readBoard(league.id) : null

  if (!league || !board || !board.revealed) {
    return (
      <div className="wb">
        <div className="wb-shell">
          <div className="wb-card" style={{ marginTop: '1.2rem' }}>
            <div className="wb-card-top"><span>PA Milk Society</span><span>Recap · {SEASON}</span></div>
            <h1>{!league ? <>Wrong <em>door.</em></> : <>Still <em>sealed.</em></>}</h1>
            <div className="wb-card-sub">
              {!league ? 'This link isn’t the live one' : 'Nothing to read yet'}
            </div>
          </div>
          <div className="wb-brief">
            <p>
              {!league
                ? 'Ask Joey for the link he sent the group and open that instead.'
                : !board
                ? 'The lines aren’t up yet. Once the ballots are in and the board is set, the recap builds itself.'
                : 'The cards are in but the room hasn’t been opened. Nobody reads a thing until every pick is unsealed at once.'}
            </p>
            {league && board && (
              <p>
                <Link className="wb-linkish" href={`/ballot/${token}`}>Back to the card</Link>
              </p>
            )}
          </div>
          <div className="wb-foot">PA Milk Society · {SEASON}</div>
        </div>
      </div>
    )
  }

  const [ballots, votes] = await Promise.all([readBallots(league.id), readVotes(league.id)])
  const recaps = buildRecaps(PAMS_ROSTER, ballots, board, votes)

  return (
    <div className="wb">
      <div className="wb-shell rp-shell">
        <div className="wb-card" style={{ marginTop: '1.2rem' }}>
          <div className="wb-card-top"><span>PA Milk Society</span><span>Recap · {SEASON}</span></div>
          <h1>Twelve cards, <em>one at a time.</em></h1>
          <div className="wb-card-sub">
            {board.ballotCount} ballot{board.ballotCount === 1 ? '' : 's'} set the lines ·{' '}
            {votes.length} card{votes.length === 1 ? '' : 's'} took a side
          </div>
        </div>

        <div className="wb-brief">
          <p>
            Every line came out of the preseason ballots
            {board.basis === 'outsiders' ? ', with nobody counted on their own season' : ''}.
            Pick a name for their card: who projected what, where the line landed
            against the model, and the side the room took once the number was up. The
            board is the other view, and its rows open a card too.
          </p>
          <p className="rp-order">
            Names run in board order. Same line, higher average goes first; same again,
            the over/under settles it.
          </p>
        </div>

        <RecapClient recaps={recaps} ballotCount={board.ballotCount} />

        <div className="wb-foot" style={{ marginTop: '2rem' }}>
          <Link className="wb-linkish" href={`/ballot/${token}`}>The board and the props</Link>
          {' · '}Nothing moves now. Come back when the season settles it.
        </div>
      </div>
    </div>
  )
}
