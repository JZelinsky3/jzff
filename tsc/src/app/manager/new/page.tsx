import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { canAddCareerLink } from '@/lib/stripe'
import { AddToHubForm } from './pick-self-form'

export default async function NewManagerLeaguePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const gate = await canAddCareerLink(user.id)

  // Where "back" should go — to the chronicle if one exists, else the dashboard.
  const { data: chron } = await supabase
    .from('career_chronicles')
    .select('slug')
    .eq('owner_id', user.id)
    .maybeSingle()
  const backHref = chron ? `/manager/${chron.slug}` : '/dashboard'

  return (
    <main>
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Manager Hub ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}>
          Add yourself to <em>the book.</em>
        </h1>
        <p className="hero-sub">
          Paste a league ID, pick which member is you, and we&apos;ll thread that league&apos;s
          history into your career chronicle. Sleeper first — ESPN, Yahoo &amp; NFL.com soon.
        </p>
      </section>

      <div className="section" style={{ maxWidth: '620px' }}>
        {gate.ok ? (
          <div className="dc-card-static">
            <AddToHubForm />
          </div>
        ) : (
          <UpgradePrompt reason={gate.reason} current={gate.current} limit={gate.limit} message={gate.message} />
        )}

        <div style={{ marginTop: '2rem' }}>
          <Link href={backHref} className="dc-btn-ghost">← Back</Link>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}

function UpgradePrompt({
  reason,
  current,
  limit,
  message,
}: {
  reason: 'no_subscription' | 'tier_limit'
  current?: number
  limit?: number
  message: string
}) {
  const isLimit = reason === 'tier_limit'
  return (
    <div className="dc-card-static">
      <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)' }}>
        {isLimit ? 'Hub limit reached' : 'Subscription required'}
      </div>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.8rem', margin: '.5rem 0 .35rem' }}>
        {isLimit
          ? <>You&apos;re at <em style={{ color: 'var(--gold)' }}>{current}/{limit}</em> linked leagues.</>
          : <>Subscribe to <em style={{ color: 'var(--gold)' }}>build your hub.</em></>}
      </h2>
      <p style={{ opacity: 0.75, lineHeight: 1.6, fontSize: '.95rem', marginBottom: '1.25rem' }}>{message}</p>
      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
        <Link href="/pricing" className="dc-btn">{isLimit ? 'Upgrade →' : 'See pricing →'}</Link>
        {isLimit && <Link href="/account" className="dc-btn-ghost">Manage subscription</Link>}
      </div>
    </div>
  )
}
