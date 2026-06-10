import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHubShelves, type HubShelfLeague } from '@/lib/hub/data'
import { Reveal } from '../bits'
import { AdEditor, BookmarkStar, DemoShelfCard, EmptyShelfHint, LeagueSearch } from './newsstand-client'

export const metadata = { title: 'The Clubhouse · The Newsstand' }

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

export default async function NewsstandPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()

  // The promotion board reads fresh (no unstable_cache) so a commissioner
  // who just listed their league sees it after the router refresh.
  type PromotedLeague = {
    id: string; name: string; slug: string; platform: string
    promo_text: string | null; promo_link: string | null
  }
  const promotedPromise: PromiseLike<PromotedLeague[]> = admin
    .from('leagues')
    .select('id, name, slug, platform, promo_text, promo_link')
    .not('published_at', 'is', null)
    .not('promoted_at', 'is', null)
    .order('promoted_at', { ascending: false })
    .limit(12)
    .then((r) => (r.data ?? []) as PromotedLeague[])

  const [shelves, promoted, ownPublished, bookmarks] = await Promise.all([
    getHubShelves(),
    promotedPromise,
    user
      ? supabase
          .from('leagues')
          .select('id, name, slug, published_at, promoted_at, promo_text, promo_link')
          .eq('owner_id', user.id)
          .eq('manager_view', false)
          .not('published_at', 'is', null)
          .order('created_at', { ascending: false })
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    (async () => {
      // Same two-step as the dashboard: bookmark ids via the user's own
      // RLS-readable rows, league details via the admin client (RLS hides
      // leagues the user doesn't own).
      if (!user) return [] as { id: string; name: string; slug: string; platform: string }[]
      const { data: rows } = await supabase
        .from('league_bookmarks')
        .select('league_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      const ids = (rows ?? []).map((r) => r.league_id as string)
      if (ids.length === 0) return []
      const { data: leagueRows } = await admin
        .from('leagues')
        .select('id, name, slug, platform')
        .in('id', ids)
        .not('published_at', 'is', null)
      const byId = new Map((leagueRows ?? []).map((l) => [l.id as string, l]))
      return ids
        .map((id) => byId.get(id))
        .filter((l): l is NonNullable<typeof l> => !!l) as { id: string; name: string; slug: string; platform: string }[]
    })(),
  ])

  // Bookmark + ownership state for the cached shelves (the shelf data is
  // global; the star state is per-viewer).
  const bookmarkedIds = new Set(bookmarks.map((l) => l.id))
  const ownIds = new Set(ownPublished.map((l) => l.id as string))
  const hasActiveListing = ownPublished.some((l) => l.promoted_at)

  let sectionNo = 0
  const nextNum = () => `§ 0${++sectionNo}`

  return (
    <main>
      <section className="hub-hero">
        <div className="hub-hero-sup">★ Wing VI · Out on the rack ★</div>
        <h1 className="hub-hero-title">
          The <em>Newsstand.</em>
        </h1>
        <p className="hub-hero-sub">
          Every published almanac on TSC, browsable. Find a friend&apos;s league, study how the
          good archives read, and bookmark the ones worth following.
        </p>
        <div className="hub-hero-meta">
          <span>{shelves.totalPublished} {shelves.totalPublished === 1 ? 'almanac' : 'almanacs'} on the rack</span>
          <span>·</span>
          <span>{bookmarks.length} on your shelf</span>
        </div>
      </section>

      {/* ─── Search ───────────────────────────────────────── */}
      <div className="hub-section" style={{ marginTop: '0.5rem' }}>
        <Reveal>
          <LeagueSearch signedIn={!!user} />
        </Reveal>
      </div>

      {/* ─── Most bookmarked ─────────────────────────────── */}
      {shelves.popular.length > 0 && (
        <div className="hub-section">
          <div className="hub-section-header">
            <span className="hub-section-num">{nextNum()} · Readers&apos; choice</span>
            <span className="hub-section-title">Most bookmarked —</span>
            <span className="hub-section-meta">As followed by members</span>
          </div>
          <Reveal>
            <div className="hub-shelf-grid">
              {shelves.popular.map((l) => (
                <ShelfCard key={l.id} l={l} bookmarked={bookmarkedIds.has(l.id)} own={ownIds.has(l.id)} guest={!user} />
              ))}
            </div>
          </Reveal>
        </div>
      )}

      {/* ─── On the market — promoted leagues only ────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">{nextNum()} · On the market</span>
          <span className="hub-section-title">Leagues promoting themselves —</span>
          <span className="hub-section-meta">{promoted.length} listed · Commissioner opt-in</span>
        </div>
        {promoted.length === 0 && !(ownPublished.length > 0 && !hasActiveListing) ? (
          <Reveal>
            <p
              style={{
                textAlign: 'center', maxWidth: '540px', margin: '0 auto',
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: '1.05rem', lineHeight: 1.6, color: 'var(--hb-mute)',
              }}
            >
              The board is empty — no league has taken out an ad yet. Commissioners can list
              theirs below: a pitch, a link, done.
            </p>
          </Reveal>
        ) : (
          <Reveal>
            <div className="hub-shelf-grid">
              {ownPublished.length > 0 && !hasActiveListing && (
                <a href="#promote" className="hub-shelf-card hub-ad-here">
                  <div className="hub-shelf-top"><span>Open slot</span></div>
                  <div className="hub-shelf-name">Your ad <em style={{ fontStyle: 'italic', color: 'var(--hb-gold)' }}>here.</em></div>
                  <p className="hub-promo-pitch" style={{ color: 'var(--hb-mute)' }}>
                    One free listing per account — pitch your league to every member who walks past.
                  </p>
                  <div className="hub-shelf-sub">Write your pitch below ↓</div>
                </a>
              )}
              {promoted.map((l) => (
                <div key={l.id} className="hub-shelf-card hub-promo-listing">
                  <div className="hub-shelf-top">
                    <span>{l.platform}</span>
                    <BookmarkStar
                      slug={l.slug}
                      initial={bookmarkedIds.has(l.id)}
                      disabled={ownIds.has(l.id) || !user}
                      title={!user ? 'Sign in to bookmark' : undefined}
                    />
                  </div>
                  <a href={`/leagues/${l.slug}/`} className="hub-shelf-name" style={{ textDecoration: 'none', color: 'var(--hb-ink)' }}>
                    {l.name}
                  </a>
                  {l.promo_text && <p className="hub-promo-pitch">“{l.promo_text}”</p>}
                  <div className="hub-promo-listing-actions">
                    <a href={`/leagues/${l.slug}/`} className="hub-result-open">Read the almanac →</a>
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
      </div>

      {/* ─── Your shelf ───────────────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">{nextNum()} · Your shelf</span>
          <span className="hub-section-title">Almanacs you follow —</span>
          <span className="hub-section-meta">{bookmarks.length} bookmarked</span>
        </div>
        {bookmarks.length === 0 ? (
          <Reveal>
            {/* The demo bookmark lives in localStorage, so the card and the
                empty hint sort themselves out client-side. */}
            <div className="hub-shelf-grid">
              <DemoShelfCard />
            </div>
            <EmptyShelfHint />
          </Reveal>
        ) : (
          <Reveal>
            <div className="hub-shelf-grid">
              <DemoShelfCard />
              {bookmarks.map((l) => (
                <a key={l.id} href={`/leagues/${l.slug}/`} className="hub-shelf-card">
                  <div className="hub-shelf-top">
                    <span>{l.platform}</span>
                  </div>
                  <div className="hub-shelf-name">{l.name}</div>
                  <div className="hub-shelf-sub">Bookmarked · open the almanac →</div>
                  <div style={{ position: 'absolute', top: '.85rem', right: '.85rem' }}>
                    <BookmarkStar slug={l.slug} initial={true} />
                  </div>
                </a>
              ))}
            </div>
          </Reveal>
        )}
      </div>

      {/* ─── Promote your league ──────────────────────────── */}
      <div className="hub-section" id="promote">
        <div className="hub-section-header">
          <span className="hub-section-num">{nextNum()} · Self-promotion</span>
          <span className="hub-section-title">Put yours on the rack —</span>
          <span className="hub-section-meta">One listing per account</span>
        </div>
        <Reveal>
          {ownPublished.length > 0 ? (
            <div className="hub-promote" style={{ display: 'block' }}>
              <div style={{ maxWidth: '640px' }}>
                <div className="hub-promote-title">Take out an <em>ad.</em></div>
                <p className="hub-promote-body">
                  List your league on the board above — a short pitch, plus an optional link
                  if you&apos;re recruiting managers (invite URL, Discord, an email). Listings
                  stay up until you take them down. <strong>One listing per account</strong> —
                  promoting a different league replaces your current ad.
                </p>
              </div>
              <div style={{ maxWidth: '560px', marginTop: '1.4rem' }}>
                <AdEditor
                  leagues={ownPublished.map((l) => ({
                    id: l.id as string,
                    name: l.name as string,
                    slug: l.slug as string,
                    promoted: !!l.promoted_at,
                    text: (l.promo_text as string | null) ?? '',
                    link: (l.promo_link as string | null) ?? '',
                  }))}
                />
              </div>
            </div>
          ) : (
            <div className="hub-promote">
              <div>
                <div className="hub-promote-title">
                  {user ? <>Your league isn&apos;t on the rack <em>yet.</em></> : <>Got a league worth <em>reading?</em></>}
                </div>
                <p className="hub-promote-body">
                  Publishing puts your almanac on the Newsstand, makes it bookmarkable by any
                  member, and enters your managers in the Hall of Records.
                  {user
                    ? ' It’s one switch on the league’s settings page.'
                    : ' Sign in, sync your league, flip the publish switch — then take out an ad right here.'}
                </p>
              </div>
              <div className="hub-promote-side">
                {user ? (
                  <>
                    <Link href="/dashboard" className="hub-btn">Publish from your library →</Link>
                    <Link href="/dashboard/new" className="hub-btn-ghost">Or start a new archive</Link>
                  </>
                ) : (
                  <>
                    <Link href="/login?mode=signup" className="hub-btn">Join the Chronicle →</Link>
                    <Link href="/login" className="hub-btn-ghost">Sign in</Link>
                  </>
                )}
              </div>
            </div>
          )}
        </Reveal>
      </div>
    </main>
  )
}
