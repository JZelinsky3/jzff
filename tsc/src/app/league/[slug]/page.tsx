import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { MobileLeagueHub } from '@/components/league/MobileLeagueHub'
import { createClient } from '@/lib/supabase/server'
import { resolveLeagueTier, tierBadgeLabel } from '@/lib/leagueTier'
import { resolveCurrentWeek } from '@/lib/liveSeason'
import { getViewMode } from '@/lib/viewMode'
import { SyncButton } from './sync-button'
import { GradeTradesButton } from './grade-trades-button'
import { PublishButton } from './setup/publish-button'
import { BillboardPublishCta } from './billboard-publish-cta'

export default async function LeagueOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, slug, platform, last_synced_at, published_at, owner_id, settings')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()

  const { data: { user: viewer } } = await supabase.auth.getUser()
  const isOwner = !!viewer && league.owner_id === viewer.id

  const [
    { count: seasonCount },
    { count: managerCount },
    { count: matchupCount },
    { count: rivalryCount },
    { count: sourceCount },
    { data: yearRows },
  ] = await Promise.all([
    supabase.from('seasons').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase.from('managers').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase
      .from('matchups')
      .select('id, season:seasons!inner(league_id)', { count: 'exact', head: true })
      .eq('season.league_id', league.id),
    supabase.from('rivalries').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase.from('league_sources').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    supabase.from('seasons').select('year, is_live, settings').eq('league_id', league.id).order('year'),
  ])
  const years = (yearRows ?? []).map((r) => r.year as number)
  const firstYear = years.length > 0 ? years[0] : null
  const lastYear = years.length > 0 ? years[years.length - 1] : null
  const liveRow = (yearRows ?? []).find((r) => r.is_live)
  const liveYear = (liveRow?.year as number) ?? null
  const liveWeek = liveRow ? resolveCurrentWeek((liveRow.settings ?? {}) as Record<string, unknown>) : null

  const words = league.name.trim().split(/\s+/)
  const head = words.slice(0, -1).join(' ')
  const tail = words[words.length - 1] ?? ''

  const tier = await resolveLeagueTier(league.id, league.owner_id ?? null)

  if ((await getViewMode()) === 'mobile') {
    return (
      <MobileLeagueHub
        league={league}
        isOwner={isOwner}
        seasonCount={seasonCount ?? 0}
        managerCount={managerCount ?? 0}
        matchupCount={matchupCount ?? 0}
        rivalryCount={rivalryCount ?? 0}
        sourceCount={sourceCount ?? 0}
        tier={tier}
        tierLabel={tierBadgeLabel(tier)}
        firstYear={firstYear}
        lastYear={lastYear}
        liveYear={liveYear}
        liveWeek={liveWeek}
      />
    )
  }

  return (
    <main>
      <section className="hero">
        <div className="hero-sup">★ League Management ★</div>
        <h1 className="hero-title">
          {head} {tail && <em>{tail}.</em>}
        </h1>
        <p className="hero-sub">
          Sync from your platform, manage sources, curate rivalries.
          The public almanac updates whenever you sync.
        </p>
        <div className="hero-meta">
          {seasonCount ?? 0} season{seasonCount === 1 ? '' : 's'} · {managerCount ?? 0} managers · {matchupCount ?? 0} matchups
        </div>
        <div
          className={`dc-tier-badge dc-tier-badge--${tier}`}
          title={
            tier === 'test'
              ? 'Your free trial league — every non-comp user gets one slot.'
              : tier === 'udfa'
              ? 'Free-tier (UDFA) league. Upgrade for more features.'
              : tier === 'paid'
              ? 'Paid plan league.'
              : 'Comped account — unlimited access.'
          }
        >
          <span aria-hidden>★</span>
          {tierBadgeLabel(tier)}
        </div>
      </section>

      {isOwner && (
        <Link href={`/league/${slug}/welcome`} className="setup-wiz-callout">
          <div className="setup-wiz-callout-mark" aria-hidden>
            <span>✦</span>
          </div>
          <div className="setup-wiz-callout-body">
            <div className="setup-wiz-callout-kicker">★ For commissioners ★</div>
            <div className="setup-wiz-callout-title">
              Setup <em>wizard.</em>
            </div>
            <div className="setup-wiz-callout-desc">
              A guided walk through sources, sync, members, rivalries, and publish.
              Start, skip steps, come back later.
            </div>
          </div>
          <div className="setup-wiz-callout-cta" aria-hidden>
            <span>Open</span>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 3 11 8 6 13" />
            </svg>
          </div>
        </Link>
      )}

      {/* § 01 — Public Almanac BILLBOARD. Wide marquee shape: the only
          non-rectangular block on the page (angled clip on both sides)
          so the live-site CTA visually pops above the rest. */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · Public Almanac</span>
          <span className="section-title">Your live site —</span>
          <span className="section-meta">
            {league.published_at ? 'Live now' : 'Not yet published'}
          </span>
        </div>
        {/* When published, the billboard is a link to the live site. When
            not published, it's a static block whose CTA publishes the
            almanac directly — sending the user to the placeholder page just
            to bounce back was a pointless detour. */}
        {league.published_at ? (
          <a
            href={`/leagues/${slug}/`}
            target="_blank"
            rel="noopener"
            className="almanac-billboard"
          >
            <span className="almanac-billboard-status live">LIVE</span>
            <div className="almanac-billboard-rule" aria-hidden />
            <div className="almanac-billboard-inner">
              <div className="almanac-billboard-kicker">★ Click to open ★</div>
              <div className="almanac-billboard-title">
                Public <em>Almanac.</em>
              </div>
              <div className="almanac-billboard-desc">
                Standings, season archives, the record book, drafts, manager profiles,
                rivalries — the whole thing. Opens in a new tab.
              </div>
              <span className="almanac-billboard-cta">View site ↗</span>
            </div>
            <div className="almanac-billboard-rule" aria-hidden />
          </a>
        ) : (
          <div className="almanac-billboard almanac-billboard-static">
            <span className="almanac-billboard-status setup">SETUP</span>
            <div className="almanac-billboard-rule" aria-hidden />
            <div className="almanac-billboard-inner">
              <div className="almanac-billboard-kicker">★ Not yet published ★</div>
              <div className="almanac-billboard-title">
                Public <em>Almanac.</em>
              </div>
              <div className="almanac-billboard-desc">
                One click and your archive goes live at /leagues/{slug}/. Standings,
                season records, drafts, manager profiles, rivalries — all of it.
                Reversible any time.
              </div>
              {isOwner && <BillboardPublishCta leagueId={league.id} />}
            </div>
            <div className="almanac-billboard-rule" aria-hidden />
          </div>
        )}
      </div>

      {/* § 02 — Run it. Sync (left) + Publish (right). Grade Trades stacks
          below Sync (Jake-only beta — only visible for that league). */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 02 · Run it</span>
          <span className="section-title">Sync &amp; publish —</span>
          <span className="section-meta">
            {league.last_synced_at
              ? `Synced ${new Date(league.last_synced_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
              : 'Never synced'}
          </span>
        </div>

        {/* Row 1 — Sync (left) + Publish (right), equal height via the grid's
            stretch. Each card stretches via .dc-card-row alignItems:stretch,
            keeping text top-aligned but vertically centering the button.
            minmax uses min(100%, 340px) so on phones (<340px content area)
            the card shrinks to fit the viewport instead of overflowing — a
            plain minmax(340px,1fr) refuses to go below 340 and forces a
            horizontal scroll. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
            gap: '1.25rem',
            alignItems: 'stretch',
          }}
        >
          <div
            className="dc-card-row"
            style={{ alignItems: 'stretch', height: '100%', marginTop: 0 }}
          >
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '1.15rem' }}>
                Sync from sources.
              </div>
              <div
                style={{
                  opacity: 0.7,
                  fontSize: '.85rem',
                  marginTop: '.35rem',
                  lineHeight: 1.5,
                }}
              >
                Walks every season your sources can reach — standings, drafts, matchups.{' '}
                <strong style={{ color: 'var(--gold)' }}>Stay on this page</strong> until
                it finishes; closing the tab cancels the run. Typically{' '}
                <strong>20-90 seconds</strong> depending on history depth.
              </div>
              {league.last_synced_at && (
                <div
                  style={{
                    opacity: 0.55,
                    fontSize: '.7rem',
                    marginTop: '.4rem',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  Last: {new Date(league.last_synced_at).toLocaleString()}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <SyncButton leagueId={league.id} />
            </div>
          </div>

          <div
            className="dc-card-row"
            style={{ alignItems: 'stretch', height: '100%', marginTop: 0 }}
          >
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '1.15rem' }}>
                {league.published_at ? 'Almanac is live.' : 'Almanac is hidden.'}
              </div>
              <div
                style={{
                  opacity: 0.7,
                  fontSize: '.85rem',
                  marginTop: '.35rem',
                  lineHeight: 1.5,
                }}
              >
                {league.published_at
                  ? 'Visitors can read the public archive at any time. Unpublish to take it offline again — synced data stays put.'
                  : `Visitors to /leagues/${slug}/ see a placeholder until you flip this. Publishing is instant and reversible.`}
              </div>
              {league.published_at && (
                <div
                  style={{
                    opacity: 0.55,
                    fontSize: '.7rem',
                    marginTop: '.4rem',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  Published {new Date(league.published_at).toLocaleString()}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <PublishButton leagueId={league.id} isPublished={!!league.published_at} />
            </div>
          </div>
        </div>

        {/* Row 2 — Trade Grader, private beta. Lives in a second 2-col grid
            so the card aligns under Sync at the same width; empty right
            slot keeps the grid layout consistent. Server route gates this
            too, so it stays Jake-only end-to-end. */}
        {league.slug === 'jake' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
              gap: '1.25rem',
              marginTop: '.6rem',
            }}
          >
            <div className="dc-card-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>
                  Grade trades with AI.{' '}
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: '.55rem',
                      letterSpacing: '.2em',
                      color: 'var(--gold)',
                      marginLeft: '.4rem',
                    }}
                  >
                    BETA
                  </span>
                </div>
                <div
                  style={{
                    opacity: 0.7,
                    fontSize: '.82rem',
                    marginTop: '.3rem',
                    lineHeight: 1.45,
                  }}
                >
                  Runs Groq on up to 10 ungraded trades at a time. Click again to keep going.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <GradeTradesButton leagueId={league.id} />
              </div>
            </div>
            <div />
          </div>
        )}
      </div>

      {/* § 03 — Configuration TOC. Two-column ledger (default density). */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 03 · Configuration</span>
          <span className="section-title">Tune the archive —</span>
          <span className="section-meta">Sub-pages</span>
        </div>
        <div className="toc">
          <div className="toc-body">
            <Link href={`/league/${slug}/setup`} className="toc-row">
              <div className="toc-chapter">Ch. 0</div>
              <div className="toc-title-wrap">
                <div className="toc-title">League <em>Members.</em></div>
                <div className="toc-desc">
                  Every person who&apos;s ever been in the league. Merge cross-platform identities, hide throwaways, override alumni, or delete entirely.
                </div>
              </div>
              <span className="toc-badge teal">{managerCount ?? 0} on file</span>
              <div className="toc-arrow">→</div>
            </Link>
            <Link href={`/league/${slug}/sources`} className="toc-row">
              <div className="toc-chapter">Ch. I</div>
              <div className="toc-title-wrap">
                <div className="toc-title">League <em>Sources.</em></div>
                <div className="toc-desc">
                  Connect more Sleeper/ESPN league IDs. Each source walks its own history when synced.
                </div>
              </div>
              <span className="toc-badge sage">{sourceCount ?? 0} on file</span>
              <div className="toc-arrow">→</div>
            </Link>
            <Link href={`/league/${slug}/rivalries`} className="toc-row">
              <div className="toc-chapter">Ch. II</div>
              <div className="toc-title-wrap">
                <div className="toc-title">The <em>Rivalries.</em></div>
                <div className="toc-desc">
                  Pick two managers, name the feud. They&apos;ll appear on the public rivalries page.
                </div>
              </div>
              <span className="toc-badge fire">{rivalryCount ?? 0} curated</span>
              <div className="toc-arrow">→</div>
            </Link>
            <Link href={`/league/${slug}/settings`} className="toc-row">
              <div className="toc-chapter">Ch. III</div>
              <div className="toc-title-wrap">
                <div className="toc-title">League <em>Settings.</em></div>
                <div className="toc-desc">
                  Custom abbreviation and other knobs for the public almanac.
                </div>
              </div>
              <span className="toc-badge steel">Edit</span>
              <div className="toc-arrow">→</div>
            </Link>
            <Link href={`/league/${slug}/live`} className="toc-row">
              <div className="toc-chapter">Ch. IV</div>
              <div className="toc-title-wrap">
                <div className="toc-title">Current <em>Season.</em></div>
                <div className="toc-desc">
                  Mark the in-progress year. Pick&apos;ems, power rankings, and the weekly cron all read from this.
                </div>
              </div>
              <span className="toc-badge teal">Set</span>
              <div className="toc-arrow">→</div>
            </Link>
            {isOwner && (
              <Link href={`/league/${slug}/present`} className="toc-row">
                <div className="toc-chapter">Ch. V</div>
                <div className="toc-title-wrap">
                  <div className="toc-title">Presentation <em>Mode.</em></div>
                  <div className="toc-desc">
                    Build a slide deck from your league&apos;s data — present full-screen at a draft party or end-of-year banquet. Decks live in the browser tab; nothing saves.
                  </div>
                </div>
                <span className="toc-badge ember">New</span>
                <div className="toc-arrow">→</div>
              </Link>
            )}
          </div>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
