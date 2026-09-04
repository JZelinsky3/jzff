import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'

// Who keeps coming back.
//
// Reads user_visits (one row per user per day, written by /api/visit) rather
// than auth.users.last_sign_in_at. Sign-in stamps answer a different and much
// less useful question: Supabase sessions refresh for weeks, so a daily user
// signs in once and their sign-in date then sits still forever. Both are on
// the page -- "Last seen" is the real activity, "Last sign-in" is there to
// show how far apart the two drift.
//
// Nothing here existed before 2026-09-04, so the history starts the day the
// ping shipped. There is no backfill to run: the visits were never recorded,
// and inventing them from created_at would be a graph of fiction.

export const metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const SITE_TZ = 'America/New_York'
const WINDOW_DAYS = 90
const STRIP_DAYS = 30

type VisitRow = { user_id: string; day: string; hits: number; last_seen_at: string; entry_path: string | null }

function dayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SITE_TZ }).format(d)
}

// Walk back N calendar days from today, anchored at noon UTC so a DST shift
// can't repeat or skip a column.
function recentDays(n: number): string[] {
  const [y, m, d] = dayKey(new Date()).split('-').map(Number)
  const anchor = Date.UTC(y, m - 1, d, 12)
  return Array.from({ length: n }, (_, i) =>
    new Date(anchor - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '·'
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: SITE_TZ, month: 'short', day: 'numeric', year: '2-digit',
  })
}

