import Link from 'next/link'
import type { HubCensus } from '@/lib/hub/data'
import { CountUp, Reveal } from '../bits'
import { DISPATCH } from '../dispatch-content'

// Pocket Clubhouse — Front Desk. Not the desktop overview shrunk: the
// wire becomes a thumb-swipe rail of counters, the five wings become an
// app-style door list (the dock's big siblings), and the shelf stays a
// ledger. Copy runs shorter than desktop on purpose.

type OwnLeague = {
  id: string
  name: string
  slug: string
  platform: string
  published_at: string | null
  last_synced_at: string | null
}

const DOORS: { href: string; num: string; name: string; nameEm: string; desc: string }[] = [
  { href: '/hub/whats-new', num: 'II', name: 'The', nameEm: 'Dispatch.', desc: 'The changelog, written like news.' },
  { href: '/hub/numbers', num: 'III', name: 'The', nameEm: 'Census.', desc: 'The whole network in numbers.' },
  { href: '/hub/records', num: 'IV', name: 'The', nameEm: 'Hall.', desc: 'Sitewide records, names on the plaques.' },
  { href: '/hub/analyzer', num: 'V', name: 'The Trade', nameEm: 'Room.', desc: 'Trade verdicts, no league required.' },
  { href: '/hub/explore', num: 'VI', name: 'The', nameEm: 'Newsstand.', desc: 'Every public almanac on the rack.' },
]

