import { notFound } from 'next/navigation'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { ImportWorkbench } from './import-workbench'
import type { KnownManager } from '@/lib/manualImport'

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

  const [{ data: seasonRows }, { data: managerRows }, { data: importRows }] = await Promise.all([
    supabase.from('seasons').select('id, year').eq('league_id', league.id).order('year'),
    supabase.from('managers').select('id, display_name, team_name').eq('league_id', league.id).order('display_name'),
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
  if (seasonIds.length > 0) {
    const { data: aliasRows } = await supabase
      .from('manager_seasons')
      .select('manager_id, team_name')
      .in('season_id', seasonIds)
    for (const row of aliasRows ?? []) {
      const name = (row.team_name as string | null)?.trim()
      if (!name) continue
      const list = aliasByManager.get(row.manager_id as string) ?? []
      if (!list.includes(name)) list.push(name)
      aliasByManager.set(row.manager_id as string, list)
    }
  }

  const managers: KnownManager[] = (managerRows ?? []).map((m) => ({
    id: m.id as string,
    displayName: (m.display_name as string) ?? '',
    teamName: (m.team_name as string | null) ?? null,
    aliases: aliasByManager.get(m.id as string) ?? [],
  }))

  const yearBySeason = new Map(seasons.map((s) => [s.id, s.year]))
  const existing = (importRows ?? []).map((r) => ({
    id: r.id as string,
    seasonId: r.season_id as string,
    year: yearBySeason.get(r.season_id as string) ?? 0,
    kind: r.kind as 'standings' | 'drafts' | 'matchups',
    rowCount: (r.row_count as number) ?? 0,
    createdAt: r.created_at as string,
  }))

  return (
    <main className="lo-page lo-page--sources">
      <section className="lo-hero">
        <div className="lo-hero-kicker">Chapter I</div>
        <h1 className="lo-hero-title">By <em>Hand.</em></h1>
        <p className="lo-hero-standfirst">
          For the seasons no platform will give back. Paste a table or drop a
          file and it becomes real history: standings, draft boards, weekly
          scores. Once a season is entered here, syncs leave it alone.
        </p>
        <div className="lo-hero-rules" aria-hidden />
      </section>

      <div className="lo-band">
        <div className="lo-note-grid" style={{ marginBottom: '2.4rem' }}>
          <div className="lo-note">
            <div className="lo-note-head"><span className="pin">✦</span> Where the text comes from</div>
            <div className="lo-note-body">
              Anything a spreadsheet can produce. Copy rows straight out of
              Excel or Google Sheets and paste them in, or drop a
              <strong> .csv</strong>. Column order does not matter and the
              headers can be worded however you like.
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
