import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SiteFooter } from '@/components/SiteFooter'
import { resolveCurrentWeek } from '@/lib/liveSeason'
import { MobileLiveSeason } from '@/components/league/MobileLiveSeason'
import { getViewMode } from '@/lib/viewMode'
import { LiveSeasonForm, type SeasonRow } from './live-form'
import { SourcePicker, type SourceRow } from './source-picker'
import { GotwPicker, type GotwWeek } from './gotw-picker'

export default async function LiveSeasonPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()

  const [{ data: seasons }, { data: sources }] = await Promise.all([
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
  ])

  const rows: SeasonRow[] = (seasons ?? []).map((s) => ({
    id: s.id,
    year: s.year,
    is_live: !!s.is_live,
  }))
  const liveSeason = rows.find((r) => r.is_live) ?? null
  const liveRaw = (seasons ?? []).find((s) => s.is_live)
  const liveSettings = (liveRaw?.settings ?? {}) as Record<string, unknown>
  const weekOverride = typeof liveSettings.current_week === 'number' ? (liveSettings.current_week as number) : null
  const seasonStartDate =
    typeof liveSettings.season_start_date === 'string' ? (liveSettings.season_start_date as string) : null
  const currentWeek = resolveCurrentWeek(liveSettings)

  const sourceRows: SourceRow[] = (sources ?? []).map((s) => ({
    id: s.id,
    platform: s.platform,
    external_id: s.external_id,
    label: s.label ?? null,
    is_live: !!s.is_live,
  }))

  // Load every regular-season week's matchups so the commish can pre-pick a
  // Game of the Week for any week — the side panel tallies who's been
  // featured how many times across the whole season.
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
      const [{ data: managers }, { data: profiles }] = await Promise.all([
        supabase.from('managers').select('id, display_name, profile_id').eq('league_id', league.id),
        supabase.from('manager_profiles').select('id, canonical_name').eq('league_id', league.id),
      ])
      const profileName = new Map<string, string>()
      for (const p of profiles ?? []) profileName.set(p.id, p.canonical_name)
      const nameOf = (mid: string) => {
        const m = (managers ?? []).find((x) => x.id === mid)
        if (!m) return 'Unknown'
        return (m.profile_id && profileName.get(m.profile_id)) || m.display_name
      }
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
            label: `${nameOf(r.manager_a_id)} vs ${nameOf(r.manager_b_id)}`,
            managerA: nameOf(r.manager_a_id),
            managerB: nameOf(r.manager_b_id),
          })),
        }))
      const nameSet = new Set<string>()
      for (const w of gotwWeeks) for (const m of w.matchups) { nameSet.add(m.managerA); nameSet.add(m.managerB) }
      gotwManagers = [...nameSet].sort((a, b) => a.localeCompare(b))
    }
  }

  if ((await getViewMode()) === 'mobile') {
    return (
      <MobileLiveSeason
        leagueId={league.id}
        seasons={rows}
        weekOverride={weekOverride}
        seasonStartDate={seasonStartDate}
        resolvedWeek={currentWeek}
        liveSeason={liveSeason}
        currentWeek={currentWeek}
        sourceRows={sourceRows}
        liveSeasonId={liveRaw?.id ?? null}
        gotwWeeks={gotwWeeks}
        gotwMap={gotwMap}
        gotwManagers={gotwManagers}
      />
    )
  }

  return (
    <main>
      <section className="hero">
        <div className="hero-sup">★ Live Season ★</div>
        <h1 className="hero-title">
          Current <em>Season.</em>
        </h1>
        <p className="hero-sub">
          Mark which season is currently in-progress. Pick&apos;ems, power rankings, and the weekly cron all use this.
          Only one season can be live at a time.
        </p>
        <div className="hero-meta">
          {liveSeason
            ? `Currently live: ${liveSeason.year}${currentWeek != null ? ` · Week ${currentWeek}` : ''}`
            : 'No live season — off-season'}
        </div>
      </section>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · Active</span>
          <span className="section-title">Which year is on?</span>
          <span className="section-meta">{rows.length} season{rows.length === 1 ? '' : 's'} on file</span>
        </div>
        <LiveSeasonForm
          leagueId={league.id}
          seasons={rows}
          weekOverride={weekOverride}
          seasonStartDate={seasonStartDate}
          resolvedWeek={currentWeek}
        />
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 02 · Live source</span>
          <span className="section-title">Which source updates weekly?</span>
          <span className="section-meta">{sourceRows.length} source{sourceRows.length === 1 ? '' : 's'}</span>
        </div>
        <SourcePicker leagueId={league.id} sources={sourceRows} />
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 03 · Game of the Week</span>
          <span className="section-title">Star one matchup —</span>
          <span className="section-meta">
            {gotwWeeks.length > 0 ? `${gotwWeeks.length} weeks on the schedule` : 'Set a live season first'}
          </span>
        </div>
        {liveRaw && gotwWeeks.length > 0 ? (
          <GotwPicker
            leagueId={league.id}
            seasonId={liveRaw.id}
            defaultWeek={currentWeek}
            weeks={gotwWeeks}
            currentGotw={gotwMap}
            managers={gotwManagers}
          />
        ) : (
          <div className="dc-empty">
            <div className="dc-empty-text">Pick a live season above to choose Games of the Week.</div>
          </div>
        )}
      </div>

      <SiteFooter />
    </main>
  )
}
