import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { loadManagerNameMap, loadManagerOptions } from '@/lib/managerOptions'
import { MobileRivalries } from '@/components/league/MobileRivalries'
import { getViewMode } from '@/lib/viewMode'
import { FeudRow } from './feud-row'

export default async function RivalriesPage({
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

  const [{ data: rivalries }, nameOf, managerOptions] = await Promise.all([
    supabase
      .from('rivalries')
      .select('id, name, manager_a_id, manager_b_id, created_at')
      .eq('league_id', league.id)
      .order('created_at'),
    // Resolves stored manager.id → canonical profile name when merged, so
    // renames + merges land immediately without re-saving the rivalry.
    loadManagerNameMap(supabase, league.id),
    // Feeds the in-place edit form's manager dropdowns.
    loadManagerOptions(supabase, league.id),
  ])
  const managers = managerOptions.map((m) => ({ id: m.id, name: m.name }))

  if ((await getViewMode()) === 'mobile') {
    return (
      <MobileRivalries
        slug={slug}
        rivalries={(rivalries ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          manager_a_id: r.manager_a_id,
          manager_b_id: r.manager_b_id,
        }))}
        nameOf={nameOf}
      />
    )
  }

  return (
    <main className="lo-page lo-page--rivalries">
      <section className="lo-hero">
        <div className="lo-hero-kicker">Chapter III</div>
        <h1 className="lo-hero-title">The <em>Feuds.</em></h1>
        <p className="lo-hero-standfirst">
          Hand-curated. Pick two managers, name the grudge, and it appears on
          your public almanac with its own page.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.6rem' }}>
          <Link href={`/league/${slug}/rivalries/new`} className="lo-btn">+ Forge a rivalry</Link>
        </div>
        <div className="lo-hero-rules" aria-hidden />
      </section>

      <div className="lo-band">
        <div className="lo-folio">
          <span className="lo-folio-no">01</span>
          <span className="lo-folio-title">
            {rivalries?.length ?? 0} rivalr{(rivalries?.length ?? 0) === 1 ? 'y' : 'ies'} on file
          </span>
          <span className="lo-folio-meta">Oldest first</span>
        </div>

        {(!rivalries || rivalries.length === 0) ? (
          <div className="lo-empty">
            <div className="lo-empty-title">No rivalries yet.</div>
            <div className="lo-empty-text">Pair two managers and immortalize the grudge.</div>
            <Link href={`/league/${slug}/rivalries/new`} className="lo-btn">+ Forge a rivalry</Link>
          </div>
        ) : (
          <div className="lo-feud-list">
            {rivalries.map((r, i) => (
              <FeudRow
                key={r.id}
                index={i}
                leagueId={league.id}
                slug={slug}
                managers={managers}
                feud={{
                  id: r.id,
                  name: r.name,
                  managerAId: r.manager_a_id,
                  managerBId: r.manager_b_id,
                  aName: nameOf.get(r.manager_a_id) ?? 'Unknown',
                  bName: nameOf.get(r.manager_b_id) ?? 'Unknown',
                }}
              />
            ))}
          </div>
        )}
      </div>

      <SiteFooter />
    </main>
  )
}
