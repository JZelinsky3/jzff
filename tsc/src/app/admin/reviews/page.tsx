import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'

// Reader for the reviews collected by /review. Newest first, because during
// a send the only question is "what just came in". The distribution and
// average sit at the top so the shape of the feedback is visible without
// scrolling through it.

export const metadata = { robots: { index: false, follow: false } }

type ReviewRow = {
  id: string
  created_at: string
  email: string | null
  rating: number
  best_part: string | null
  needs_work: string | null
  can_quote: boolean
  quote_name: string | null
  source: string | null
}

const ADMIN_TZ = 'America/New_York'
function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: ADMIN_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Half-star aware: 4.5 draws four full and one half.
function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ color: 'var(--gold)', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ opacity: rating >= n ? 1 : rating >= n - 0.5 ? 0.5 : 0.2 }}>★</span>
      ))}
      <span style={{ color: 'var(--cream)', marginLeft: '.5rem', fontFamily: 'var(--mono)', fontSize: '.7rem' }}>
        {rating.toFixed(1)}
      </span>
    </span>
  )
}

export default async function AdminReviewsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isSiteAdmin(user.id))) notFound()

  const db = createAdminClient()
  const { data } = await db
    .from('site_reviews')
    .select('id, created_at, email, rating, best_part, needs_work, can_quote, quote_name, source')
    .order('created_at', { ascending: false })
  const reviews = (data ?? []) as ReviewRow[]

  const count = reviews.length
  const avg = count ? reviews.reduce((s, r) => s + Number(r.rating), 0) / count : 0
  // Buckets by whole star, with halves rounding up into the star above.
  const buckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    n: reviews.filter((r) => Math.ceil(Number(r.rating)) === star).length,
  }))
  const quotable = reviews.filter((r) => r.can_quote).length
  const withNotes = reviews.filter((r) => r.best_part || r.needs_work).length

  return (
    <main>
      <nav className="nav">
        <Link href="/admin" className="dc-nav-icon" aria-label="Back to admin">
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <div className="nav-center">
          <div className="nav-kicker">Site admin</div>
          <div className="nav-title">The <em>reviews.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: 'hidden' }} />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Collected at /review ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)' }}>
          {count === 0 ? <>Nothing <em>yet.</em></> : <>{avg.toFixed(2)} <em>average.</em></>}
        </h1>
        <div className="hero-meta">
          {count} review{count === 1 ? '' : 's'} · {withNotes} with notes · {quotable} quotable
        </div>
      </section>

      {count > 0 && (
        <section className="section" style={{ maxWidth: '760px', margin: '0 auto', padding: '0 1.25rem 1rem' }}>
          {buckets.map(({ star, n }) => (
            <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.35rem' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--cream-soft)', width: '2.5rem' }}>
                {star}★
              </span>
              <span style={{ flex: 1, height: 8, background: 'var(--ink-card)', border: '1px solid var(--ink-line)' }}>
                <span style={{ display: 'block', height: '100%', width: `${count ? (n / count) * 100 : 0}%`, background: 'var(--gold)' }} />
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--cream-soft)', width: '2rem', textAlign: 'right' }}>
                {n}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="section" style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1.25rem 3rem' }}>
        {count === 0 ? (
          <p style={{ color: 'var(--cream-soft)', textAlign: 'center', opacity: 0.7 }}>
            No reviews in yet. They land here the moment someone submits at /review.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--ink-line)', borderRadius: '2px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(232,200,137,.06)', textAlign: 'left' }}>
                  <th style={th}>Rating</th>
                  <th style={th}>From</th>
                  <th style={th}>Liked</th>
                  <th style={th}>Broken</th>
                  <th style={th}>Quote</th>
                  <th style={th}>When</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--ink-line)' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><Stars rating={Number(r.rating)} /></td>
                    <td style={td}>
                      <div>{r.email ?? '·'}</div>
                      {r.source && (
                        <div style={{ opacity: 0.5, fontFamily: 'var(--mono)', fontSize: '.62rem' }}>{r.source}</div>
                      )}
                    </td>
                    <td style={{ ...td, minWidth: 220, color: 'var(--cream)' }}>{r.best_part || '·'}</td>
                    <td style={{ ...td, minWidth: 220, color: 'var(--cream)' }}>{r.needs_work || '·'}</td>
                    <td style={td}>
                      {r.can_quote
                        ? <span style={{ color: 'var(--gold)' }}>Yes{r.quote_name ? ` · ${r.quote_name}` : ''}</span>
                        : '·'}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', opacity: 0.7 }}>{fmt(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  )
}

const th: React.CSSProperties = {
  padding: '.6rem .8rem',
  fontFamily: 'var(--mono)',
  fontSize: '.6rem',
  letterSpacing: '.18em',
  textTransform: 'uppercase',
  color: 'var(--gold)',
  whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '.6rem .8rem',
  color: 'var(--cream-soft)',
  verticalAlign: 'top',
}
