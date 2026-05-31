import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { loadManagerNameMap } from '@/lib/managerOptions'
import { deleteRivalry } from './actions'

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

  const [{ data: rivalries }, nameOf] = await Promise.all([
    supabase
      .from('rivalries')
      .select('id, name, manager_a_id, manager_b_id, created_at')
      .eq('league_id', league.id)
      .order('created_at'),
    // Resolves stored manager.id → canonical profile name when merged, so
    // renames + merges land immediately without re-saving the rivalry.
    loadManagerNameMap(supabase, league.id),
  ])

  async function remove(formData: FormData) {
    'use server'
    const id = formData.get('id') as string
    await deleteRivalry(id, slug)
  }

  return (
    <main>
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '2rem' }}>
        <div className="hero-sup">★ Rivalries ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}>
          The <em>feuds.</em>
        </h1>
        <p className="hero-sub">
          Hand-curated. Pick two managers, name the grudge, and it appears on your public almanac.
        </p>
        <div style={{ marginTop: '1.75rem' }}>
          <Link href={`/league/${slug}/rivalries/new`} className="dc-btn">+ Forge a rivalry →</Link>
        </div>
      </section>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · On file</span>
          <span className="section-title">{rivalries?.length ?? 0} rivalr{(rivalries?.length ?? 0) === 1 ? 'y' : 'ies'} —</span>
          <span className="section-meta">Oldest first</span>
        </div>

        {(!rivalries || rivalries.length === 0) ? (
          <div className="dc-empty">
            <div className="dc-empty-title">No rivalries yet.</div>
            <div className="dc-empty-text">Pair two managers and immortalize the grudge.</div>
            <Link href={`/league/${slug}/rivalries/new`} className="dc-btn">+ Forge a rivalry →</Link>
          </div>
        ) : (
          <div className="toc">
            <div className="toc-body">
              {rivalries.map((r) => (
                <div key={r.id} className="toc-row" style={{ cursor: 'default' }}>
                  <div className="toc-chapter">{(rivalries.indexOf(r) + 1).toString()}</div>
                  <div className="toc-title-wrap">
                    <div className="toc-title">{r.name}</div>
                    <div className="toc-desc">
                      {nameOf.get(r.manager_a_id) ?? '—'} vs {nameOf.get(r.manager_b_id) ?? '—'}
                    </div>
                  </div>
                  <form action={remove}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="dc-btn-ghost" style={{ fontSize: '.7rem' }}>
                      Delete
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <SiteFooter />
    </main>
  )
}
