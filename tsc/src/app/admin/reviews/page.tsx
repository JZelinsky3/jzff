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
  rating_design: number | null
  rating_navigation: number | null
  rating_speed: number | null
  rating_value: number | null
  used_areas: string[] | null
  // Singular columns are pre-0067 rows; the arrays are what the form writes
  // now. Read through `favs()` / `leasts()` rather than either one directly.
  favorite_area: string | null
  least_favorite_area: string | null
  favorite_areas: string[] | null
  least_favorite_areas: string[] | null
  wish: string | null
  best_part: string | null
  needs_work: string | null
  can_quote: boolean
  quote_name: string | null
  source: string | null
}

// Sub-ratings, in form order. `col` is the column; `label` is what the
// question actually asked, shortened to fit a table header.
const ASPECTS = [
  { col: 'rating_design', label: 'Design' },
  { col: 'rating_navigation', label: 'Getting around' },
  { col: 'rating_speed', label: 'Speed' },
  { col: 'rating_value', label: 'Fair price' },
] as const

// Favourite / least favourite per row, new array column first and the
// pre-0067 single-text column as the fallback.
const favs = (r: ReviewRow) => r.favorite_areas ?? (r.favorite_area ? [r.favorite_area] : [])
const leasts = (r: ReviewRow) =>
  r.least_favorite_areas ?? (r.least_favorite_area ? [r.least_favorite_area] : [])

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
    .select('id, created_at, email, rating, rating_design, rating_navigation, rating_speed, rating_value, used_areas, favorite_area, least_favorite_area, favorite_areas, least_favorite_areas, wish, best_part, needs_work, can_quote, quote_name, source')
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
  const withNotes = reviews.filter((r) => r.best_part || r.needs_work || r.wish).length

  // Sub-rating averages, each over the people who answered that one question.
  // Averaging a skipped answer as zero would make an unpopular question look
  // like an unpopular feature.
  const aspectAvgs = ASPECTS.map(({ col, label }) => {
    const vals = reviews.map((r) => r[col]).filter((v): v is number => v != null).map(Number)
    return { label, n: vals.length, avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null }
  })

  // Which surfaces get named most often, so "what do people actually open"
  // is answerable without reading every row.
  // Used / favourite / least-favourite are tallied together so one strip
  // answers all three at a glance: how many opened it, how many named it
  // best, how many named it worst.
  const tally = new Map<string, { used: number; best: number; worst: number }>()
  const bump = (name: string, k: 'used' | 'best' | 'worst') => {
    const row = tally.get(name) ?? { used: 0, best: 0, worst: 0 }
    row[k]++
    tally.set(name, row)
  }
  for (const r of reviews) {
    for (const a of r.used_areas ?? []) bump(a, 'used')
    for (const a of favs(r)) bump(a, 'best')
    for (const a of leasts(r)) bump(a, 'worst')
  }
  const areas = [...tally.entries()].sort(
    (a, b) => (b[1].used + b[1].best + b[1].worst) - (a[1].used + a[1].best + a[1].worst),
  )

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

      {count > 0 && (
        <section className="section" style={{ maxWidth: '760px', margin: '0 auto', padding: '.75rem 1.25rem 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem' }}>
            {aspectAvgs.map(({ label, n, avg }) => (
              <div key={label} style={{ border: '1px solid var(--ink-line)', padding: '.7rem .8rem' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                  {label}
                </div>
                <div style={{ color: 'var(--cream)', fontSize: '1.3rem', fontFamily: 'var(--serif)', marginTop: '.2rem' }}>
                  {avg === null ? '·' : avg.toFixed(2)}
                </div>
                <div style={{ color: 'var(--cream-soft)', opacity: 0.6, fontSize: '.68rem' }}>
                  {n} answered
                </div>
              </div>
            ))}
          </div>
          {areas.length > 0 && (
            <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginTop: '.9rem' }}>
              {areas.map(([name, t]) => (
                <span
                  key={name}
                  title={`${t.used} used · ${t.best} favorite · ${t.worst} least favorite`}
                  style={{
                    border: '1px solid var(--ink-line)', padding: '.25rem .6rem',
                    fontSize: '.72rem', color: 'var(--cream-soft)',
                  }}
                >
                  {name}{' '}
                  <strong style={{ color: 'var(--gold)' }}>{t.used}</strong>
                  {t.best > 0 && <span style={{ color: 'var(--gold)' }}> · ♥{t.best}</span>}
                  {t.worst > 0 && <span style={{ color: 'var(--rust, #a04830)' }}> · ✗{t.worst}</span>}
                </span>
              ))}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--cream-soft)', opacity: 0.55, marginTop: '.5rem' }}>
              Count = used · ♥ favorite · ✗ least favorite
            </div>
            </>
          )}
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
                  <th style={th}>Detail</th>
                  <th style={th}>Liked</th>
                  <th style={th}>Broken</th>
                  <th style={th}>Wanted</th>
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
                    <td style={{ ...td, minWidth: 150 }}>
                      {ASPECTS.every(({ col }) => r[col] == null) && !r.used_areas?.length
                        && !favs(r).length && !leasts(r).length ? '·' : (
                        <>
                          {ASPECTS.filter(({ col }) => r[col] != null).map(({ col, label }) => (
                            <div key={col} style={{ whiteSpace: 'nowrap', fontSize: '.74rem' }}>
                              {label}{' '}
                              <span style={{ color: 'var(--gold)', fontFamily: 'var(--mono)' }}>
                                {Number(r[col]).toFixed(1)}
                              </span>
                            </div>
                          ))}
                          {!!r.used_areas?.length && (
                            <div style={{ opacity: 0.6, fontSize: '.68rem', marginTop: '.25rem' }}>
                              {r.used_areas.join(' · ')}
                            </div>
                          )}
                          {!!favs(r).length && (
                            <div style={{ fontSize: '.68rem', marginTop: '.2rem', color: 'var(--gold)' }}>
                              ♥ {favs(r).join(' · ')}
                            </div>
                          )}
                          {!!leasts(r).length && (
                            <div style={{ fontSize: '.68rem', marginTop: '.1rem', color: 'var(--rust, #a04830)' }}>
                              ✗ {leasts(r).join(' · ')}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ ...td, minWidth: 200, color: 'var(--cream)' }}>{r.best_part || '·'}</td>
                    <td style={{ ...td, minWidth: 200, color: 'var(--cream)' }}>{r.needs_work || '·'}</td>
                    <td style={{ ...td, minWidth: 180, color: 'var(--cream)' }}>{r.wish || '·'}</td>
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
