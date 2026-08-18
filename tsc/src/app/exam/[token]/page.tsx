import type { Viewport } from 'next'
import { QUESTIONS } from '@/lib/milkExam'
import { leagueForToken, playedNames, readRuns } from '../actions'
import { GameDeck } from '../game-deck'
import '../exam.css'

export const dynamic = 'force-dynamic'

/**
 * The root layout ships `themeColor: "#0e1620"`, the almanac's navy, which
 * Safari paints into the top and bottom bars. On a page that is warm
 * near-black end to end that reads as two navy stripes bracketing the
 * design, so this route declares its own. The layout's own comment invites
 * the override; width and scale are restated because this replaces the
 * inherited object rather than merging into it.
 */
export const viewport: Viewport = {
  themeColor: '#0e0d0c',
  width: 'device-width',
  initialScale: 1,
}

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
        description: 'This link is not the live one. Ask Joey for the one he sent the group.',
      }
    : played.length === 0
    ? {
        title: 'The Milk Exam · PA Milk Society',
        description: `Seven years of this league, in ${QUESTIONS.length} questions.`,
      }
    : {
        title: 'The Milk Exam · PA Milk Society',
        description: `${played.length} ${played.length === 1 ? 'manager has' : 'managers have'} sat it. ${QUESTIONS.length} questions on seven years of this league.`,
      }

  const image = `/api/og/exam/${encodeURIComponent(token)}`
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
export default async function ExamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const league = await leagueForToken(token)

  if (!league) {
    return (
      <div className="mx">
        <div className="mx-shell">
          <div className="mx-top">
            <span className="mx-lg">PA Milk Society</span>
            <span className="mx-rt">Wrong door</span>
          </div>
          <div className="mx-stack">
            <span className="mx-k">Not the live link</span>
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
    <div className="mx">
      <GameDeck token={token} leagueId={league.id} played={played} runs={runs} />
    </div>
  )
}
