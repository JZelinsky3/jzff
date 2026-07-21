import Link from 'next/link'
import { getHubHall } from '@/lib/hub/data'
import { getViewMode } from '@/lib/viewMode'
import { Reveal } from '../bits'
import { MobileHall } from '../mobile/hall'
import { HallBoard } from './hall-board'

export const metadata = { title: 'The Clubhouse · The Hall' }

export default async function HallPage() {
  const hall = await getHubHall()

  if ((await getViewMode()) === 'mobile') return <MobileHall hall={hall} />

  return (
    <main>
      <section className="hub-hero">
        <div className="hub-hero-sup">★ Wing IV · Velvet rope ★</div>
        <h1 className="hub-hero-title">
          The <em>Hall.</em>
        </h1>
        <p className="hub-hero-sub">
          The records that stand across every published almanac on TSC, with the names of
          the managers who set them. Sync your seasons, publish your league, and come take
          a plaque off somebody.
        </p>
        <div className="hub-hero-meta">
          <span>{hall.sourceLeagues} published {hall.sourceLeagues === 1 ? 'league' : 'leagues'}</span>
          <span>·</span>
          <span>{hall.sourceSeasons.toLocaleString()} seasons surveyed</span>
          <span>·</span>
          <span>{hall.records.length} records standing</span>
        </div>
      </section>

      {hall.records.length === 0 ? (
        <div className="hub-section">
          <Reveal>
            <div className="hub-promote">
              <div>
                <div className="hub-promote-title">The walls are <em>bare.</em></div>
                <p className="hub-promote-body">
                  Records only hang here once a league is published. Names stay private until a
                  commissioner opens the almanac. Publish yours and your managers go up first.
                </p>
              </div>
              <div className="hub-promote-side">
                <Link href="/dashboard" className="hub-btn">Publish a league →</Link>
              </div>
            </div>
          </Reveal>
        </div>
      ) : (
        <>
          <HallBoard candidates={hall.candidates} />

          <div className="hub-section">
            <p
              style={{
                maxWidth: '720px', margin: '0 auto', textAlign: 'center',
                fontSize: '.8rem', lineHeight: 1.6, color: 'var(--hb-mute)',
              }}
            >
              Only published leagues are surveyed. Private archives never put names on this
              wall. Season records require at least ten games; streaks count playoffs and
              snap on a tie. Format and flex are read from real lineups (two QBs started in a
              week → superflex); scoring, passing TDs, and TE premium come from each league&apos;s
              scoring profile and Trade Desk settings, and the filters read from those.
              Adjusted scales each points record by its own league&apos;s average so scoring
              systems compare fairly. The wall re-counts itself every hour.
            </p>
          </div>
        </>
      )}
    </main>
  )
}
