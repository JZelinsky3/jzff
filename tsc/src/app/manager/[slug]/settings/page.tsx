import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerSummary } from '@/lib/manager/career'
import { SyncButton } from '../../../league/[slug]/sync-button'
import { ChronicleShell } from '../_shell'
import { RenameForm } from './rename-form'
import { AliasForm } from './alias-form'
import { removeLink, removeSource, deleteChronicle } from './actions'

export default async function ManagerSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const summary = await loadCareerSummary(slug, user.id)
  if (!summary) notFound()

  // Pull the link rows for the editable list — summary doesn't carry the
  // alias or the per-link platform/sync metadata we render here.
  const { data: links } = await supabase
    .from('career_links')
    .select('id, league_id, source, manager_external_id, display_name_in_league, league_alias, league:leagues!inner(id, name, slug, platform, last_synced_at, manager_view)')
    .eq('chronicle_id', summary.chronicle.id)
    .order('created_at', { ascending: true })

  type LinkRow = {
    id: string
    source: string
    manager_external_id: string
    display_name_in_league: string | null
    league_alias: string | null
    league: { id: string; name: string; slug: string; platform: string; last_synced_at: string | null; manager_view: boolean }
  }
  const linkRows = (links ?? []) as unknown as LinkRow[]

  // Year-range sources per league. ESPN/NFL leagues can carry several (e.g. one
  // NFL range per playoff-rules era); Sleeper/Yahoo are single-source.
  type SourceRow = {
    id: string
    league_id: string
    platform: string
    label: string | null
    settings: { season_start?: number; season_end?: number } | null
  }
  const leagueIds = [...new Set(linkRows.map((r) => r.league.id))]
  let sourcesByLeague = new Map<string, SourceRow[]>()
  if (leagueIds.length > 0) {
    const { data: srcRows } = await supabase
      .from('league_sources')
      .select('id, league_id, platform, label, settings')
      .in('league_id', leagueIds)
      .order('created_at', { ascending: true })
    sourcesByLeague = (srcRows ?? []).reduce((map, s) => {
      const arr = map.get(s.league_id as string) ?? []
      arr.push(s as SourceRow)
      map.set(s.league_id as string, arr)
      return map
    }, new Map<string, SourceRow[]>())
  }
  const sourceRangeLabel = (s: SourceRow): string => {
    if (s.label) return s.label
    const a = s.settings?.season_start
    const b = s.settings?.season_end
    if (a && b) return a === b ? `${a}` : `${a}–${b}`
    return 'all history'
  }

  const linkCount = linkRows.length
  const deck = linkCount === 0
    ? 'No leagues linked yet — start the chronicle by adding one.'
    : `${linkCount} league${linkCount === 1 ? '' : 's'} linked. Rename, re-sync, or remove any of them below.`

  const intro = (
    <>
      Three sections, all chronicle-scoped. <strong style={{ color: 'var(--gold)', fontFamily: 'var(--sans)', fontWeight: 600, fontStyle: 'normal' }}>Linked Leagues</strong> covers add/remove,
      hub aliases, and year-range sources. <strong style={{ color: 'var(--gold)', fontFamily: 'var(--sans)', fontWeight: 600, fontStyle: 'normal' }}>Chronicle Details</strong> edits the
      title and subtitle that show up on the front page. The <strong style={{ color: 'var(--rust)', fontFamily: 'var(--sans)', fontWeight: 600, fontStyle: 'normal' }}>Danger Zone</strong> at the
      bottom is the kill-switch — deletes the chronicle and sweeps any hub-only leagues that no other chronicle is using.
    </>
  )

  return (
    <ChronicleShell
      chronicle={summary}
      active="settings"
      edition="Chronicle Settings"
      deck={deck}
      intro={intro}
    >
      {/* ── §01 Linked Leagues ──────────────────────────────────── */}
      <section>
        <div className="mh-shead">
          <h3 className="mh-shead-title">§ 01 · Linked <em>Leagues</em></h3>
          <span className="mh-shead-meta">{linkCount} in your hub</span>
        </div>
        <p className="mh-section-intro">
          Every league that feeds this chronicle, in order added. Rename for the hub, re-sync the
          archive, or remove a link entirely. Hub-only leagues (auto-created for chronicle ingest)
          delete on the last removal; real public archives unlink only.
        </p>

        {linkRows.length === 0 ? (
          <div className="mh-empty" style={{ display: 'flex', flexDirection: 'column', gap: '.85rem', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '1.1rem' }}>No leagues yet.</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--cream-mute)' }}>
              Add your first league to start the chronicle.
            </div>
            <Link href="/manager/new" className="dc-btn">Add a league →</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {linkRows.map((row) => {
              const sources = sourcesByLeague.get(row.league.id) ?? []
              const isRanged = row.league.platform === 'espn' || row.league.platform === 'nfl'
              return (
                <article key={row.id} className="mh-box" style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '1rem', justifyContent: 'space-between' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '1.35rem', color: 'var(--cream)', lineHeight: 1.15 }}>
                        {row.league_alias?.trim() || row.league.name}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--cream-mute)', marginTop: '.3rem' }}>
                        {row.league.platform} · you: {row.display_name_in_league ?? row.manager_external_id}
                        {' · '}
                        {row.league.last_synced_at
                          ? `synced ${new Date(row.league.last_synced_at).toLocaleDateString()}`
                          : 'not synced'}
                      </div>
                      <AliasForm
                        slug={slug}
                        linkId={row.id}
                        archiveName={row.league.name}
                        currentAlias={row.league_alias}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
                      <SyncButton leagueId={row.league.id} />
                      <form action={removeLink}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="linkId" value={row.id} />
                        <button type="submit" className="dc-btn-ghost" style={{ color: 'var(--rust)' }}>
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Year-range sources — multiple for NFL/ESPN when playoff rules differ. */}
                  {(sources.length > 1 || isRanged) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', alignItems: 'center', borderTop: '1px dotted var(--ink-line)', paddingTop: '.7rem' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '.52rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', marginRight: '.4rem' }}>
                        Year ranges
                      </span>
                      {sources.map((s) => (
                        <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', padding: '.2rem .55rem', background: 'rgba(232,200,137,.06)', border: '1px solid var(--gold-deep)', fontFamily: 'var(--mono)', fontSize: '.65rem', color: 'var(--cream)' }}>
                          {sourceRangeLabel(s)}
                          {sources.length > 1 && (
                            <form action={removeSource} style={{ display: 'inline' }}>
                              <input type="hidden" name="slug" value={slug} />
                              <input type="hidden" name="sourceId" value={s.id} />
                              <button type="submit" title="Remove this range" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--rust)', cursor: 'pointer', fontSize: '.8rem', lineHeight: 1 }}>
                                ×
                              </button>
                            </form>
                          )}
                        </span>
                      ))}
                      {isRanged && (
                        <Link href="/manager/new" style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--gold)', textDecoration: 'underline' }}>
                          + add range
                        </Link>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
            <div style={{ marginTop: '.25rem' }}>
              <Link href="/manager/new" className="dc-btn-ghost" style={{ fontSize: '.7rem' }}>+ Add a league</Link>
            </div>
          </div>
        )}
      </section>

      {/* ── §02 Chronicle Details ───────────────────────────────── */}
      <section>
        <div className="mh-shead">
          <h3 className="mh-shead-title">§ 02 · Chronicle <em>Details</em></h3>
          <span className="mh-shead-meta">Title &amp; subtitle</span>
        </div>
        <p className="mh-section-intro">
          What renders at the top of every issue — the chronicle's display name (used as
          &ldquo;The {summary.chronicle.displayName} Chronicle&rdquo; throughout) and the optional
          subtitle that anchors the Grand Chronicle masthead. Keep the title short; let the
          subtitle do the framing.
        </p>
        <div className="mh-box">
          <RenameForm slug={slug} displayName={summary.chronicle.displayName} subtitle={summary.chronicle.subtitle} />
        </div>
      </section>

      {/* ── §03 Danger Zone ─────────────────────────────────────── */}
      <section>
        <div className="mh-shead">
          <h3 className="mh-shead-title">§ 03 · <em>Danger Zone</em></h3>
          <span className="mh-shead-meta">Delete chronicle</span>
        </div>
        <p className="mh-section-intro">
          Deletes this chronicle and unlinks every league. Hub-only leagues (auto-created when
          you added them with no other chronicle holding the link) get swept. Real public
          archives you own stay untouched.
        </p>
        <div className="mh-box rust">
          <div className="mh-box-mast" style={{ color: 'var(--rust)' }}>Permanent — no undo</div>
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '1rem', lineHeight: 1.6, color: 'var(--cream-soft)', marginBottom: '1rem' }}>
            Once you delete &ldquo;{summary.chronicle.displayName},&rdquo; the front page, every
            issue, the per-year deep-dives, and the manager hub URL are all gone. Re-syncing a
            league later builds a fresh chronicle from scratch.
          </p>
          <form action={deleteChronicle}>
            <input type="hidden" name="slug" value={slug} />
            <button type="submit" className="dc-btn" style={{ background: 'var(--rust)', borderColor: 'var(--rust)', color: 'var(--cream)' }}>
              Delete chronicle
            </button>
          </form>
        </div>
      </section>
    </ChronicleShell>
  )
}
