import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { PAMS_ROSTER } from '@/lib/winBallot'
import { readBallotToken, submittedNames } from './actions'
import { BallotClient } from './ballot-client'
import './ballot.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Win-total ballot · PA Milk Society',
  description: 'Twelve managers, one win total each. Call them all and the room sets the lines.',
}

// The ballot is open to whoever holds the link: no account, no sign-in. The
// `k` token in the URL is the authorization, checked here for the render and
// again in the server action on submit.
export default async function BallotPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ k?: string }>
}) {
  const { slug } = await params
  const { k } = await searchParams

  const admin = createAdminClient()
  const { data: league } = await admin
    .from('leagues')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()

  const token = await readBallotToken(league.id)
  if (!token || !k || k !== token) {
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
                  The ballot is open by invitation only, and the link you followed
                  either expired or was never the current one.
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
