import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerSummary } from '@/lib/manager/career'

// Placeholder. The full Manager Hub UI is being rebuilt from scratch — this
// page exists only so the dashboard's "Manager Hub" link doesn't 404 in the
// meantime. Data still loads (loadCareerSummary stays the source of truth);
// styling and layout are intentionally bare so the redesign starts clean.

export default async function ManagerHubPlaceholder({
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

  return (
    <main style={{ padding: '4rem 2rem', textAlign: 'center', maxWidth: '40rem', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '.5rem' }}>{summary.chronicle.displayName}</h1>
      <p style={{ opacity: 0.7, marginBottom: '2rem' }}>
        Manager Hub — redesign in progress. {summary.totals.leagues} {summary.totals.leagues === 1 ? 'league' : 'leagues'} linked, {summary.totals.seasonsPlayed} seasons on file.
      </p>
      <p>
        <Link href={`/manager/${slug}/settings`}>Manager Setup</Link>
        {' · '}
        <Link href="/manager/new">Add a league</Link>
        {' · '}
        <Link href="/dashboard">← Dashboard</Link>
      </p>
    </main>
  )
}
