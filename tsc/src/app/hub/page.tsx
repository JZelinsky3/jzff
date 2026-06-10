import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHubCensus } from '@/lib/hub/data'
import { CountUp, Reveal } from './bits'
import { DISPATCH } from './dispatch-content'

export const metadata = { title: 'The Clubhouse · Front Desk' }

export default async function HubFrontDesk() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Greeting name: profile display name's first word. The signup trigger
  // defaults display_name to the full email, so anything from the @ on is
  // chopped — "jzffgames@gmail.com" greets as "jzffgames", never the
  // whole address.
  let firstName = 'Manager'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()
    const raw = (profile?.display_name || user.email || '').split('@')[0].trim()
    if (raw) firstName = raw.split(/\s+/)[0]
  }
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null

  const [census, ownLeagues, bookmarkCount] = await Promise.all([
    getHubCensus(),
    user
      ? supabase
          .from('leagues')
          .select('id, name, slug, platform, published_at, last_synced_at')
          .eq('owner_id', user.id)
          .eq('manager_view', false)
          .order('created_at', { ascending: false })
          .limit(4)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    user
      ? supabase
          .from('league_bookmarks')
          .select('league_id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ])

  const wire = DISPATCH.slice(0, 3)

  return (
    <main>
      {/* ─── Hero ─────────────────────────────────────────── */}
      <section className="hub-hero">
        <div className="hub-hero-sup">★ The Clubhouse · Est. 2026 ★</div>
        <h1 className="hub-hero-title">
          {user ? <>Welcome back, <em>{firstName}.</em></> : <>Step inside, <em>stranger.</em></>}
        </h1>
        <p className="hub-hero-sub">
          This is the Clubhouse — the room behind the archives. What&apos;s new on the press,
          what the whole network is putting up, who holds the records, and which almanacs
          are worth a read.
        </p>
        <div className="hub-hero-meta">
          {user ? (
            <>
              {memberSince && <span>Member since {memberSince}</span>}
              <span>·</span>
              <span>{ownLeagues.length > 0 ? `${ownLeagues.length}+ league${ownLeagues.length === 1 ? '' : 's'} on file` : 'No leagues yet'}</span>
              <span>·</span>
              <span>{bookmarkCount} bookmarked</span>
            </>
          ) : (
            <>
              <span>Viewing as a guest</span>
              <span>·</span>
              <Link href="/login" style={{ color: 'var(--hb-gold)', textDecoration: 'none' }}>
                Sign in to shelve your leagues →
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ─── §01 The wire — network pulse ─────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 01 · The wire</span>
          <span className="hub-section-title">Across every league we keep —</span>
          <span className="hub-section-meta">Updated hourly</span>
        </div>
        <Reveal>
          <div className="hub-stat-grid">
            <div className="hub-stat">
              <div className="hub-stat-label">Fantasy points scored</div>
              <div className="hub-stat-value"><CountUp value={Math.round(census.totalPoints)} /></div>
              <div className="hub-stat-detail">Every point, every season, every synced league combined.</div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Games decided</div>
              <div className="hub-stat-value"><CountUp value={census.games} /></div>
              <div className="hub-stat-detail">
                Including <strong>{census.playoffGames.toLocaleString()}</strong> playoff games.
              </div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Draft picks on record</div>
              <div className="hub-stat-value"><CountUp value={census.draftPicks} /></div>
              <div className="hub-stat-detail">Steals, busts, and the reaches we don&apos;t talk about.</div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Wins banked</div>
              <div className="hub-stat-value"><CountUp value={census.totalWins} /></div>
              <div className="hub-stat-detail">
                And <strong>{census.championships.toLocaleString()}</strong> championships decided.
              </div>
            </div>
          </div>
        </Reveal>
        <div style={{ textAlign: 'center', marginTop: '1.4rem' }}>
          <Link href="/hub/numbers" className="hub-btn-ghost">Full census →</Link>
        </div>
      </div>

      {/* ─── §02 The rooms ─────────────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 02 · The rooms</span>
          <span className="hub-section-title">Pick a door —</span>
          <span className="hub-section-meta">Five wings, one clubhouse</span>
        </div>
        <div className="hub-card-grid hub-doors">
          <Reveal delay={0}>
            <Link href="/hub/whats-new" className="hub-card" style={{ height: '100%' }}>
              <div className="hub-card-corner">Wing II</div>
              <div className="hub-card-roman">II</div>
              <div className="hub-card-title">The <em>Dispatch.</em></div>
              <div className="hub-card-desc">
                What just shipped, what&apos;s on the press, and what&apos;s coming down the wire.
                The full changelog, written like news.
              </div>
              <div className="hub-card-cta">Read the dispatch <span className="hub-card-arrow">→</span></div>
            </Link>
          </Reveal>
          <Reveal delay={90}>
            <Link href="/hub/numbers" className="hub-card" style={{ height: '100%' }}>
              <div className="hub-card-corner">Wing III</div>
              <div className="hub-card-roman">III</div>
              <div className="hub-card-title">The <em>Census.</em></div>
              <div className="hub-card-desc">
                The whole network in numbers — points, picks, trades, blowouts — plus the
                Network DNA: one archetype distilled from every synced league.
              </div>
              <div className="hub-card-cta">Count everything <span className="hub-card-arrow">→</span></div>
            </Link>
          </Reveal>
          <Reveal delay={180}>
            <Link href="/hub/records" className="hub-card" style={{ height: '100%' }}>
              <div className="hub-card-corner">Wing IV</div>
              <div className="hub-card-roman">IV</div>
              <div className="hub-card-title">The <em>Hall.</em></div>
              <div className="hub-card-desc">
                Site-wide records with names on the plaques. Highest week, biggest blowout,
                longest streak — held by real managers in real leagues.
              </div>
              <div className="hub-card-cta">Walk the hall <span className="hub-card-arrow">→</span></div>
            </Link>
          </Reveal>
          <Reveal delay={270}>
            <Link href="/hub/analyzer" className="hub-card" style={{ height: '100%' }}>
              <div className="hub-card-corner">Wing V</div>
              <div className="hub-card-roman">V</div>
              <div className="hub-card-title">The Trade <em>Room.</em></div>
              <div className="hub-card-desc">
                The Trade Analyzer with no league required — name the players, pick the
                format, get a verdict. Post deals to the board and let the room vote.
              </div>
              <div className="hub-card-cta">Take a seat <span className="hub-card-arrow">→</span></div>
            </Link>
          </Reveal>
          <Reveal delay={360}>
            <Link href="/hub/explore" className="hub-card" style={{ height: '100%' }}>
              <div className="hub-card-corner">Wing VI</div>
              <div className="hub-card-roman">VI</div>
              <div className="hub-card-title">The <em>Newsstand.</em></div>
              <div className="hub-card-desc">
                Browse the public almanacs. Search any league, see what&apos;s most bookmarked,
                and put your own league on the rack.
              </div>
              <div className="hub-card-cta">Browse the rack <span className="hub-card-arrow">→</span></div>
            </Link>
          </Reveal>
        </div>
      </div>

      {/* ─── §03 From the dispatch ─────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 03 · Fresh ink</span>
          <span className="hub-section-title">Latest from the press —</span>
          <Link href="/hub/whats-new" className="hub-section-meta" style={{ textDecoration: 'none', color: 'var(--hb-gold)' }}>
            All entries →
          </Link>
        </div>
        <div className="hub-dispatch">
          {wire.map((e) => (
            <Reveal key={e.id}>
              <article className="hub-entry">
                <div className="hub-entry-date">{e.date}</div>
                <div className="hub-entry-dot" />
                <div>
                  <h3 className="hub-entry-title">
                    {e.title} {e.titleEm && <em>{e.titleEm}</em>}
                  </h3>
                  <p className="hub-entry-body">{e.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>

      {/* ─── §04 Your shelf ────────────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 04 · Your shelf</span>
          <span className="hub-section-title">Where you left off —</span>
          <span className="hub-section-meta">Quick exits</span>
        </div>
        {ownLeagues.length === 0 ? (
          <Reveal>
            <div className="hub-promote">
              <div>
                <div className="hub-promote-title">
                  {user ? <>No archives <em>yet.</em></> : <>Pull up a <em>chair.</em></>}
                </div>
                <p className="hub-promote-body">
                  The Clubhouse is better with your league in it — every game you sync joins
                  the census, and your managers start chasing the Hall.
                  {!user && ' Signing in takes a few seconds; the first league is free.'}
                </p>
              </div>
              <div className="hub-promote-side">
                {user ? (
                  <Link href="/dashboard/new" className="hub-btn">Start your first archive →</Link>
                ) : (
                  <Link href="/login?mode=signup" className="hub-btn">Join the Chronicle →</Link>
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
                      {l.platform} · {l.published_at ? 'Published' : l.last_synced_at ? 'Synced, unpublished' : 'Not synced yet'}
                    </div>
                  </span>
                  <span className="hub-ledger-val">Open →</span>
                </Link>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '.8rem', justifyContent: 'center', marginTop: '1.4rem', flexWrap: 'wrap' }}>
              <Link href="/dashboard" className="hub-btn-ghost">Full library →</Link>
              <Link href="/hub/explore" className="hub-btn-ghost">Your bookmarks ({bookmarkCount}) →</Link>
              <Link href="/guides" className="hub-btn-ghost">Guides &amp; how-tos →</Link>
            </div>
          </Reveal>
        )}
      </div>
    </main>
  )
}
