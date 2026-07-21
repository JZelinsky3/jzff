import Link from 'next/link'
import { LeagueCardMenu } from '@/app/dashboard/league-card-menu'

type League = {
  id: string
  name: string
  slug: string
  platform: string
  last_synced_at: string | null
  published_at: string | null
  created_at: string
  grace_period_ends_at: string | null
}

type BookmarkedLeague = {
  id: string
  name: string
  slug: string
  platform: string
  published_at: string | null
}

export function MobileLibrary({
  leagues,
  bookmarks,
  isUDFA,
  earliestOwnedLeagueId,
  comp,
  subActive,
  subTierName,
  tier1Limit,
  showDemoCard,
}: {
  leagues: League[]
  bookmarks: BookmarkedLeague[]
  isUDFA: boolean
  earliestOwnedLeagueId: string | null
  comp: boolean
  subActive: boolean
  subTierName: string | null
  tier1Limit: number
  showDemoCard: boolean
}) {
  const hasLeagues = leagues.length > 0
  const latestSyncedAt = leagues
    .map((l) => l.last_synced_at)
    .filter((d): d is string => !!d)
    .sort()
    .pop()

  return (
    <main className="mlib">
      {/* ── Sticky top bar ── */}
      <header className="mlib-bar">
        <span className="mlib-bar-title">Your <em>Library.</em></span>
        <Link href="/dashboard/new" className="mlib-bar-add" aria-label="Add new league">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </Link>
      </header>

      {/* ── Status strip ── */}
      <div className="mlib-status">
        <div className="mlib-status-row">
          <span className="mlib-stat">
            <span className="mlib-stat-val">{leagues.length}</span>
            <span className="mlib-stat-label">{leagues.length === 1 ? 'League' : 'Leagues'}</span>
          </span>
          {bookmarks.length > 0 && (
            <span className="mlib-stat">
              <span className="mlib-stat-val">{bookmarks.length}</span>
              <span className="mlib-stat-label">Bookmarked</span>
            </span>
          )}
          {latestSyncedAt && (
            <span className="mlib-stat">
              <span className="mlib-stat-val">
                {new Date(latestSyncedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              <span className="mlib-stat-label">Last sync</span>
            </span>
          )}
        </div>
        {/* Tier pill */}
        <div className="mlib-tier">
          {comp ? (
            <><span className="mlib-tier-icon">★</span> Comp</>
          ) : subActive ? (
            <>{subTierName}</>
          ) : isUDFA ? (
            <><span className="mlib-tier-icon">★</span> UDFA · {tier1Limit} free</>
          ) : null}
        </div>
      </div>

      {/* ── UDFA explainer ── */}
      {isUDFA && (
        <div className="mlib-udfa">
          <div className="mlib-udfa-head">
            <span className="mlib-udfa-icon">★</span>
            <span>First league is a free trial with every feature unlocked.</span>
          </div>
          <div className="mlib-udfa-foot">
            <span>Testing ends <strong>Jul 20, 2026</strong></span>
            <Link href="/pricing" className="mlib-udfa-link">Plans</Link>
          </div>
        </div>
      )}

      {/* ── Quick actions ── */}
      <div className="mlib-actions">
        <Link href="/account" className="mlib-action">
          <span className="mlib-action-icon">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="5.5" r="3" />
              <path d="M2.5 14.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
            </svg>
          </span>
          <span>Account</span>
        </Link>
        <Link href="/hub" className="mlib-action">
          <span className="mlib-action-icon">★</span>
          <span>Clubhouse</span>
        </Link>
        <Link href="/dashboard/new" className="mlib-action">
          <span className="mlib-action-icon">+</span>
          <span>New archive</span>
        </Link>
      </div>

      {/* ── League list ── */}
      {!hasLeagues ? (
        <div className="mlib-empty">
          <div className="mlib-empty-title">No archives yet</div>
          <div className="mlib-empty-desc">
            Pick a platform, paste your league ID, and we walk the history.
          </div>
          <Link href="/dashboard/new" className="dc-btn dc-btn-block">Start your first archive</Link>
        </div>
      ) : (
        <div className="mlib-list">
          <div className="mlib-list-head">
            <span>Your leagues</span>
            <span className="mlib-list-count">{leagues.length}</span>
          </div>
          {leagues.map((l) => {
            const isTrial = isUDFA && l.id === earliestOwnedLeagueId
            const isUdfaLimited = isUDFA && l.id !== earliestOwnedLeagueId
            return (
              <div key={l.id} className="mlib-league">
                <Link href={`/league/${l.slug}`} className="mlib-league-link">
                  <div className="mlib-league-left">
                    <span className="mlib-league-initial">{l.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="mlib-league-body">
                    <div className="mlib-league-name">{l.name}</div>
                    <div className="mlib-league-meta">
                      <span className="mlib-league-plat">{l.platform}</span>
                      {l.last_synced_at ? (
                        <span>Synced {new Date(l.last_synced_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      ) : (
                        <span>Not synced</span>
                      )}
                    </div>
                    {(isTrial || isUdfaLimited) && (
                      <div className={`mlib-league-tier ${isTrial ? 'trial' : 'limited'}`}>
                        ★ {isTrial ? 'Trial · Full access' : 'UDFA · Limited'}
                      </div>
                    )}
                    {l.grace_period_ends_at && (
                      <div className="mlib-league-grace">
                        Deletes {new Date(l.grace_period_ends_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>
                  <div className="mlib-league-arrow">
                    <svg viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 1 7 7 1 13" />
                    </svg>
                  </div>
                </Link>
                <div className="mlib-league-foot">
                  <Link href={`/league/${l.slug}`} className="mlib-league-btn">Setup</Link>
                  {l.published_at && (
                    <a href={`/leagues/${l.slug}/`} target="_blank" rel="noopener" className="mlib-league-btn">
                      Archive
                    </a>
                  )}
                  <LeagueCardMenu leagueId={l.id} leagueName={l.name} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Bookmarks ── */}
      {bookmarks.length > 0 && (
        <div className="mlib-list">
          <div className="mlib-list-head">
            <span>Bookmarked</span>
            <span className="mlib-list-count">{bookmarks.length}</span>
          </div>
          {bookmarks.map((l) => (
            <a key={l.id} href={`/leagues/${l.slug}/`} className="mlib-league mlib-league-link">
              <div className="mlib-league-left">
                <span className="mlib-league-initial bm">{l.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="mlib-league-body">
                <div className="mlib-league-name">{l.name}</div>
                <div className="mlib-league-meta">
                  <span className="mlib-league-plat">{l.platform}</span>
                  <span>Bookmarked</span>
                </div>
              </div>
              <div className="mlib-league-arrow">
                <svg viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 1 7 7 1 13" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* ── Demo card ── */}
      {showDemoCard && (
        <div className="mlib-list">
          <div className="mlib-list-head">
            <span>See it live</span>
          </div>
          <a href="/demo/" target="_blank" rel="noopener" className="mlib-demo">
            <span className="mlib-demo-icon">★</span>
            <span className="mlib-demo-body">
              <span className="mlib-demo-title">Demo almanac</span>
              <span className="mlib-demo-desc">A real league's seven-year history</span>
            </span>
            <span className="mlib-league-arrow">
              <svg viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 1 7 7 1 13" />
              </svg>
            </span>
          </a>
        </div>
      )}

      <div className="mlib-footer">
        <Link href="/" className="mlib-footer-link">Home</Link>
        <span className="mlib-footer-sep">·</span>
        <Link href="/pricing" className="mlib-footer-link">Pricing</Link>
        <span className="mlib-footer-sep">·</span>
        <Link href="/account" className="mlib-footer-link">Account</Link>
      </div>
    </main>
  )
}
