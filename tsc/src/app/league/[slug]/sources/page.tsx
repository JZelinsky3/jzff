import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { AddSourceForm } from './add-source-form'
import { SourceRow } from './source-row'

export default async function SourcesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: league } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()

  const { data: sourcesRaw } = await supabase
    .from('league_sources')
    .select('id, platform, external_id, label, walk_history, settings, last_synced_at, created_at')
    .eq('league_id', league.id)
    .order('created_at')

  // Scrub credentials out of `settings` before this object crosses into the
  // Client Component. ESPN private leagues store SWID + espn_s2 here, and we
  // don't want either landing in the page's HTML stream. We surface a boolean
  // (`hasCookies`) so the row UI can show "private" status without exposing
  // the values.
  type RawSource = NonNullable<typeof sourcesRaw>[number]
  const sources = (sourcesRaw ?? []).map((s: RawSource) => {
    const settings = (s.settings ?? {}) as Record<string, unknown>
    if (s.platform !== 'espn') {
      return { ...s, hasCookies: false }
    }
    const hasCookies = Boolean(settings.swid && settings.espn_s2)
    const safe: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(settings)) {
      if (k !== 'swid' && k !== 'espn_s2') safe[k] = v
    }
    return { ...s, settings: safe, hasCookies }
  })

  return (
    <main>
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Chapter V · Setup ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}>
          Source <em>ledger.</em>
        </h1>
        <p className="hero-sub">
          One archive can pull from many league IDs. Useful if your league moved between leagues
          — old seasons under an old ID, current seasons under a new one. Each source is fetched
          independently.
        </p>
      </section>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · On the ledger</span>
          <span className="section-title">Attached sources —</span>
          <span className="section-meta">{sources?.length ?? 0} in use</span>
        </div>

        {!sources || sources.length === 0 ? (
          <div className="dc-empty"><div className="dc-empty-text">No sources yet.</div></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: '.6rem' }}>
            {sources.map((s) => (
              <SourceRow key={s.id} source={s} leagueId={league.id} slug={slug} hasCookies={s.hasCookies} />
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 02 · Add another</span>
          <span className="section-title">A new league ID —</span>
          <span className="section-meta">Walk history or single season</span>
        </div>
        <p style={{ color: 'var(--cream-soft)', fontSize: '.92rem', lineHeight: 1.6, maxWidth: '60ch', marginBottom: '1.5rem' }}>
          Toggle <span className="text-gold">walk-history</span> on to follow Sleeper&apos;s{' '}
          <code style={{ background: 'var(--ink-soft)', padding: '.1rem .35rem', borderRadius: '2px', fontSize: '.85em' }}>previous_league_id</code>{' '}
          chain back from this ID. Off means only that one season is imported.
        </p>
        <div className="card" style={{ paddingBottom: '2rem' }}>
          <AddSourceForm leagueId={league.id} />
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
