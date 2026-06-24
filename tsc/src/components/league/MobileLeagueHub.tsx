import Link from 'next/link'
import { SyncButton } from '@/app/league/[slug]/sync-button'
import { PublishButton } from '@/app/league/[slug]/setup/publish-button'

type LeagueData = {
  id: string
  name: string
  slug: string
  platform: string
  last_synced_at: string | null
  published_at: string | null
  owner_id: string | null
  settings: Record<string, unknown> | null
}

export function MobileLeagueHub({
  league,
  isOwner,
  seasonCount,
  managerCount,
  matchupCount,
  rivalryCount,
  sourceCount,
  tier,
  tierLabel,
  firstYear,
  lastYear,
  liveYear,
  liveWeek,
}: {
  league: LeagueData
  isOwner: boolean
  seasonCount: number
  managerCount: number
  matchupCount: number
  rivalryCount: number
  sourceCount: number
  tier: string
  tierLabel: string
  firstYear: number | null
  lastYear: number | null
  liveYear: number | null
  liveWeek: number | null
}) {
  const slug = league.slug
  const yearSpan =
    firstYear && lastYear
      ? firstYear === lastYear
        ? String(firstYear)
        : `${firstYear}--${lastYear}`
      : null

  return (
    <main className="mlh">
      {/* ── Sticky bar ── */}
      <header className="mlh-bar">
        <Link href="/dashboard" className="mlh-bar-back" aria-label="Back to library">
          <svg viewBox="0 0 8 14" width="10" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <div className="mlh-bar-center">
          <span className="mlh-bar-kicker">{league.platform}</span>
          <span className="mlh-bar-name">{league.name}</span>
        </div>
        <span className="mlh-bar-spacer" />
      </header>

      {/* ── Big stats ── */}
      <div className="mlh-stats">
        <div className="mlh-stat">
          <span className="mlh-stat-val">{seasonCount}</span>
          <span className="mlh-stat-lbl">{seasonCount === 1 ? 'Season' : 'Seasons'}</span>
        </div>
        <div className="mlh-stat">
          <span className="mlh-stat-val">{managerCount}</span>
          <span className="mlh-stat-lbl">Managers</span>
        </div>
        <div className="mlh-stat">
          <span className="mlh-stat-val">{matchupCount}</span>
          <span className="mlh-stat-lbl">Matchups</span>
        </div>
      </div>

      {/* ── League snapshot card ── */}
      <div className="mlh-snap-card">
        <div className="mlh-snap-grid">
          {yearSpan && (
            <div className="mlh-snap-cell">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <line x1="2" y1="6" x2="14" y2="6" />
                <line x1="6" y1="2" x2="6" y2="6" />
                <line x1="10" y1="2" x2="10" y2="6" />
              </svg>
              <span>{yearSpan}</span>
            </div>
          )}
          <div className="mlh-snap-cell">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h8" /><path d="M6 4l-4 4 4 4" /><path d="M10 4l4 4-4 4" />
            </svg>
            <span>{rivalryCount} {rivalryCount === 1 ? 'rivalry' : 'rivalries'}</span>
          </div>
          <div className="mlh-snap-cell">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="12" height="10" rx="1.5" />
              <line x1="2" y1="7" x2="14" y2="7" />
              <line x1="6" y1="7" x2="6" y2="13" />
            </svg>
            <span>{sourceCount} {sourceCount === 1 ? 'source' : 'sources'}</span>
          </div>
          {league.last_synced_at && (
            <div className="mlh-snap-cell">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6" />
                <polyline points="8 4.5 8 8 11 10" />
              </svg>
              <span>Synced {new Date(league.last_synced_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Setup wizard re-entry (owner only) ── */}
      {isOwner && (
        <div style={{ padding: '0 1rem', marginBottom: '.75rem' }}>
          <Link href={`/league/${slug}/welcome`} className="mmem-wiz-link">
            Run setup wizard
          </Link>
        </div>
      )}

      {/* ── Almanac status card ── */}
      <div className="mlh-almanac">
        <a
          href={`/leagues/${slug}/`}
          target="_blank"
          rel="noopener"
          className="mlh-almanac-link"
        >
          <div className="mlh-almanac-left">
            <div className={`mlh-almanac-dot ${league.published_at ? 'live' : ''}`} />
            <div className="mlh-almanac-info">
              <span className="mlh-almanac-title">Public Almanac</span>
              <span className="mlh-almanac-status">
                {league.published_at ? 'Live' : 'Not published'}
              </span>
            </div>
          </div>
          <div className="mlh-almanac-right">
            <span className="mlh-almanac-tier">{tierLabel}</span>
            <span className="mlh-almanac-arrow">
              <svg viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 1 7 7 1 13" />
              </svg>
            </span>
          </div>
        </a>
      </div>

      {/* ── Actions: Sync + Publish ── */}
      <div className="mlh-actions">
        <div className="mlh-action-card">
          <div className="mlh-action-head">
            <span className="mlh-action-title">Sync</span>
            {league.last_synced_at && (
              <span className="mlh-action-meta">
                {new Date(league.last_synced_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          <div className="mlh-action-desc">
            Pulls every season your sources can reach. Stay on this page until it finishes.
          </div>
          <div className="mlh-action-btn-wrap">
            <SyncButton leagueId={league.id} />
          </div>
        </div>

        <div className="mlh-action-card">
          <div className="mlh-action-head">
            <span className="mlh-action-title">Publish</span>
            <span className="mlh-action-meta">
              {league.published_at ? 'Live' : 'Hidden'}
            </span>
          </div>
          <div className="mlh-action-desc">
            {league.published_at
              ? 'Almanac is live. Unpublish to take it offline.'
              : 'Open the gates so visitors can read the public archive.'}
          </div>
          <div className="mlh-action-btn-wrap">
            <PublishButton leagueId={league.id} isPublished={!!league.published_at} />
          </div>
        </div>
      </div>

      {/* ── Configuration nav ── */}
      <div className="mlh-config">
        <div className="mlh-config-head">Configure</div>
        <div className="mlh-config-list">
          <Link href={`/league/${slug}/setup`} className="mlh-config-row">
            <span className="mlh-config-icon">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="5.5" r="3" />
                <path d="M2.5 14.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
              </svg>
            </span>
            <span className="mlh-config-body">
              <span className="mlh-config-name">Members</span>
              <span className="mlh-config-desc">Merge, hide, rename, set alumni</span>
            </span>
            <span className="mlh-config-badge teal">{managerCount}</span>
            <span className="mlh-config-arrow">
              <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 1 7 7 1 13" /></svg>
            </span>
          </Link>

          <Link href={`/league/${slug}/sources`} className="mlh-config-row">
            <span className="mlh-config-icon">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="12" height="10" rx="1.5" />
                <line x1="2" y1="7" x2="14" y2="7" />
                <line x1="6" y1="7" x2="6" y2="13" />
              </svg>
            </span>
            <span className="mlh-config-body">
              <span className="mlh-config-name">Sources</span>
              <span className="mlh-config-desc">Sleeper, ESPN, NFL, Yahoo connections</span>
            </span>
            <span className="mlh-config-badge sage">{sourceCount}</span>
            <span className="mlh-config-arrow">
              <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 1 7 7 1 13" /></svg>
            </span>
          </Link>

          <Link href={`/league/${slug}/rivalries`} className="mlh-config-row">
            <span className="mlh-config-icon">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h8" />
                <path d="M6 4l-4 4 4 4" />
                <path d="M10 4l4 4-4 4" />
              </svg>
            </span>
            <span className="mlh-config-body">
              <span className="mlh-config-name">Rivalries</span>
              <span className="mlh-config-desc">Hand-pick feuds for the almanac</span>
            </span>
            <span className="mlh-config-badge fire">{rivalryCount}</span>
            <span className="mlh-config-arrow">
              <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 1 7 7 1 13" /></svg>
            </span>
          </Link>

          <Link href={`/league/${slug}/settings`} className="mlh-config-row">
            <span className="mlh-config-icon">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="2.5" />
                <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
              </svg>
            </span>
            <span className="mlh-config-body">
              <span className="mlh-config-name">Settings</span>
              <span className="mlh-config-desc">Custom abbreviation, display knobs</span>
            </span>
            <span className="mlh-config-arrow">
              <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 1 7 7 1 13" /></svg>
            </span>
          </Link>

          <Link href={`/league/${slug}/live`} className="mlh-config-row">
            <span className="mlh-config-icon">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6" />
                <polyline points="8 4.5 8 8 11 10" />
              </svg>
            </span>
            <span className="mlh-config-body">
              <span className="mlh-config-name">Current Season</span>
              <span className="mlh-config-desc">Mark the in-progress year</span>
            </span>
            {liveYear ? (
              <span className="mlh-config-badge teal">
                {liveWeek != null ? `WK ${liveWeek}` : ''} {liveYear}
              </span>
            ) : (
              <span className="mlh-config-badge steel">Off</span>
            )}
            <span className="mlh-config-arrow">
              <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 1 7 7 1 13" /></svg>
            </span>
          </Link>

          {isOwner && (
            <Link href={`/league/${slug}/present`} className="mlh-config-row">
              <span className="mlh-config-icon">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1.5" y="3" width="13" height="9" rx="1" />
                  <line x1="5" y1="14" x2="11" y2="14" />
                  <line x1="8" y1="12" x2="8" y2="14" />
                </svg>
              </span>
              <span className="mlh-config-body">
                <span className="mlh-config-name">Presentation Mode</span>
                <span className="mlh-config-desc">Slide deck from league data</span>
              </span>
              <span className="mlh-config-badge ember">New</span>
              <span className="mlh-config-arrow">
                <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 1 7 7 1 13" /></svg>
              </span>
            </Link>
          )}
        </div>
      </div>

      <div className="mlh-footer">
        <Link href="/dashboard" className="mlh-footer-link">Library</Link>
        <span className="mlh-footer-sep">·</span>
        <Link href="/account" className="mlh-footer-link">Account</Link>
        <span className="mlh-footer-sep">·</span>
        <Link href="/" className="mlh-footer-link">Home</Link>
      </div>
    </main>
  )
}
