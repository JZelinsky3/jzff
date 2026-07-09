import Link from 'next/link'
import type { HubShelfLeague, HubShelves } from '@/lib/hub/data'
import { Reveal } from '../bits'
import { AdEditor, type AdLeague, BookmarkStar, DemoShelfCard, EmptyShelfHint, LeagueSearch } from '../explore/newsstand-client'

// Pocket Clubhouse — the Newsstand. Search leads (it's the reason a phone
// opens this wing), the readers'-choice shelf becomes a swipe rail, and
// the market + your shelf stack as single-column cards. Search, stars,
// and the ad editor are the same client components as desktop.

type PromotedLeague = {
  id: string
  name: string
  slug: string
  platform: string
  promo_text: string | null
  promo_link: string | null
}

type BookmarkedLeague = { id: string; name: string; slug: string; platform: string }

function yearsLabel(l: { firstYear: number | null; latestYear: number | null }) {
  if (!l.firstYear) return null
  return l.firstYear === l.latestYear ? String(l.firstYear) : `${l.firstYear}–${l.latestYear}`
}

function ShelfCard({ l, bookmarked, own, guest }: { l: HubShelfLeague; bookmarked: boolean; own: boolean; guest: boolean }) {
  const years = yearsLabel(l)
  return (
    <a href={`/leagues/${l.slug}/`} className="hub-shelf-card">
      <div className="hub-shelf-top">
        <span>{l.platform}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.6rem' }}>
          {l.bookmarks > 0 && (
            <span className="hub-shelf-bm" title={`${l.bookmarks} ${l.bookmarks === 1 ? 'reader follows' : 'readers follow'} this almanac`}>
              ★ {l.bookmarks}
            </span>
          )}
          <BookmarkStar
            slug={l.slug}
            initial={bookmarked}
            disabled={own || guest}
            title={guest ? 'Sign in to bookmark' : undefined}
          />
        </span>
      </div>
      <div className="hub-shelf-name">{l.name}</div>
      <div className="hub-shelf-sub">
        {l.seasons > 0 ? `${l.seasons} ${l.seasons === 1 ? 'season' : 'seasons'}` : 'New archive'}
        {years ? ` · ${years}` : ''}
        {own ? ' · yours' : ''}
      </div>
    </a>
  )
}

