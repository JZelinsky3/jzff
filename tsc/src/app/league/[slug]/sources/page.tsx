import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { MobileSources } from '@/components/league/MobileSources'
import { getViewMode } from '@/lib/viewMode'
import { SourcesWorkbench } from './sources-workbench'

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

  if ((await getViewMode()) === 'mobile') {
    return (
      <MobileSources
        leagueId={league.id}
        slug={slug}
        sources={sources}
        syncedRange={syncedRange}
        yahooConnected={yahooConnected}
      />
    )
  }

  return (
    <main className="lo-page lo-page--sources">
      <section className="lo-hero">
        <div className="lo-hero-kicker">Chapter I</div>
        <h1 className="lo-hero-title">The <em>Sources.</em></h1>
        <p className="lo-hero-standfirst">
          One archive can pull from many league IDs. Useful when your league
          moved platforms mid-history: old seasons under one ID, current
          seasons under another. Each source syncs independently.
        </p>
        <div className="lo-hero-rules" aria-hidden />
      </section>

      <div className="lo-band">
        <div className="lo-note-grid" style={{ marginBottom: '2.4rem' }}>
          <div className="lo-note">
            <div className="lo-note-head"><span className="pin">✦</span> While a sync runs</div>
            <div className="lo-note-body">
              <strong>Stay on this page</strong> until it finishes. Closing the tab or
              navigating away cancels the run partway through. Most syncs take
              20 to 90 seconds; a deep multi-season walk can run a few minutes.
            </div>
          </div>
          <div className="lo-note rust">
            <div className="lo-note-head"><span className="pin">✦</span> The 2021 playoff shift</div>
            <div className="lo-note-body">
              The NFL added a 17th regular-season game in <strong>2021</strong>,
              and a lot of leagues pushed their fantasy playoffs a week later
              that year. If your league&apos;s playoff week changed, split your
              history into two sources: one for the old format, one for the new.
            </div>
          </div>
          <div className="lo-note steel">
            <div className="lo-note-head"><span className="pin">✦</span> Splitting by playoffs</div>
            <div className="lo-note-body">
              Split at whatever changed: playoff start week, playoff team count,
              even scoring. Each source gets its own year range and its own
              rules, and they sync independently, so nothing overlaps or
              double-counts as long as the ranges don&apos;t.
            </div>
          </div>
        </div>

        <div className="lo-folio">
          <span className="lo-folio-no">01</span>
          <span className="lo-folio-title">On the ledger</span>
          <span className="lo-folio-meta">{sources?.length ?? 0} in use</span>
        </div>

        <SourcesWorkbench
          leagueId={league.id}
          slug={slug}
          sources={sources}
          syncedRange={syncedRange}
          yahooConnected={yahooConnected}
        />
      </div>

      <SiteFooter />
    </main>
  )
}
