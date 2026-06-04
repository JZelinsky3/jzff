import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { AddSourceForm } from './add-source-form'
import { SourceRow } from './source-row'

// Round-robin distribution preserves row-major reading order: items[0,1,2]
// land at the top of col 0, 1, 2 respectively; items[3,4,5] form the next
// row. Each returned column is rendered as an independent flex stack so
// expanding a card only shifts items below it WITHIN the same column.
function splitColumns<T>(items: T[], cols: number): T[][] {
  const out: T[][] = Array.from({ length: cols }, () => [])
  items.forEach((item, i) => { out[i % cols].push(item) })
  return out
}

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

  // Yahoo sources require a per-user OAuth token. Tell the form whether the
  // signed-in viewer already connected so it can render the right CTA
  // (Connect Yahoo → vs. league picker).
  const { data: { user } } = await supabase.auth.getUser()
  let yahooConnected = false
  if (user) {
    const { data: tok } = await supabase
      .from('yahoo_tokens')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    yahooConnected = !!tok
  }

  const { data: sourcesRaw } = await supabase
    .from('league_sources')
    .select('id, platform, external_id, label, walk_history, settings, last_synced_at, created_at')
    .eq('league_id', league.id)
    .order('created_at')

  // Pull the league's actual synced year range so we can show a hint like
  // "Pulled 2019–2025" on Sleeper sources (which don't have an explicit
  // season_start/_end in settings). Showing it on every row would be
  // misleading when multiple sources contribute — but for the common case
  // of one Sleeper source per league it's a useful at-a-glance signal.
  const { data: seasonRows } = await supabase
    .from('seasons')
    .select('year')
    .eq('league_id', league.id)
  const years = (seasonRows ?? []).map((r) => r.year as number).sort((a, b) => a - b)
  const syncedRange =
    years.length === 0
      ? null
      : years[0] === years[years.length - 1]
      ? `Pulled ${years[0]}`
      : `Pulled ${years[0]}–${years[years.length - 1]}`

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
          Source <em>Ledger.</em>
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
          // Pre-distribute sources into independent columns so expanding one
          // card only pushes items in the SAME column. Each column is a flex
          // stack; the outer grid arranges the columns side-by-side. The
          // dc-source-ledger class swaps column count by viewport in
          // globals.css — three trees are rendered (3/2/1 col) and the
          // unused two are display:none. Distribution is round-robin so
          // reading row-major still gives original insertion order.
          <>
            <div className="dc-source-ledger dc-source-ledger-3">
              {splitColumns(sources, 3).map((col, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                  {col.map((s) => (
                    <SourceRow key={s.id} source={s} leagueId={league.id} slug={slug} hasCookies={s.hasCookies} syncedRange={syncedRange} />
                  ))}
                </div>
              ))}
            </div>
            <div className="dc-source-ledger dc-source-ledger-2">
              {splitColumns(sources, 2).map((col, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                  {col.map((s) => (
                    <SourceRow key={s.id} source={s} leagueId={league.id} slug={slug} hasCookies={s.hasCookies} syncedRange={syncedRange} />
                  ))}
                </div>
              ))}
            </div>
            <div className="dc-source-ledger dc-source-ledger-1">
              {sources.map((s) => (
                <SourceRow key={s.id} source={s} leagueId={league.id} slug={slug} hasCookies={s.hasCookies} syncedRange={syncedRange} />
              ))}
            </div>
          </>
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
          <AddSourceForm leagueId={league.id} slug={slug} yahooConnected={yahooConnected} />
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
