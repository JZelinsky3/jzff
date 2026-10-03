import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'

// How busy each league is.
//
// Reads league_visits (migration 0072): one row per league, per day, per
// browser, written by /api/visit/league from the league's public pages.
// "People" is distinct browsers (signed-in accounts count once across
// devices), "visits" is sessions with a 30-minute gap. The commissioner's
// own checks are left out of both and shown in their own column, so a
// commish fiddling with settings doesn't read as a league that's busy.
//
// For Joey only. Commissioners don't see any of this.

export const metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const SITE_TZ = 'America/New_York'
const STRIP_DAYS = 30

type Row = { league_id: string; day: string; visitor: string; role: string; visits: number; views: number; last_seen_at: string }
type League = { id: string; name: string; slug: string; platform: string; created_at: string }

const PLATFORM: Record<string, string> = { sleeper: 'Sleeper', espn: 'ESPN', yahoo: 'Yahoo', nfl: 'NFL.com' }

function dayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SITE_TZ }).format(d)
}

function recentDays(n: number): string[] {
  const [y, m, d] = dayKey(new Date()).split('-').map(Number)
  const anchor = Date.UTC(y, m - 1, d, 12)
  return Array.from({ length: n }, (_, i) =>
    new Date(anchor - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: SITE_TZ, month: 'short', day: 'numeric' })
}

