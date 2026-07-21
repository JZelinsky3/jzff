import { Fragment } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { MobileLeagueHub } from '@/components/league/MobileLeagueHub'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { resolveLeagueTier, tierBadgeLabel } from '@/lib/leagueTier'
import { resolveCurrentWeek } from '@/lib/liveSeason'
import { getViewMode } from '@/lib/viewMode'
import { loadManagerNameMap, loadManagerOptions } from '@/lib/managerOptions'
import { SyncButton } from './sync-button'
import { GradeTradesButton } from './grade-trades-button'
import { PublishButton } from './setup/publish-button'
import { BillboardPublishCta } from './billboard-publish-cta'
import { SetupWizCallout } from './setup-wiz-callout'
import { ChapterBook } from './chapter-book'
import { SourcesWorkbench } from './sources/sources-workbench'
import { SetupList, type ProfileRow } from './setup/setup-list'
import { FeudBoard } from './rivalries/feud-board'
import { LiveSeasonForm, type SeasonRow } from './live/live-form'
import { SourcePicker, type SourceRow as LiveSourceRow } from './live/source-picker'
import { GotwPicker, type GotwWeek } from './live/gotw-picker'
import { SettingsForm } from './settings/settings-form'

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
  // Site admins can run every owner control here (sync, publish, wizard,
  // presentations) when assisting with someone else's league.
  const canManage = isOwner || (!!viewer && (await isSiteAdmin(viewer.id)))
  // Manual "grade N trades" card — dev/backfill tool, deliberately limited
  // to Joey's own leagues. Everyone else gets grades automatically via the
  // daily cron (/api/cron/grade-trades); no button needed.
  const canGradeTrades = ['jake', 'pams'].includes(league.slug)

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
        isOwner={canManage}
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

  const tierTitle =
    tier === 'test'
      ? 'Your free trial league. Every non-comp user gets one slot.'
      : tier === 'udfa'
      ? 'Free-tier (UDFA) league. Upgrade for more features.'
      : tier === 'paid'
      ? 'Paid plan league.'
      : 'Comped account with unlimited access.'

  // ── Chapter data ──────────────────────────────────────────────────
  // The book edits every chapter in place, so the hub loads what the
  // five standalone pages each used to load on their own. Runs after the
  // mobile bail-out above, since the mobile hub renders none of it.
  const [
    { data: sourcesRaw },
    { data: profileRows },
    { data: managerRows },
    { data: rivalryRows },
    { data: seasonRowsRaw },
    { data: liveSourceRows },
    { data: yahooTok },
    managerOpts,
    nameOf,
  ] = await Promise.all([
    supabase
      .from('league_sources')
      .select('id, platform, external_id, label, walk_history, settings, last_synced_at, created_at')
      .eq('league_id', league.id)
      .order('created_at'),
    supabase
      .from('manager_profiles')
      .select('id, canonical_name, is_alumni_override, is_hidden')
      .eq('league_id', league.id)
      .order('canonical_name'),
    supabase
      .from('managers')
      .select('id, profile_id, display_name, team_name, external_id')
      .eq('league_id', league.id),
    supabase
      .from('rivalries')
      .select('id, name, manager_a_id, manager_b_id, created_at')
      .eq('league_id', league.id)
      .order('created_at'),
    supabase
      .from('seasons')
      .select('id, year, is_live, settings')
      .eq('league_id', league.id)
      .order('year', { ascending: false }),
    supabase
      .from('league_sources')
      .select('id, platform, external_id, label, is_live')
      .eq('league_id', league.id)
      .order('created_at', { ascending: true }),
    viewer
      ? supabase.from('yahoo_tokens').select('user_id').eq('user_id', viewer.id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadManagerOptions(supabase, league.id),
    loadManagerNameMap(supabase, league.id),
  ])
  const yahooConnected = !!yahooTok

  // ESPN cookies must never cross into the client bundle.
  type RawSource = NonNullable<typeof sourcesRaw>[number]
  const chapterSources = (sourcesRaw ?? []).map((s: RawSource) => {
    const settings = (s.settings ?? {}) as Record<string, unknown>
    if (s.platform !== 'espn') return { ...s, hasCookies: false }
    const hasCookies = Boolean(settings.swid && settings.espn_s2)
    const safe: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(settings)) {
      if (k !== 'swid' && k !== 'espn_s2') safe[k] = v
    }
    return { ...s, settings: safe, hasCookies }
  })
  const syncedRange =
    years.length === 0
      ? null
      : years[0] === years[years.length - 1]
      ? `Pulled ${years[0]}`
      : `Pulled ${years[0]}–${years[years.length - 1]}`

  // Members: stitch profiles to their platform accounts, flagging anyone
  // who appears in the newest season that actually has data.
  const profilesById = new Map<string, ProfileRow>()
  for (const p of profileRows ?? []) {
    profilesById.set(p.id, {
      id: p.id,
      canonical_name: p.canonical_name,
      is_alumni_override: p.is_alumni_override,
      is_hidden: p.is_hidden,
      auto_current: false,
      managers: [],
    })
  }
  let currentManagerIds = new Set<string>()
  for (const sn of (seasonRowsRaw ?? []).slice(0, 20)) {
    const { data: ms } = await supabase
      .from('manager_seasons')
      .select('manager_id')
      .eq('season_id', sn.id)
    if (ms && ms.length > 0) {
      currentManagerIds = new Set(ms.map((r) => r.manager_id))
      break
    }
  }
  for (const m of managerRows ?? []) {
    if (!m.profile_id) continue
    const p = profilesById.get(m.profile_id)
    if (!p) continue
    p.managers.push({
      id: m.id,
      display_name: m.display_name,
      team_name: m.team_name,
      external_id: m.external_id,
    })
    if (currentManagerIds.has(m.id)) p.auto_current = true
  }
  const profilesList = Array.from(profilesById.values())

  const feuds = (rivalryRows ?? []).map((r) => ({
    id: r.id,
    name: r.name as string | null,
    managerAId: r.manager_a_id as string,
    managerBId: r.manager_b_id as string,
    aName: nameOf.get(r.manager_a_id as string) ?? 'Unknown',
    bName: nameOf.get(r.manager_b_id as string) ?? 'Unknown',
  }))

  const seasonRows: SeasonRow[] = (seasonRowsRaw ?? []).map((s) => ({
    id: s.id,
    year: s.year,
    is_live: !!s.is_live,
  }))
  const liveRaw = (seasonRowsRaw ?? []).find((s) => s.is_live)
  const liveSettings = (liveRaw?.settings ?? {}) as Record<string, unknown>
  const weekOverride =
    typeof liveSettings.current_week === 'number' ? (liveSettings.current_week as number) : null
  const seasonStartDate =
    typeof liveSettings.season_start_date === 'string' ? (liveSettings.season_start_date as string) : null
  const livePickerSources: LiveSourceRow[] = (liveSourceRows ?? []).map((s) => ({
    id: s.id,
    platform: s.platform,
    external_id: s.external_id,
    label: s.label ?? null,
    is_live: !!s.is_live,
  }))

  // Game of the Week lives in the Season chapter, so the hub needs the
  // live season's regular-season schedule and the names on both sides of
  // each matchup. Only runs when a season is actually flagged live.
  const gotwMap = (liveSettings.gotw ?? {}) as Record<string, string>
  let gotwWeeks: GotwWeek[] = []
  let gotwManagers: string[] = []
  if (liveRaw) {
    const { data: matchupRows } = await supabase
      .from('matchups')
      .select('id, week, manager_a_id, manager_b_id, is_playoff')
      .eq('season_id', liveRaw.id)
      .order('week', { ascending: true })
    const regular = (matchupRows ?? []).filter((r) => !r.is_playoff)
    if (regular.length > 0) {
      const gotwNameOf = (mid: string) => nameOf.get(mid) ?? 'Unknown'
      const byWeek = new Map<number, typeof regular>()
      for (const r of regular) {
        if (!byWeek.has(r.week)) byWeek.set(r.week, [])
        byWeek.get(r.week)!.push(r)
      }
      gotwWeeks = [...byWeek.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([week, rows]) => ({
          week,
          matchups: rows.map((r) => ({
            id: r.id,
            label: `${gotwNameOf(r.manager_a_id)} vs ${gotwNameOf(r.manager_b_id)}`,
            managerA: gotwNameOf(r.manager_a_id),
            managerB: gotwNameOf(r.manager_b_id),
          })),
        }))
      const nameSet = new Set<string>()
      for (const w of gotwWeeks) for (const m of w.matchups) { nameSet.add(m.managerA); nameSet.add(m.managerB) }
      gotwManagers = [...nameSet].sort((a, b) => a.localeCompare(b))
    }
  }

  // Settings chapter. Older leagues predate the scoring/prize columns, so
  // fall back the same way the standalone settings page does.
  type SettingsRow = {
    abbreviation: string | null
    prize_pool: string | null
    draft_scoring_profile: 'ppr_6pt' | 'half_4pt' | 'ppr_4pt' | 'half_6pt' | 'std_4pt' | 'std_6pt'
    superflex: boolean
  }
  let settingsRow: SettingsRow = { abbreviation: null, prize_pool: null, draft_scoring_profile: 'ppr_6pt', superflex: false }
  const withSuperflex = await supabase
    .from('leagues')
    .select('abbreviation, prize_pool, draft_scoring_profile, superflex')
    .eq('id', league.id)
    .maybeSingle<SettingsRow>()
  const withScoring = withSuperflex.data
    ? withSuperflex
    : await supabase
        .from('leagues')
        .select('abbreviation, prize_pool, draft_scoring_profile')
        .eq('id', league.id)
        .maybeSingle<SettingsRow>()
  if (withScoring.data) {
    // The scoring-only fallback query omits superflex; coalesce so it's
    // always a real boolean regardless of which query answered.
    settingsRow = { ...withScoring.data, superflex: withScoring.data.superflex ?? false }
  } else {
    const bare = await supabase
      .from('leagues')
      .select('abbreviation')
      .eq('id', league.id)
      .maybeSingle<{ abbreviation: string | null }>()
    if (bare.data) settingsRow = { ...settingsRow, abbreviation: bare.data.abbreviation }
  }

  // Members is the one chapter with a real, explicitly-recorded review
  // signal; the others infer from their own content (see `reviewed`).
  const membersReviewedAt =
    ((league.settings ?? {}) as { members_reviewed_at?: string }).members_reviewed_at ?? null

  // Imprint line on the cover. "Vol. N" read as an edition number and
  // just confused matters — it was the season row count, which an empty
  // in-progress season quietly inflated. State the contents instead.
  const boundSeasons = years.length
  const boundLine =
    boundSeasons === 0
      ? 'Nothing bound yet'
      : `${boundSeasons} season${boundSeasons === 1 ? '' : 's'} bound`

  // Sync readout: the big serif number on the control board is the
  // last-sync date (or "Never"), not a sentence.
  const syncedDate = league.last_synced_at ? new Date(league.last_synced_at) : null
  const syncedShort = syncedDate
    ? syncedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null

  return (
    <main className="lo-page">
      {/* ── The volume: the archive itself, bound and stamped ── */}
      <section className="lo-volume">
        <div className="lo-cover-stage">
          {league.published_at ? (
            <a
              href={`/leagues/${slug}/`}
              target="_blank"
              rel="noopener"
              className="lo-cover"
              title="Open the public almanac"
            >
              <span className="lo-cover-plate">
                <span className="lo-cover-kicker">The Sunday Chronicle</span>
                <span className="lo-cover-title">{league.name}</span>
                <span className="lo-cover-orn" aria-hidden>✦</span>
                <span className="lo-cover-years">
                  {firstYear != null && lastYear != null
                    ? (firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`)
                    : 'No seasons yet'}
                </span>
                <span className="lo-cover-lower">
                  <span className="lo-cover-band live">Published</span>
                </span>
              </span>
              <span className="lo-cover-foot">{boundLine}</span>
            </a>
          ) : (
            <div className="lo-cover">
              <span className="lo-cover-plate">
                <span className="lo-cover-kicker">The Sunday Chronicle</span>
                <span className="lo-cover-title">{league.name}</span>
                <span className="lo-cover-orn" aria-hidden>✦</span>
                <span className="lo-cover-years">
                  {firstYear != null && lastYear != null
                    ? (firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`)
                    : 'No seasons yet'}
                </span>
                <span className="lo-cover-lower">
                  <span className="lo-cover-band">Not published</span>
                </span>
              </span>
              <span className="lo-cover-foot">{boundLine}</span>
            </div>
          )}
        </div>

        <div className="lo-volume-side">
          <div className="lo-volume-kicker">The Front Office</div>
          <h1 className="lo-volume-title">
            {head} {tail && <em>{tail}.</em>}
          </h1>
          <p className="lo-volume-sub">
            Everything the commissioner touches lives here. Pull your history
            in, tune how it reads, and publish the almanac for the whole league.
          </p>
          <div className="lo-volume-stats">
            <span><strong>{seasonCount ?? 0}</strong> season{seasonCount === 1 ? '' : 's'}</span>
            <span className="sep">|</span>
            <span><strong>{managerCount ?? 0}</strong> managers</span>
            <span className="sep">|</span>
            <span><strong>{matchupCount ?? 0}</strong> matchups</span>
            <span className="sep">|</span>
            <span><strong>{rivalryCount ?? 0}</strong> feuds</span>
            <span className="sep">|</span>
            <span title={tierTitle} style={{ color: 'var(--gold)' }}>★ {tierBadgeLabel(tier)}</span>
          </div>
          <div className="lo-volume-acts">
            {league.published_at ? (
              <a
                href={`/leagues/${slug}/`}
                target="_blank"
                rel="noopener"
                className="lo-btn"
                data-no-turn
              >
                Read the almanac
              </a>
            ) : (
              canManage && <BillboardPublishCta leagueId={league.id} />
            )}
            <Link href={`/league/${slug}/sources`} className="lo-btn-ghost">
              Sources
            </Link>
          </div>
        </div>
      </section>

      {canManage && !((league.settings ?? {}) as { wizard_dismissed_at?: string }).wizard_dismissed_at && (
        <div className="lo-band tight">
          <SetupWizCallout leagueId={league.id} slug={slug} />
        </div>
      )}

      {/* ── § 01 · Control board ── */}
      <div className="lo-band">
        <div className="lo-folio">
          <span className="lo-folio-no">01</span>
          <span className="lo-folio-title">The control board</span>
          <span className="lo-folio-meta">Sync &amp; publish</span>
        </div>

        <div className="lo-console">
          <div className="lo-console-bar">
            <span className="lo-console-bar-side">
              <span>{league.platform} archive</span>
              <span className="rule" aria-hidden />
            </span>
            <span>Console</span>
            <span className="lo-console-bar-side right">
              <span className="rule" aria-hidden />
              <span>{league.published_at ? 'On air' : 'Off air'}</span>
            </span>
          </div>

          <div className="lo-gauges">
            <div className="lo-gauge">
              <div className={`lo-gauge-label${syncedDate ? ' on' : ' warn'}`}>
                <span className="lamp" aria-hidden />
                Last sync
              </div>
              <div className={`lo-gauge-value${syncedDate ? '' : ' muted'}`}>
                {syncedShort ?? 'Never'}
              </div>
              <div className="lo-gauge-sub">
                {syncedDate ? syncedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'No data pulled yet'}
              </div>
            </div>

            <div className="lo-gauge">
              <div className={`lo-gauge-label${league.published_at ? ' on' : ''}`}>
                <span className="lamp" aria-hidden />
                Almanac
              </div>
              <div className="lo-gauge-value">
                {league.published_at ? <em>Live.</em> : 'Hidden.'}
              </div>
              <div className="lo-gauge-sub">
                {league.published_at ? `/leagues/${slug}/` : 'Not published'}
              </div>
            </div>

            <div className="lo-gauge">
              <div className="lo-gauge-label"><span className="lamp" aria-hidden />Coverage</div>
              <div className="lo-gauge-value">{seasonCount ?? 0}</div>
              <div className="lo-gauge-sub">
                {firstYear != null && lastYear != null
                  ? (firstYear === lastYear ? `${firstYear}` : `${firstYear}–${lastYear}`)
                  : 'No seasons'}
              </div>
            </div>

            <div className="lo-gauge">
              <div className="lo-gauge-label"><span className="lamp" aria-hidden />On file</div>
              <div className="lo-gauge-value">{(matchupCount ?? 0).toLocaleString()}</div>
              <div className="lo-gauge-sub">matchups</div>
            </div>
          </div>

          <div className="lo-console-acts">
            <div className="lo-console-act">
              <span className="lo-console-act-btn">
                <SyncButton leagueId={league.id} />
              </span>
              <span className="lo-console-act-note">
                Pulls every attached source again: standings, drafts, matchups,
                lineups and trades. Can take a few minutes on a deep history, so{' '}
                <strong>stay on this page</strong> until it finishes.
              </span>
            </div>
            <div className="lo-console-act">
              <span className="lo-console-act-btn">
                <PublishButton leagueId={league.id} isPublished={!!league.published_at} />
              </span>
              <span className="lo-console-act-note">
                {league.published_at
                  ? <>Takes the public almanac back offline. Everything you have synced stays exactly where it is, and you can publish again whenever you like.</>
                  : <>Puts the whole archive online at <strong>/leagues/{slug}/</strong> for anyone with the link. Instant, and reversible any time.</>}
              </span>
            </div>
          </div>
        </div>


        {/* Trade grader is a private dev/backfill tool for Joey's own two
            leagues, not part of the standard commissioner console, so it
            sits apart on its own bench below rather than as a third
            readout implying every league has one. */}
        {canGradeTrades && (
          <div className="lo-bench">
            <div className="lo-bench-tag">Private tool</div>
            <div className="lo-bench-body">
              <div className="lo-bench-title">
                Trade <em>grader.</em> <span className="lo-tag gold">Beta</span>
              </div>
              <div className="lo-bench-copy">
                Runs Groq on up to 10 ungraded trades at a time. Click again to
                keep going through the backlog. Every other league gets grades
                automatically from the nightly cron.
              </div>
            </div>
            <div className="lo-bench-act">
              <GradeTradesButton leagueId={league.id} />
            </div>
          </div>
        )}
      </div>

      {/* ── § 02 · The book ── */}
      <div className="lo-band">
        <div className="lo-folio">
          <span className="lo-folio-no">02</span>
          <span className="lo-folio-title">The chapters</span>
          <span className="lo-folio-meta">Open at the contents</span>
        </div>

        <ChapterBook
          slug={slug}
          counts={{
            sources: { value: String(sourceCount ?? 0), unit: 'attached' },
            members: { value: String(managerCount ?? 0), unit: 'on file' },
            rivalries: { value: String(rivalryCount ?? 0), unit: 'curated' },
            season: liveYear
              ? { value: String(liveYear), unit: liveWeek != null ? `· wk ${liveWeek}` : 'live' }
              : { unit: 'Off-season' },
            settings: { unit: 'Edit' },
          }}
          reviewed={{
            sources: {
              done: (sourceCount ?? 0) > 0 && !!league.last_synced_at,
              why: (sourceCount ?? 0) === 0
                ? 'No sources attached yet'
                : league.last_synced_at
                ? 'A source is attached and has been synced'
                : 'Attached, but never synced',
            },
            members: {
              done: !!membersReviewedAt,
              why: membersReviewedAt
                ? `Marked reviewed ${new Date(membersReviewedAt).toLocaleDateString()}`
                : 'Not marked reviewed yet',
            },
            rivalries: {
              done: (rivalryCount ?? 0) > 0,
              why: (rivalryCount ?? 0) > 0 ? 'At least one feud on file' : 'No feuds curated yet',
            },
            season: {
              done: liveYear != null,
              why: liveYear != null ? `${liveYear} is marked live` : 'No season marked live (off-season)',
            },
            settings: {
              done: !!settingsRow.abbreviation,
              why: settingsRow.abbreviation
                ? 'An abbreviation has been set'
                : 'Still using the derived abbreviation',
            },
          }}
          /* Each panel carries an explicit key. These elements are built
             here in a Server Component and handed across the RSC boundary
             as props to a Client Component, so React cannot treat them as
             statically-authored children of ChapterBook's own JSX the way
             it would for inline elements. An explicit key settles it. */
          panels={{
            sources: (
              <SourcesWorkbench
                key="sources"
                leagueId={league.id}
                slug={slug}
                sources={chapterSources}
                syncedRange={syncedRange}
                yahooConnected={yahooConnected}
              />
            ),
            members: <SetupList key="members" leagueId={league.id} slug={slug} profiles={profilesList} />,
            rivalries: (
              <FeudBoard
                key="rivalries"
                leagueId={league.id}
                slug={slug}
                managers={managerOpts.map((m) => ({ id: m.id, name: m.name }))}
                feuds={feuds}
              />
            ),
            season: (
              <Fragment key="season">
                <div className="lo-pair">
                  <LiveSeasonForm
                    leagueId={league.id}
                    seasons={seasonRows}
                    weekOverride={weekOverride}
                    seasonStartDate={seasonStartDate}
                    resolvedWeek={liveWeek}
                  />
                  {/* The season column runs taller (start date + week
                      override), so the source column gets a note rather
                      than a hole beneath it. */}
                  <div>
                    <SourcePicker leagueId={league.id} sources={livePickerSources} />
                    <div className="lo-note" style={{ marginTop: '1.4rem' }}>
                      <div className="lo-note-head">
                        <span className="pin">✦</span> What going live turns on
                      </div>
                      <div className="lo-note-body">
                        Pick&apos;ems, power rankings, the weekly form sheet and
                        Sunday Live all read from whichever season is marked
                        live. With nothing marked, the league reads as
                        off-season and those pages stay dark.
                        {liveYear != null && liveWeek != null && (
                          <>
                            {' '}Right now that resolves to{' '}
                            <strong>{liveYear}, week {liveWeek}</strong>.
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lo-leaf-sub">
                  <span className="lo-leaf-sub-title">Game of the Week</span>
                  <span className="lo-leaf-sub-meta">
                    {gotwWeeks.length > 0
                      ? `${gotwWeeks.length} weeks on the schedule`
                      : 'Set a live season first'}
                  </span>
                </div>
                {liveRaw && gotwWeeks.length > 0 ? (
                  <GotwPicker
                    leagueId={league.id}
                    seasonId={liveRaw.id}
                    defaultWeek={liveWeek}
                    weeks={gotwWeeks}
                    currentGotw={gotwMap}
                    managers={gotwManagers}
                  />
                ) : (
                  <div className="lo-empty">
                    <div className="lo-empty-text">
                      Mark a season live above, then sync it, to choose Games of the Week.
                    </div>
                  </div>
                )}
              </Fragment>
            ),
            settings: (
              <SettingsForm
                key="settings"
                leagueId={league.id}
                leagueName={league.name}
                currentSlug={league.slug}
                currentAbbreviation={settingsRow.abbreviation}
                currentPrizePool={settingsRow.prize_pool}
                currentDraftScoringProfile={settingsRow.draft_scoring_profile}
                currentSuperflex={settingsRow.superflex}
                savedJustNow={false}
                inline
              />
            ),
          }}
        />
      </div>


      <SiteFooter />
    </main>
  )
}
