import { QUESTIONS } from '@/lib/leftovers'
import { leagueForToken, playedNames, readRuns } from '../actions'
import { GameDeck } from '../game-deck'
import '../leftovers.css'

export const dynamic = 'force-dynamic'

/**
 * The unfurl in the group chat. The description follows turnout, so a link
 * pasted on day one and read again a week later says two different true
 * things rather than one stale one. The token rides into the image route,
 * which resolves it again itself rather than trusting a count in a query.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const league = await leagueForToken(token)
  const played = league ? await playedNames(league.id) : []

  const copy = !league
    ? {
        title: 'Wrong door',
        description: 'This Leftovers link is not the live one. Ask Joey for the one he sent the group.',
      }
    : played.length === 0
    ? {
        title: 'The Leftovers · PA Milk Society',
        description: `${QUESTIONS.length} questions from the numbers the countdown never used. Four names each, one run, and the whole league sees your score.`,
      }
    : {
        title: 'The Leftovers · PA Milk Society',
        description: `${played.length} ${played.length === 1 ? 'manager has' : 'managers have'} played. ${QUESTIONS.length} questions, four names each, one run.`,
      }

  const image = `/api/og/leftovers/${encodeURIComponent(token)}`
  return {
    title: copy.title,
    description: copy.description,
    // A private link into one league's history. Nothing here should be
    // indexed, same rule the ballot and the bracket run on.
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

// Deliberately NOT under /league/[slug]: that layout sends signed-out visitors
// to /login, and the whole point of this link is that eleven people who have
// no account can open it and play.
export default async function LeftoversPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const league = await leagueForToken(token)

  if (!league) {
    return (
      <div className="lo">
        <div className="lo-shell">
          <div className="lo-top">
            <span className="lo-lg">PA Milk Society</span>
            <span className="lo-rt">Wrong door</span>
          </div>
          <div className="lo-stack">
            <span className="lo-k">Not the live link</span>
            <h1>Wrong<br />door</h1>
            <p>
              This link has been retired or was mistyped. Ask Joey for the one
              he sent the group.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const [played, runs] = await Promise.all([playedNames(league.id), readRuns(league.id)])

  return (
    <div className="lo">
      <GameDeck
        token={token}
        leagueId={league.id}
        leagueName={league.name}
        played={played}
        runs={runs}
      />
    </div>
  )
}