function fmtStamp(iso: string | null): string {
  if (!iso) return '·'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: SITE_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// People that day, one hue in four steps.
function cellStyle(people: number): React.CSSProperties {
  if (people <= 0) return { background: 'transparent', border: '1px solid var(--ink-line)' }
  const opacity = people === 1 ? 0.35 : people <= 3 ? 0.6 : people <= 6 ? 0.82 : 1
  return { background: `color-mix(in srgb, var(--gold) ${opacity * 100}%, transparent)`, border: '1px solid transparent' }
}

export default async function AdminActivityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isSiteAdmin(user.id))) notFound()

  const db = createAdminClient()
  const days = recentDays(STRIP_DAYS)
  const today = days[days.length - 1]
  const last7 = new Set(days.slice(-7))

  const visitsRes = await db
    .from('league_visits')
    .select('league_id, day, visitor, role, visits, views, last_seen_at')
    .gte('day', days[0])
    .limit(50_000)
  const tableMissing = !!visitsRes.error
  const rows = (visitsRes.data ?? []) as Row[]

  const ids = [...new Set(rows.map((r) => r.league_id))]
  const { data: leagueRows } = ids.length
    ? await db.from('leagues').select('id, name, slug, platform, created_at').in('id', ids)
    : { data: [] as League[] }
  const leagueById = new Map(((leagueRows ?? []) as League[]).map((l) => [l.id, l]))

  type Agg = {
    league: League
    today: Set<string>
    todayVisits: number
    week: Set<string>
    weekVisits: number
    month: Set<string>
    ownerDays: Set<string>
    byDay: Map<string, Set<string>>
    lastSeenAt: string | null
    ownerLastSeenAt: string | null
  }
  const agg = new Map<string, Agg>()
  for (const r of rows) {
    const league = leagueById.get(r.league_id)
    if (!league) continue
    let a = agg.get(r.league_id)
    if (!a) {
      a = { league, today: new Set(), todayVisits: 0, week: new Set(), weekVisits: 0, month: new Set(), ownerDays: new Set(), byDay: new Map(), lastSeenAt: null, ownerLastSeenAt: null }
      agg.set(r.league_id, a)
    }
    if (r.role === 'owner') {
      if (last7.has(r.day)) a.ownerDays.add(r.day)
      if (!a.ownerLastSeenAt || r.last_seen_at > a.ownerLastSeenAt) a.ownerLastSeenAt = r.last_seen_at
      continue
    }
    a.month.add(r.visitor)
    if (!a.byDay.has(r.day)) a.byDay.set(r.day, new Set())
    a.byDay.get(r.day)!.add(r.visitor)
    if (last7.has(r.day)) { a.week.add(r.visitor); a.weekVisits += r.visits }
    if (r.day === today) { a.today.add(r.visitor); a.todayVisits += r.visits }
    if (!a.lastSeenAt || r.last_seen_at > a.lastSeenAt) a.lastSeenAt = r.last_seen_at
  }
  const leagues = [...agg.values()].sort(
    (x, y) => y.week.size - x.week.size || y.weekVisits - x.weekVisits || (y.lastSeenAt ?? '').localeCompare(x.lastSeenAt ?? ''),
  )

  const leaguesToday = leagues.filter((l) => l.today.size > 0).length
  const leaguesWeek = leagues.filter((l) => l.week.size > 0).length
  const peopleWeek = leagues.reduce((n, l) => n + l.week.size, 0)
  const visitsWeek = leagues.reduce((n, l) => n + l.weekVisits, 0)

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
          <div className="nav-title">League <em>activity.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: 'hidden' }} />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Last 7 days ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)' }}>
          {leaguesWeek === 0 ? <>Nothing <em>yet.</em></> : <>{leaguesWeek} {leaguesWeek === 1 ? 'league' : 'leagues'} <em>opened.</em></>}
        </h1>
        <div className="hero-meta">
          People and visits leave out each league&rsquo;s own commissioner
        </div>
      </section>

      {tableMissing && (
        <section className="section" style={{ maxWidth: '760px', margin: '0 auto', padding: '0 1.25rem 1rem' }}>
          <div style={{ border: '1px solid rgba(160,72,48,.4)', background: 'rgba(160,72,48,.08)', padding: '1rem 1.15rem', color: 'var(--cream)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--rust, #a04830)', marginBottom: '.3rem' }}>
              ✗ No table
            </div>
            <code>league_visits</code> could not be read. Run migration{' '}
            <code>0072_league_visits.sql</code>, then reload. Until it exists, nothing is being recorded.
          </div>
        </section>
      )}

      <section className="section" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 1.25rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.75rem' }}>
          {[
            { label: 'Leagues today', value: leaguesToday },
            { label: 'Leagues, 7 days', value: leaguesWeek },
            { label: 'People, 7 days', value: peopleWeek },
            { label: 'Visits, 7 days', value: visitsWeek },
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

      <section className="section" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 1.25rem 3rem' }}>
        {leagues.length === 0 ? (
          <p style={{ color: 'var(--cream-soft)', textAlign: 'center', opacity: 0.7 }}>
            No league visits recorded yet. Rows land here the first time someone opens a published league after this ships.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--ink-line)', borderRadius: '2px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(232,200,137,.06)', textAlign: 'left' }}>
                  <th style={th}>League</th>
                  <th style={th}>Today</th>
                  <th style={th}>People 7d</th>
                  <th style={th}>Visits 7d</th>
                  <th style={th}>People 30d</th>
                  <th style={th}>Commish 7d</th>
                  <th style={th}>People by day, {STRIP_DAYS}d</th>
                  <th style={th}>Last visit</th>
                </tr>
              </thead>
              <tbody>
                {leagues.map((l) => (
                  <tr key={l.league.id} style={{ borderTop: '1px solid var(--ink-line)' }}>
                    <td style={td}>
                      <a href={`/leagues/${l.league.slug}/`} target="_blank" rel="noopener" style={{ color: 'var(--cream)', textDecoration: 'none' }}>
                        {l.league.name}
                      </a>
                      {/* Platform and when it joined, so a quiet league reads as
                          brand new or long dormant at a glance. */}
                      <div style={{ opacity: 0.55, fontSize: '.7rem', whiteSpace: 'nowrap' }}>
                        {PLATFORM[l.league.platform] ?? l.league.platform} · added {fmtDate(l.league.created_at)}
                        {last7.has(dayKey(new Date(l.league.created_at))) && (
                          <span style={{ marginLeft: '.4rem', padding: '0 .3rem', border: '1px solid rgba(232,200,137,.55)', color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: '.55rem', letterSpacing: '.14em', opacity: 1 }}>NEW</span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                      {l.today.size === 0 ? '·' : `${l.today.size} · ${l.todayVisits}`}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', color: l.week.size >= 2 ? 'var(--gold)' : 'var(--cream-soft)' }}>{l.week.size}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)' }}>{l.weekVisits}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)' }}>{l.month.size}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', opacity: 0.7 }}>
                      {l.ownerDays.size === 0 ? '·' : `${l.ownerDays.size} ${l.ownerDays.size === 1 ? 'day' : 'days'}`}
                    </td>
                    <td style={td}>
                      {l.month.size === 0 ? (
                        // Rows only exist for leagues someone opened, so an empty
                        // strip means the only visits were the commissioner's own.
                        <span style={{ fontStyle: 'italic', opacity: 0.6, fontSize: '.75rem' }}>Only the commish has opened it</span>
                      ) : (
                      <div style={{ display: 'flex', gap: 2 }}>
                        {days.map((d) => {
                          const n = l.byDay.get(d)?.size ?? 0
                          return (
                            <span
                              key={d}
                              title={`${fmtDate(`${d}T12:00:00Z`)} · ${n} ${n === 1 ? 'person' : 'people'}`}
                              style={{ width: 8, height: 14, borderRadius: 1, ...cellStyle(n) }}
                            />
                          )
                        })}
                      </div>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {/* Falls back to the commish's own last visit, labelled, so
                          a league only its commissioner has opened isn't blank. */}
                      {l.lastSeenAt ? fmtStamp(l.lastSeenAt) : l.ownerLastSeenAt ? (
                        <>
                          {fmtStamp(l.ownerLastSeenAt)}
                          <div style={{ opacity: 0.55, fontSize: '.65rem' }}>commish</div>
                        </>
                      ) : '·'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.75rem', fontFamily: 'var(--mono)', fontSize: '.58rem', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--cream-soft)', opacity: 0.65 }}>
          <span>Nobody</span>
          {[0, 1, 2, 4, 7].map((n) => (
            <span key={n} style={{ width: 8, height: 14, borderRadius: 1, ...cellStyle(n) }} />
          ))}
          <span>7+ people in a day</span>
          <span style={{ marginLeft: 'auto' }}>Today = people · visits</span>
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
