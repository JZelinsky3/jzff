import Link from 'next/link'
import type { HubHall, HubRecord } from '@/lib/hub/data'
import { Reveal } from '../bits'
import { HallSplits } from '../records/hall-splits'

// Pocket Clubhouse — the Hall. The desktop plaque wall becomes one
// marquee plaque and a ledger of records: category and holder on the
// left, the number hung on the right, one record per row. The Split the
// Field lens drawer is the same client component; its plaque grid runs
// single-column inside the mhb scope.

function PlaqueRow({ r }: { r: HubRecord }) {
  return (
    <div className="mhb-plaque">
      <div className="mhb-plaque-cat">{r.title}</div>
      <div className="mhb-plaque-holder">
        {r.holder}
        {r.team ? <span style={{ fontStyle: 'italic', color: 'var(--hb-ink-soft)' }}> · “{r.team}”</span> : null}
      </div>
      <div className="mhb-plaque-meta">
        {r.leagueSlug ? <a href={`/leagues/${r.leagueSlug}/`}>{r.league}</a> : <span>{r.league}</span>}
        {' · '}{r.detail}
      </div>
      <div className="mhb-plaque-val">
        {r.value}
        {r.unit && <span className="unit">{r.unit}</span>}
      </div>
    </div>
  )
}

export function MobileHall({ hall }: { hall: HubHall }) {
  const [headline, ...rest] = hall.records

  return (
    <main className="mhb">
      <section className="mhb-hero">
        <div className="mhb-hero-sup">★ Wing IV · Velvet rope ★</div>
        <h1 className="mhb-hero-title">
          The <em>Hall.</em>
        </h1>
        <p className="mhb-hero-sub">
          The records that stand across every published almanac, with the names of the
          managers who set them.
        </p>
        <div className="mhb-hero-meta">
          <span>{hall.sourceLeagues} published {hall.sourceLeagues === 1 ? 'league' : 'leagues'}</span>
          <span>{hall.sourceSeasons.toLocaleString()} seasons</span>
          <span>{hall.records.length} records standing</span>
        </div>
      </section>

      {hall.records.length === 0 ? (
        <section className="mhb-sec">
          <Reveal>
            <div className="hub-promote">
              <div>
                <div className="hub-promote-title">The walls are <em>bare.</em></div>
                <p className="hub-promote-body">
                  Records only hang here once a league is published. Publish yours and your
                  managers go up first.
                </p>
              </div>
              <div className="hub-promote-side">
                <Link href="/dashboard" className="hub-btn">Publish a league</Link>
              </div>
            </div>
          </Reveal>
        </section>
      ) : (
        <>
          {headline && (
            <section className="mhb-sec">
              <div className="mhb-sec-head">
                <div>
                  <span className="mhb-sec-num">§ 01 · The marquee</span>
                  <span className="mhb-sec-title">The record of records</span>
                </div>
              </div>
              <Reveal>
                <div className="mhb-marqplaque">
                  <div className="mhb-marqplaque-cat">{headline.title}</div>
                  <div className="mhb-marqplaque-val">
                    {headline.value}
                    {headline.unit && <span className="unit">{headline.unit}</span>}
                  </div>
                  <div className="mhb-marqplaque-holder">{headline.holder}</div>
                  {headline.team && <div className="mhb-marqplaque-team">“{headline.team}”</div>}
                  <div className="mhb-marqplaque-meta">
                    {headline.leagueSlug ? (
                      <a href={`/leagues/${headline.leagueSlug}/`}>{headline.league}</a>
                    ) : (
                      <span>{headline.league}</span>
                    )}
                    <span>{headline.detail}</span>
                  </div>
                </div>
              </Reveal>
            </section>
          )}

          <section className="mhb-sec">
            <div className="mhb-sec-head">
              <div>
                <span className="mhb-sec-num">§ 02 · The wall</span>
                <span className="mhb-sec-title">Plaques in good standing</span>
              </div>
              <span className="mhb-sec-side">Until somebody takes them</span>
            </div>
            <div className="mhb-plaques">
              {rest.map((r, i) => (
                <Reveal key={r.id} delay={(i % 3) * 70}>
                  <PlaqueRow r={r} />
                </Reveal>
              ))}
            </div>
          </section>

          {hall.splits.length > 0 && (
            <section className="mhb-sec">
              <div className="mhb-sec-head">
                <div>
                  <span className="mhb-sec-num">§ 03 · Split the field</span>
                  <span className="mhb-sec-title">Records by setting</span>
                </div>
              </div>
              <Reveal>
                <HallSplits splits={hall.splits} />
              </Reveal>
            </section>
          )}

          <section className="mhb-sec">
            <p className="mhb-fine">
              Only published leagues are surveyed; private archives never put names on this
              wall. Season records need at least ten games, streaks count playoffs, and
              format splits are read from real lineups and each league&apos;s scoring profile.
              The wall re-counts itself every hour.
            </p>
          </section>
        </>
      )}
    </main>
  )
}
