import { notFound } from 'next/navigation'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { ImportWorkbench } from './import-workbench'
import type { KnownManager, LeaguePerson, ManualKind } from '@/lib/manualImport'
import type { PodiumSeason } from './podium-board'

export const metadata = { title: 'Enter data by hand' }

export default async function ImportPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()

  const [{ data: seasonRows }, { data: managerRows }, { data: profileRows }, { data: importRows }] = await Promise.all([
    supabase
      .from('seasons')
      .select('id, year, is_live, champion_manager_id, runner_up_manager_id, third_place_manager_id')
      .eq('league_id', league.id)
      .order('year'),
    supabase.from('managers').select('id, display_name, team_name, profile_id').eq('league_id', league.id).order('display_name'),
    // A rename on the Members page lands in canonical_name; it is the name the
    // league actually uses, so pickers show it instead of platform usernames.
    supabase.from('manager_profiles').select('id, canonical_name, is_hidden').eq('league_id', league.id),
    supabase
      .from('manual_imports')
      .select('id, season_id, kind, row_count, created_at')
      .eq('league_id', league.id),
  ])

  const seasons = (seasonRows ?? []).map((s) => ({ id: s.id as string, year: s.year as number }))

  // Every team name a manager has ever carried, so a paste that uses an old
  // team name still lands on the right person without the user mapping it.
  const seasonIds = seasons.map((s) => s.id)
  const aliasByManager = new Map<string, string[]>()
  // Teams in the most recent season on file: how many blank rows the
  // type-it-in grid opens with.
  const teamsBySeason = new Map<string, number>()
  const yearOf = new Map(seasons.map((s) => [s.id, s.year]))
  const lastYearByManager = new Map<string, number>()
  if (seasonIds.length > 0) {
    const { data: aliasRows } = await supabase
      .from('manager_seasons')
      .select('season_id, manager_id, team_name')
      .in('season_id', seasonIds)
    for (const row of aliasRows ?? []) {
      teamsBySeason.set(row.season_id as string, (teamsBySeason.get(row.season_id as string) ?? 0) + 1)
      const y = yearOf.get(row.season_id as string) ?? 0
      if (y > (lastYearByManager.get(row.manager_id as string) ?? 0)) lastYearByManager.set(row.manager_id as string, y)
      const name = (row.team_name as string | null)?.trim()
      if (!name) continue
      const list = aliasByManager.get(row.manager_id as string) ?? []
      if (!list.includes(name)) list.push(name)
      aliasByManager.set(row.manager_id as string, list)
    }
  }

  const profileById = new Map((profileRows ?? []).map((p) => [p.id as string, p]))
  const managers: KnownManager[] = (managerRows ?? []).map((m) => ({
    id: m.id as string,
    displayName: (m.display_name as string) ?? '',
    teamName: (m.team_name as string | null) ?? null,
    nickname: (profileById.get(m.profile_id as string)?.canonical_name as string | undefined)?.trim() || null,
    aliases: aliasByManager.get(m.id as string) ?? [],
  }))

  // One entry per person for the pickers. A merged profile (a Sleeper account
  // and an old NFL.com one, say) is one person, so it is one option, standing
  // in for whichever of their accounts played most recently.
  const byPerson = new Map<string, Array<{ id: string; displayName: string }>>()
  for (const m of managerRows ?? []) {
    const key = (m.profile_id as string | null) ?? `m:${m.id}`
    const list = byPerson.get(key) ?? []
    list.push({ id: m.id as string, displayName: (m.display_name as string) ?? '' })
    byPerson.set(key, list)
  }
  const people: LeaguePerson[] = [...byPerson.entries()].map(([key, accounts]) => {
    const profile = profileById.get(key)
    const primary = [...accounts].sort((a, b) => (lastYearByManager.get(b.id) ?? 0) - (lastYearByManager.get(a.id) ?? 0))[0]
    return {
      id: primary.id,
      label: (profile?.canonical_name as string | undefined)?.trim() || primary.displayName,
      managerIds: accounts.map((a) => a.id),
      hidden: !!profile?.is_hidden,
    }
  }).sort((a, b) => a.label.localeCompare(b.label))

  const latestWithTeams = [...seasons].reverse().find((s) => (teamsBySeason.get(s.id) ?? 0) > 0)
  const teamCount = latestWithTeams ? teamsBySeason.get(latestWithTeams.id)! : 10

  const yearBySeason = new Map(seasons.map((s) => [s.id, s.year]))
  const existing = (importRows ?? []).map((r) => ({
    id: r.id as string,
    seasonId: r.season_id as string,
    year: yearBySeason.get(r.season_id as string) ?? 0,
    kind: r.kind as ManualKind,
    rowCount: (r.row_count as number) ?? 0,
    createdAt: r.created_at as string,
  }))

  const podiumLocked = new Set(existing.filter((e) => e.kind === 'podium').map((e) => e.seasonId))
  const podiumSeasons: PodiumSeason[] = (seasonRows ?? []).map((s) => ({
    year: s.year as number,
    champion: (s.champion_manager_id as string | null) ?? null,
    runnerUp: (s.runner_up_manager_id as string | null) ?? null,
    third: (s.third_place_manager_id as string | null) ?? null,
    live: !!s.is_live,
    hasStandings: (teamsBySeason.get(s.id as string) ?? 0) > 0,
    handEntered: podiumLocked.has(s.id as string),
  }))

  return (
    <main className="lo-page lo-page--sources">
      <section className="lo-hero">
        <div className="lo-hero-kicker">Chapter I</div>
        <h1 className="lo-hero-title">By <em>Hand.</em></h1>
        <p className="lo-hero-standfirst">
          For the seasons no platform will give back. Name the champions year
          by year, or type in, paste or upload full standings, draft boards and
          weekly scores. Once a season is entered here, syncs leave it alone.
        </p>
        <div className="lo-hero-rules" aria-hidden />
      </section>

      <div className="lo-band">
        <div className="lo-note-grid" style={{ marginBottom: '2.4rem' }}>
          <div className="lo-note">
            <div className="lo-note-head"><span className="pin">✦</span> Two ways in</div>
            <div className="lo-note-body">
              <strong>Type it in</strong> one row per team, pick or game.
              Or <strong>paste</strong> rows straight out of Excel or Google
              Sheets, or drop a <strong>.csv</strong>. Column order does not
              matter and the headers can be worded however you like.
            </div>
          </div>
          <div className="lo-note steel">
            <div className="lo-note-head"><span className="pin">✦</span> Nothing is guessed</div>
            <div className="lo-note-body">
              Team names are matched to the managers already in this league,
              including team names they used in other seasons. Anything that
              does not match is handed back to you to map, never assigned to
              the closest-looking name.
            </div>
          </div>
          <div className="lo-note rust">
            <div className="lo-note-head"><span className="pin">✦</span> Syncs will not overwrite it</div>
            <div className="lo-note-body">
              A stage you enter here is recorded as hand-entered, and every
              platform sync skips it from then on. Undo that below if the
              platform ever starts serving the season again.
            </div>
          </div>
        </div>

        <div className="lo-folio">
          <span className="lo-folio-no">01</span>
          <span className="lo-folio-title">Enter a season</span>
          <span className="lo-folio-meta">{league.name}</span>
        </div>

        <ImportWorkbench
          leagueId={league.id}
          slug={slug}
          seasons={seasons}
          managers={managers}
          people={people}
          teamCount={teamCount}
          podiumSeasons={podiumSeasons}
          existing={existing}
        />

        <p className="dc-checkbox-hint" style={{ marginTop: '2rem' }}>
          Looking for a platform sync instead? <Link href={`/league/${slug}/sources`}>Sources</Link>.
        </p>
      </div>

      <SiteFooter />
    </main>
  )
}