export function MobileNewsstand({
  signedIn,
  shelves,
  promoted,
  adLeagues,
  hasActiveListing,
  bookmarks,
  bookmarkedIds,
  ownIds,
}: {
  signedIn: boolean
  shelves: HubShelves
  promoted: PromotedLeague[]
  adLeagues: AdLeague[]
  hasActiveListing: boolean
  bookmarks: BookmarkedLeague[]
  bookmarkedIds: Set<string>
  ownIds: Set<string>
}) {
  let sectionNo = 0
  const nextNum = () => `§ 0${++sectionNo}`

  return (
    <main className="mhb">
      <section className="mhb-hero">
        <div className="mhb-hero-sup">★ Wing VI · Out on the rack ★</div>
        <h1 className="mhb-hero-title">
          The <em>Newsstand.</em>
        </h1>
        <p className="mhb-hero-sub">
          Every published almanac on TSC. Find a friend&apos;s league and bookmark the ones
          worth following.
        </p>
        <div className="mhb-hero-meta">
          <span>{shelves.totalPublished} on the rack</span>
          <span>{bookmarks.length} on your shelf</span>
        </div>
      </section>

      {/* ── Search ── */}
      <section className="mhb-sec" style={{ marginTop: '.4rem' }}>
        <Reveal>
          <LeagueSearch signedIn={signedIn} />
        </Reveal>
      </section>

      {/* ── Most bookmarked ── */}
      {shelves.popular.length > 0 && (
        <section className="mhb-sec">
          <div className="mhb-sec-head">
            <div>
              <span className="mhb-sec-num">{nextNum()} · Readers&apos; choice</span>
              <span className="mhb-sec-title">Most bookmarked</span>
            </div>
            <span className="mhb-swipe" aria-hidden>
              Swipe
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <polyline points="9 5 16 12 9 19" />
              </svg>
            </span>
          </div>
          <Reveal>
            <div className="mhb-rail">
              {shelves.popular.map((l) => (
                <ShelfCard key={l.id} l={l} bookmarked={bookmarkedIds.has(l.id)} own={ownIds.has(l.id)} guest={!signedIn} />
              ))}
            </div>
          </Reveal>
        </section>
      )}

      {/* ── On the market ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">{nextNum()} · On the market</span>
            <span className="mhb-sec-title">Leagues promoting themselves</span>
          </div>
          <span className="mhb-sec-side">{promoted.length} listed</span>
        </div>
        {promoted.length === 0 && !(adLeagues.length > 0 && !hasActiveListing) ? (
          <Reveal>
            <p className="mhb-fine" style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '.92rem', textAlign: 'center' }}>
              The board is empty. Commissioners can list theirs below: a pitch, a link, done.
            </p>
          </Reveal>
        ) : (
          <Reveal>
            <div className="mhb-feed">
              {adLeagues.length > 0 && !hasActiveListing && (
                <a href="#promote" className="hub-shelf-card hub-ad-here">
                  <div className="hub-shelf-top"><span>Open slot</span></div>
                  <div className="hub-shelf-name">Your ad <em style={{ fontStyle: 'italic', color: 'var(--hb-gold)' }}>here.</em></div>
                  <p className="hub-promo-pitch" style={{ color: 'var(--hb-mute)' }}>
                    One free listing per account. Write your pitch below.
                  </p>
                </a>
              )}
              {promoted.map((l) => (
                <div key={l.id} className="hub-shelf-card hub-promo-listing">
                  <div className="hub-shelf-top">
                    <span>{l.platform}</span>
                    <BookmarkStar
                      slug={l.slug}
                      initial={bookmarkedIds.has(l.id)}
                      disabled={ownIds.has(l.id) || !signedIn}
                      title={!signedIn ? 'Sign in to bookmark' : undefined}
                    />
                  </div>
                  <a href={`/leagues/${l.slug}/`} className="hub-shelf-name" style={{ textDecoration: 'none', color: 'var(--hb-ink)' }}>
                    {l.name}
                  </a>
                  {l.promo_text && <p className="hub-promo-pitch">“{l.promo_text}”</p>}
                  <div className="hub-promo-listing-actions">
                    <a href={`/leagues/${l.slug}/`} className="hub-result-open">Read the almanac</a>
                    {l.promo_link && (
                      <a
                        href={l.promo_link}
                        target="_blank"
                        rel="noopener nofollow"
                        className="hub-result-open"
                        style={{ color: 'var(--hb-rust)' }}
                      >
                        Inquire ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        )}
      </section>

      {/* ── Your shelf ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">{nextNum()} · Your shelf</span>
            <span className="mhb-sec-title">Almanacs you follow</span>
          </div>
          <span className="mhb-sec-side">{bookmarks.length} bookmarked</span>
        </div>
        {bookmarks.length === 0 ? (
          <Reveal>
            <div className="mhb-feed">
              <DemoShelfCard />
            </div>
            <EmptyShelfHint />
          </Reveal>
        ) : (
          <Reveal>
            <div className="mhb-feed">
              <DemoShelfCard />
              {bookmarks.map((l) => (
                <a key={l.id} href={`/leagues/${l.slug}/`} className="hub-shelf-card">
                  <div className="hub-shelf-top">
                    <span>{l.platform}</span>
                  </div>
                  <div className="hub-shelf-name">{l.name}</div>
                  <div className="hub-shelf-sub">Bookmarked · open the almanac</div>
                  <div style={{ position: 'absolute', top: '.85rem', right: '.85rem' }}>
                    <BookmarkStar slug={l.slug} initial={true} />
                  </div>
                </a>
              ))}
            </div>
          </Reveal>
        )}
      </section>

      {/* ── Promote your league ── */}
      <section className="mhb-sec" id="promote">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">{nextNum()} · Self-promotion</span>
            <span className="mhb-sec-title">Put yours on the rack</span>
          </div>
        </div>
        <Reveal>
          {adLeagues.length > 0 ? (
            <div className="hub-promote" style={{ display: 'block' }}>
              <div>
                <div className="hub-promote-title">Take out an <em>ad.</em></div>
                <p className="hub-promote-body">
                  A short pitch, plus an optional link if you&apos;re recruiting managers.
                  One listing per account; promoting a different league replaces it.
                </p>
              </div>
              <div style={{ marginTop: '1.1rem' }}>
                <AdEditor leagues={adLeagues} />
              </div>
            </div>
          ) : (
            <div className="hub-promote">
              <div>
                <div className="hub-promote-title">
                  {signedIn ? <>Your league isn&apos;t on the rack <em>yet.</em></> : <>Got a league worth <em>reading?</em></>}
                </div>
                <p className="hub-promote-body">
                  Publishing puts your almanac on the Newsstand and enters your managers in
                  the Hall of Records.
                  {signedIn
                    ? ' It’s one switch on the league’s settings page.'
                    : ' Sign in, sync your league, flip the publish switch.'}
                </p>
              </div>
              <div className="hub-promote-side">
                {signedIn ? (
                  <>
                    <Link href="/dashboard" className="hub-btn">Publish from your library</Link>
                    <Link href="/dashboard/new" className="hub-btn-ghost">Or start a new archive</Link>
                  </>
                ) : (
                  <>
                    <Link href="/login?mode=signup&from=%2Fhub%2Fexplore" className="hub-btn">Join the Chronicle</Link>
                    <Link href="/login?from=%2Fhub%2Fexplore" className="hub-btn-ghost">Sign in</Link>
                  </>
                )}
              </div>
            </div>
          )}
        </Reveal>
      </section>
    </main>
  )
}
