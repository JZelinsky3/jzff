import { notFound } from 'next/navigation'
import { PAMS_ROSTER } from '@/lib/winBallot'
import { leagueForToken, submittedNames } from '../actions'
import { BallotClient } from '../ballot-client'
import '../ballot.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Win-total ballot · PA Milk Society',
  description: 'Twelve managers, one win total each. Call them all and the room sets the lines.',
}

// Deliberately NOT under /league/[slug]: that layout redirects signed-out
// visitors to /login, and the whole point of this link is that eleven people
// can open it without an account. The token in the path is both the address
// and the authorization.
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
