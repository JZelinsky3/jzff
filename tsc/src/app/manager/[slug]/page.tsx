import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerSummary } from '@/lib/manager/career'
import { ChronicleBook } from './chronicle-book'

export default async function ChroniclePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ added?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const summary = await loadCareerSummary(slug, user.id)
  if (!summary) notFound()

  return (
    <main>
      <section className="hero" style={{ paddingTop: '2.5rem', paddingBottom: '1rem' }}>
        <div className="hero-sup">★ The Chronicle ★</div>
        <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '.5rem' }}>
          <Link href="/manager/new" className="dc-btn">+ Add a league</Link>
          <Link href={`/manager/${slug}/settings`} className="dc-btn-ghost">Manage hub</Link>
          <Link href="/dashboard" className="dc-btn-ghost">← Dashboard</Link>
        </div>
      </section>

      {sp.added && summary.pendingCount > 0 && (
        <div
          className="dc-banner"
          style={{
            maxWidth: '880px', margin: '0 auto 1rem',
            padding: '1rem 1.25rem',
            background: 'rgba(232,200,137,.06)',
            border: '1px solid var(--gold-deep)',
            borderRadius: '2px',
          }}
        >
          <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '.25rem' }}>
            ★ League added
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem', color: 'var(--cream)' }}>
            {summary.pendingCount} {summary.pendingCount === 1 ? 'league needs' : 'leagues need'} a sync before they fill your book.{' '}
            <Link href={`/manager/${slug}/settings`} style={{ color: 'var(--gold)' }}>Sync now →</Link>
          </div>
        </div>
      )}

      <ChronicleBook summary={summary} />
    </main>
  )
}
