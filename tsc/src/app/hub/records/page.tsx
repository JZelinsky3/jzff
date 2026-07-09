import Link from 'next/link'
import { getHubHall, type HubRecord } from '@/lib/hub/data'
import { getViewMode } from '@/lib/viewMode'
import { Reveal } from '../bits'
import { MobileHall } from '../mobile/hall'
import { HallSplits } from './hall-splits'

export const metadata = { title: 'The Clubhouse · The Hall' }

function Plaque({ r, banner = false, delay = 0 }: { r: HubRecord; banner?: boolean; delay?: number }) {
  return (
    <Reveal delay={delay} className={banner ? 'hub-plaque-banner-wrap' : undefined}>
      <div className={`hub-plaque${banner ? ' is-banner' : ''}`} style={{ height: '100%' }}>
        <div className="hub-plaque-cat">{r.title}</div>
        <div className="hub-plaque-value">
          {r.value}
          {r.unit && <span className="unit">{r.unit}</span>}
        </div>
        <div className="hub-plaque-holder">{r.holder}</div>
        {r.team && <div className="hub-plaque-team">“{r.team}”</div>}
        <div className="hub-plaque-meta">
          <span>
            {r.leagueSlug ? <a href={`/leagues/${r.leagueSlug}/`}>{r.league}</a> : r.league}
          </span>
          <span>{r.detail}</span>
        </div>
      </div>
    </Reveal>
  )
}

export default async function HallPage() {
  const hall = await getHubHall()

  if ((await getViewMode()) === 'mobile') return <MobileHall hall={hall} />

  const [headline, ...rest] = hall.records

  return (
    <main>
      <section className="hub-hero">
        <div className="hub-hero-sup">★ Wing IV · Velvet rope ★</div>
        <h1 className="hub-hero-title">
          The <em>Hall.</em>
        </h1>
        <p className="hub-hero-sub">
          The records that stand across every published almanac on TSC — with the names of
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
                  Records only hang here once a league is published — names stay private until a
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
          <div className="hub-section">
            <div className="hub-section-header">
              <span className="hub-section-num">§ 01 · The marquee</span>
              <span className="hub-section-title">The record of records —</span>
              <span className="hub-section-meta">Sitewide · All platforms</span>
            </div>
            {headline && (
              <div className="hub-plaque-grid">
                <Plaque r={headline} banner />
              </div>
            )}
          </div>

          <div className="hub-section">
            <div className="hub-section-header">
              <span className="hub-section-num">§ 02 · The wall</span>
              <span className="hub-section-title">Plaques in good standing —</span>
              <span className="hub-section-meta">Until somebody takes them</span>
            </div>
            <div className="hub-plaque-grid">
              {rest.map((r, i) => (
                <Plaque key={r.id} r={r} delay={(i % 3) * 90} />
              ))}
            </div>
          </div>

          {hall.splits.length > 0 && (
            <div className="hub-section">
              <div className="hub-section-header">
                <span className="hub-section-num">§ 03 · Split the field</span>
                <span className="hub-section-title">Records by setting —</span>
                <span className="hub-section-meta">So superflex never argues with 1-QB</span>
              </div>
              <Reveal>
                <HallSplits splits={hall.splits} />
              </Reveal>
            </div>
          )}

          <div className="hub-section">
            <p
              style={{
                maxWidth: '720px', margin: '0 auto', textAlign: 'center',
                fontSize: '.8rem', lineHeight: 1.6, color: 'var(--hb-mute)',
              }}
            >
              Only published leagues are surveyed — private archives never put names on this
              wall. Season records require at least ten games; streaks count playoffs and
              snap on a tie. Format and flex are read from real lineups (two QBs started in a
              week → superflex); scoring, passing TDs, and TE premium come from each league&apos;s
              scoring profile and Trade Desk settings — commissioners can correct those any
              time and the splits follow. The wall re-counts itself every hour.
            </p>
          </div>
        </>
      )}
    </main>
  )
}