export function MobileFrontDesk({
  signedIn,
  firstName,
  memberSince,
  census,
  ownLeagues,
  bookmarkCount,
}: {
  signedIn: boolean
  firstName: string
  memberSince: string | null
  census: HubCensus
  ownLeagues: OwnLeague[]
  bookmarkCount: number
}) {
  const wire = DISPATCH.slice(0, 2)

  return (
    <main className="mhb">
      {/* ── Greeting ── */}
      <section className="mhb-hero">
        <div className="mhb-hero-sup">★ The Clubhouse · Est. 2026 ★</div>
        <h1 className="mhb-hero-title">
          {signedIn ? (
            <>Welcome back, <em>{firstName}.</em></>
          ) : (
            <>Step inside, <em>stranger.</em></>
          )}
        </h1>
        <p className="mhb-hero-sub">
          The room behind the archives. The wire, the wings, and what just shipped.
        </p>
        <div className="mhb-hero-meta">
          {signedIn ? (
            <>
              {memberSince && <span>Member since {memberSince}</span>}
              <span>{ownLeagues.length > 0 ? `${ownLeagues.length}+ ${ownLeagues.length === 1 ? 'league' : 'leagues'}` : 'No leagues yet'}</span>
              <span>{bookmarkCount} bookmarked</span>
            </>
          ) : (
            <>
              <span>Viewing as a guest</span>
              <Link href="/login?from=%2Fhub">Sign in</Link>
            </>
          )}
        </div>
      </section>

      {/* ── §01 The wire ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">§ 01 · The wire</span>
            <span className="mhb-sec-title">Across every league</span>
          </div>
          <span className="mhb-swipe" aria-hidden>
            Swipe
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <polyline points="9 5 16 12 9 19" />
            </svg>
          </span>
        </div>
        <div className="mhb-rail">
          <div className="mhb-stat-card">
            <div className="mhb-stat-card-lbl">Fantasy points scored</div>
            <div className="mhb-stat-card-val"><CountUp value={Math.round(census.totalPoints)} /></div>
            <div className="mhb-stat-card-det">Every point, every season, every synced league.</div>
          </div>
          <div className="mhb-stat-card">
            <div className="mhb-stat-card-lbl">Games decided</div>
            <div className="mhb-stat-card-val"><CountUp value={census.games} /></div>
            <div className="mhb-stat-card-det">
              Including <strong>{census.playoffGames.toLocaleString()}</strong> playoff games.
            </div>
          </div>
          <div className="mhb-stat-card">
            <div className="mhb-stat-card-lbl">Draft picks on record</div>
            <div className="mhb-stat-card-val"><CountUp value={census.draftPicks} /></div>
            <div className="mhb-stat-card-det">Steals, busts, and the reaches.</div>
          </div>
          <div className="mhb-stat-card">
            <div className="mhb-stat-card-lbl">Wins banked</div>
            <div className="mhb-stat-card-val"><CountUp value={census.totalWins} /></div>
            <div className="mhb-stat-card-det">
              And <strong>{census.championships.toLocaleString()}</strong> championships decided.
            </div>
          </div>
        </div>
        <div className="mhb-btnrow">
          <Link href="/hub/numbers" className="hub-btn-ghost">Full census</Link>
        </div>
      </section>

      {/* ── §02 The rooms ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">§ 02 · The rooms</span>
            <span className="mhb-sec-title">Pick a door</span>
          </div>
          <span className="mhb-sec-side">Five wings</span>
        </div>
        <Reveal>
          <nav className="mhb-doors" aria-label="Clubhouse wings">
            {DOORS.map((d) => (
              <Link key={d.href} href={d.href} className="mhb-door">
                <span className="mhb-door-num" aria-hidden>{d.num}</span>
                <span>
                  <span className="mhb-door-name">{d.name} <em>{d.nameEm}</em></span>
                  <div className="mhb-door-desc">{d.desc}</div>
                </span>
                <span className="mhb-door-arrow" aria-hidden>
                  <svg width="9" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 1 7 7 1 13" />
                  </svg>
                </span>
              </Link>
            ))}
          </nav>
        </Reveal>
      </section>

      {/* ── §03 Fresh ink ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">§ 03 · Fresh ink</span>
            <span className="mhb-sec-title">Latest from the press</span>
          </div>
          <Link href="/hub/whats-new" className="mhb-sec-side">All entries</Link>
        </div>
        <div className="mhb-feed">
          {wire.map((e) => (
            <Reveal key={e.id}>
              <article className="mhb-entry">
                <div className="mhb-entry-date">{e.date}</div>
                <h3 className="mhb-entry-title">
                  {e.title} {e.titleEm && <em>{e.titleEm}</em>}
                </h3>
                <p className="mhb-entry-body" dangerouslySetInnerHTML={{ __html: e.body }} />
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── §04 Your shelf ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">§ 04 · Your shelf</span>
            <span className="mhb-sec-title">Where you left off</span>
          </div>
        </div>
        {ownLeagues.length === 0 ? (
          <Reveal>
            <div className="hub-promote">
              <div>
                <div className="hub-promote-title">
                  {signedIn ? <>No archives <em>yet.</em></> : <>Pull up a <em>chair.</em></>}
                </div>
                <p className="hub-promote-body">
                  Every league you sync joins the census, and your managers start chasing the Hall.
                  {!signedIn && ' The first league is free.'}
                </p>
              </div>
              <div className="hub-promote-side">
                {signedIn ? (
                  <Link href="/dashboard/new" className="hub-btn">Start your first archive</Link>
                ) : (
                  <Link href="/login?mode=signup&from=%2Fhub" className="hub-btn">Join the Chronicle</Link>
                )}
                <Link href="/demo/" target="_blank" rel="noopener" className="hub-btn-ghost">Tour the demo</Link>
              </div>
            </div>
          </Reveal>
        ) : (
          <Reveal>
            <div className="hub-ledger">
              {ownLeagues.map((l, i) => (
                <Link key={l.id} href={`/league/${l.slug}`} className="hub-ledger-row">
                  <span className="hub-ledger-rank">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <span className="hub-ledger-name">{l.name}</span>
                    <div className="hub-ledger-sub">
                      {l.platform} · {l.published_at ? 'Published' : l.last_synced_at ? 'Synced' : 'Not synced yet'}
                    </div>
                  </span>
                  <span className="hub-ledger-val">Open</span>
                </Link>
              ))}
            </div>
            <div className="mhb-btnrow">
              <Link href="/dashboard" className="hub-btn-ghost">Full library</Link>
              <Link href="/hub/explore" className="hub-btn-ghost">Your bookmarks ({bookmarkCount})</Link>
            </div>
          </Reveal>
        )}
      </section>
    </main>
  )
}
