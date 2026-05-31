import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { SyncButton } from '../../../league/[slug]/sync-button'
import { RenameForm } from './rename-form'
import { removeLink, deleteChronicle } from './actions'

export default async function ManagerSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: chronicle } = await supabase
    .from('career_chronicles')
    .select('id, slug, display_name, subtitle')
    .eq('slug', slug)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!chronicle) notFound()

  const { data: links } = await supabase
    .from('career_links')
    .select('id, league_id, source, manager_external_id, display_name_in_league, league:leagues!inner(id, name, slug, platform, last_synced_at, manager_view)')
    .eq('chronicle_id', chronicle.id)
    .order('created_at', { ascending: true })

  type LinkRow = {
    id: string
    source: string
    manager_external_id: string
    display_name_in_league: string | null
    league: { id: string; name: string; slug: string; platform: string; last_synced_at: string | null; manager_view: boolean }
  }
  const linkRows = (links ?? []) as unknown as LinkRow[]

  return (
    <main>
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1rem' }}>
        <div className="hero-sup">★ Manage hub ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
          {chronicle.display_name}
        </h1>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href={`/manager/${slug}`} className="dc-btn">Open the book →</Link>
          <Link href="/manager/new" className="dc-btn-ghost">+ Add a league</Link>
        </div>
      </section>

      <div className="section" style={{ maxWidth: '760px' }}>
        <div className="section-header">
          <span className="section-num">§ 01 · Linked leagues</span>
          <span className="section-title">{linkRows.length} in your hub —</span>
        </div>

        {linkRows.length === 0 ? (
          <div className="dc-empty">
            <div className="dc-empty-title">No leagues yet.</div>
            <div className="dc-empty-text">Add your first league to start the chronicle.</div>
            <Link href="/manager/new" className="dc-btn">Add a league →</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            {linkRows.map((row) => (
              <div key={row.id} className="dc-card-static" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: '1.15rem', color: 'var(--cream)' }}>
                    {row.league.name}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--cream-soft)', marginTop: '.2rem' }}>
                    {row.league.platform} · you: {row.display_name_in_league ?? row.manager_external_id}
                    {' · '}
                    {row.league.last_synced_at
                      ? `synced ${new Date(row.league.last_synced_at).toLocaleDateString()}`
                      : 'not synced'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
                  <SyncButton leagueId={row.league.id} />
                  <form action={removeLink}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="linkId" value={row.id} />
                    <button type="submit" className="dc-btn-ghost" style={{ color: 'var(--rust, #a04830)' }}>
                      Remove
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section" style={{ maxWidth: '760px' }}>
        <div className="section-header">
          <span className="section-num">§ 02 · Chronicle details</span>
          <span className="section-title">Title &amp; subtitle —</span>
        </div>
        <div className="dc-card-static">
          <RenameForm slug={slug} displayName={chronicle.display_name} subtitle={chronicle.subtitle} />
        </div>
      </div>

      <div className="section" style={{ maxWidth: '760px' }}>
        <div className="section-header">
          <span className="section-num">§ 03 · Danger zone</span>
          <span className="section-title">Delete chronicle —</span>
        </div>
        <div className="dc-card-static" style={{ borderColor: 'rgba(160,72,48,.4)' }}>
          <p style={{ opacity: 0.8, lineHeight: 1.6, marginBottom: '1rem' }}>
            Deletes this chronicle and unlinks every league. Hub-only leagues with no other
            link are removed; any public archives you own are untouched.
          </p>
          <form action={deleteChronicle}>
            <input type="hidden" name="slug" value={slug} />
            <button type="submit" className="dc-btn" style={{ background: 'var(--rust, #a04830)', borderColor: 'var(--rust, #a04830)' }}>
              Delete chronicle
            </button>
          </form>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