function fmtStamp(iso: string | null): string {
  if (!iso) return '·'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: SITE_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Sequential, one hue, light to dark -- the whole scale is the site's gold at
// four steps of presence. Never a second hue: more visits is a magnitude, not
// a different kind of thing.
function cellStyle(hits: number): React.CSSProperties {
  if (hits <= 0) return { background: 'transparent', border: '1px solid var(--ink-line)' }
  const opacity = hits === 1 ? 0.38 : hits === 2 ? 0.62 : hits === 3 ? 0.82 : 1
  return { background: `color-mix(in srgb, var(--gold) ${opacity * 100}%, transparent)`, border: '1px solid transparent' }
}

export default async function AdminVisitorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isSiteAdmin(user.id))) notFound()

  const db = createAdminClient()
  const floor = recentDays(WINDOW_DAYS)[0]

  const [visitsRes, profilesRes, authRes] = await Promise.all([
    db.from('user_visits')
      .select('user_id, day, hits, last_seen_at, entry_path')
      .gte('day', floor)
      .order('day', { ascending: false })
      .limit(50_000),
    db.from('profiles').select('id, display_name, created_at'),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ])

  // A missing table (migration 0066 not run yet) should say so, not render an
  // empty page that looks like "nobody came back".
  const tableMissing = !!visitsRes.error
  const visits = (visitsRes.data ?? []) as VisitRow[]

  const profileById = new Map(
    (profilesRes.data ?? []).map((p) => [p.id as string, p as { display_name: string | null; created_at: string }]),
  )
  const authById = new Map(
    (authRes.data?.users ?? []).map((u) => [u.id, u]),
  )

  const days30 = recentDays(STRIP_DAYS)
  const today = days30[days30.length - 1]
  const last7 = new Set(days30.slice(-7))
  const last30 = new Set(days30)

  // Per-user rollup.
  type Agg = {
    userId: string
    daysActive: number
    totalHits: number
    firstDay: string
    lastDay: string
    lastSeenAt: string
    byDay: Map<string, number>
  }
  const agg = new Map<string, Agg>()
  for (const v of visits) {
    const cur = agg.get(v.user_id)
    if (!cur) {
      agg.set(v.user_id, {
        userId: v.user_id,
        daysActive: 1,
        totalHits: v.hits,
        firstDay: v.day,
        lastDay: v.day,
        lastSeenAt: v.last_seen_at,
        byDay: new Map([[v.day, v.hits]]),
      })
      continue
    }
    cur.daysActive++
    cur.totalHits += v.hits
    if (v.day < cur.firstDay) cur.firstDay = v.day
    if (v.day > cur.lastDay) { cur.lastDay = v.day; cur.lastSeenAt = v.last_seen_at }
    cur.byDay.set(v.day, v.hits)
  }
  const people = [...agg.values()].sort((a, b) => b.lastDay.localeCompare(a.lastDay))

  // Headline counts. "Returning" is the number that answers Joey's question:
  // more than one distinct day on the site. One day is a look; two is a habit
  // forming.
  const activeToday = visits.filter((v) => v.day === today).length
  const active7 = new Set(visits.filter((v) => last7.has(v.day)).map((v) => v.user_id)).size
  const active30 = new Set(visits.filter((v) => last30.has(v.day)).map((v) => v.user_id)).size
  const returning = people.filter((p) => p.daysActive >= 2).length
  const returnRate = people.length ? Math.round((returning / people.length) * 100) : 0
  const loyal = people.filter((p) => p.daysActive >= 5).length

  // Daily actives for the strip chart.
  const dailyActive = new Map<string, number>()
  for (const v of visits) {
    if (last30.has(v.day)) dailyActive.set(v.day, (dailyActive.get(v.day) ?? 0) + 1)
  }
  const peakDaily = Math.max(1, ...days30.map((d) => dailyActive.get(d) ?? 0))

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
          <div className="nav-title">Who <em>came back.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: 'hidden' }} />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Last {WINDOW_DAYS} days ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)' }}>
          {people.length === 0 ? <>Nothing <em>yet.</em></> : <>{returnRate}% <em>came back.</em></>}
        </h1>
        <div className="hero-meta">
          {people.length} tracked · {returning} on two days or more · {loyal} on five or more
        </div>
      </section>

      {tableMissing && (
        <section className="section" style={{ maxWidth: '760px', margin: '0 auto', padding: '0 1.25rem 1rem' }}>
          <div style={{ border: '1px solid rgba(160,72,48,.4)', background: 'rgba(160,72,48,.08)', padding: '1rem 1.15rem', color: 'var(--cream)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--rust, #a04830)', marginBottom: '.3rem' }}>
              ✗ No table
            </div>
            <code>user_visits</code> could not be read. Run migration{' '}
            <code>0066_user_visits.sql</code>, then reload. Until it exists, nothing is being recorded.
          </div>
        </section>
      )}

      {/* Headline tiles. Plain numbers, no plot -- four counts do not need a
          chart, and a bar of four unrelated measures would invent a
          comparison that is not there. */}
      <section className="section" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 1.25rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.75rem' }}>
          {[
            { label: 'Here today', value: activeToday },
            { label: 'Last 7 days', value: active7 },
            { label: 'Last 30 days', value: active30 },
            { label: 'Repeat visitors', value: returning },
          ].map((t) => (
            <div key={t.label} style={{ border: '1px solid var(--ink-line)', padding: '.75rem .85rem' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                {t.label}
              </div>
              <div style={{ color: 'var(--cream)', fontSize: '1.6rem', fontFamily: 'var(--serif)', marginTop: '.15rem' }}>
                {t.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Daily actives, 30 days. One series, so no legend -- the heading
          names it -- and only the peak is labelled rather than every bar. */}
      <section className="section" style={{ maxWidth: '900px', margin: '0 auto', padding: '.5rem 1.25rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', marginBottom: '.5rem' }}>
          <h2 style={{ fontFamily: 'var(--mono)', fontSize: '.65rem', letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--gold)', margin: 0 }}>
            People on the site, by day
          </h2>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', color: 'var(--cream-soft)', opacity: 0.6 }}>
            peak {peakDaily}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90, borderBottom: '1px solid var(--ink-line)' }}>
          {days30.map((d) => {
            const n = dailyActive.get(d) ?? 0
            return (
              <div
                key={d}
                title={`${fmtDate(`${d}T12:00:00Z`)} · ${n} ${n === 1 ? 'person' : 'people'}`}
                style={{
                  flex: 1,
                  height: `${Math.max(n === 0 ? 2 : 6, (n / peakDaily) * 100)}%`,
                  background: n === 0 ? 'var(--ink-line)' : 'var(--gold)',
                  borderRadius: '2px 2px 0 0',
                  minWidth: 3,
                }}
              />
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--cream-soft)', opacity: 0.55, marginTop: '.35rem' }}>
          <span>{fmtDate(`${days30[0]}T12:00:00Z`)}</span>
          <span>Today</span>
        </div>
      </section>

      <section className="section" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 1.25rem 3rem' }}>
        {people.length === 0 ? (
          <p style={{ color: 'var(--cream-soft)', textAlign: 'center', opacity: 0.7 }}>
            No visits recorded yet. Rows land here the first time a signed-in
            person loads any page after the ping ships.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--ink-line)', borderRadius: '2px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(232,200,137,.06)', textAlign: 'left' }}>
                  <th style={th}>Who</th>
                  <th style={th}>Days</th>
                  <th style={th}>Visits</th>
                  <th style={th}>Last {STRIP_DAYS} days</th>
                  <th style={th}>Last seen</th>
                  <th style={th}>Last sign-in</th>
                  <th style={th}>Signed up</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const profile = profileById.get(p.userId)
                  const auth = authById.get(p.userId)
                  const name = profile?.display_name && !profile.display_name.includes('@')
                    ? profile.display_name
                    : null
                  return (
                    <tr key={p.userId} style={{ borderTop: '1px solid var(--ink-line)' }}>
                      <td style={td}>
                        <div style={{ color: 'var(--cream)' }}>{name ?? auth?.email ?? p.userId.slice(0, 8)}</div>
                        {name && auth?.email && (
                          <div style={{ opacity: 0.55, fontSize: '.7rem' }}>{auth.email}</div>
                        )}
                      </td>
                      <td style={{ ...td, fontFamily: 'var(--mono)', color: p.daysActive >= 2 ? 'var(--gold)' : 'var(--cream-soft)' }}>
                        {p.daysActive}
                      </td>
                      <td style={{ ...td, fontFamily: 'var(--mono)' }}>{p.totalHits}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          {days30.map((d) => {
                            const hits = p.byDay.get(d) ?? 0
                            return (
                              <span
                                key={d}
                                title={`${fmtDate(`${d}T12:00:00Z`)} · ${hits === 0 ? 'away' : `${hits} visit${hits === 1 ? '' : 's'}`}`}
                                style={{ width: 8, height: 14, borderRadius: 1, ...cellStyle(hits) }}
                              />
                            )
                          })}
                        </div>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtStamp(p.lastSeenAt)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', opacity: 0.7 }}>{fmtDate(auth?.last_sign_in_at ?? null)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', opacity: 0.7 }}>{fmtDate(profile?.created_at ?? auth?.created_at ?? null)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Scale for the strip. Without it the shading is decoration. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.75rem', fontFamily: 'var(--mono)', fontSize: '.58rem', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--cream-soft)', opacity: 0.65 }}>
          <span>Away</span>
          {[0, 1, 2, 3, 4].map((h) => (
            <span key={h} style={{ width: 8, height: 14, borderRadius: 1, ...cellStyle(h) }} />
          ))}
          <span>4+ visits in a day</span>
        </div>
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
