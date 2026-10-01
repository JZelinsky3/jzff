import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'

// Reader for the league mailing lists (recap_subscribers): which leagues
// actually pass the recap around, and who is on each list. Per-league totals
// first, then every signup, filterable to one league with ?league=<slug>.
//
// Commissioners aren't rows here. They get the recap as the league's owner,
// not through the list.

export const metadata = { robots: { index: false, follow: false } }

type SubRow = {
  id: string
  league_id: string
  email: string
  status: 'pending' | 'active' | 'unsubscribed'
  confirmed_at: string | null
  unsubscribed_at: string | null
  created_at: string
}

type LeagueRow = { id: string; name: string; slug: string }

const ADMIN_TZ = 'America/New_York'
function fmt(iso: string | null) {
  if (!iso) return '·'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: ADMIN_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const STATUS: Record<SubRow['status'], { label: string; color: string }> = {
  active: { label: 'On the list', color: 'var(--gold)' },
  pending: { label: 'Unconfirmed', color: 'var(--cream-soft)' },
  unsubscribed: { label: 'Left', color: 'var(--rust, #a04830)' },
}

// recap_sends grows by one row per list member per week, past the 1,000-row
// default page, so read it in pages.
async function sentCounts(db: ReturnType<typeof createAdminClient>): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from('recap_sends')
      .select('subscriber_id')
      .not('subscriber_id', 'is', null)
      .eq('status', 'sent')
      .range(from, from + 999)
    for (const r of data ?? []) counts.set(r.subscriber_id, (counts.get(r.subscriber_id) ?? 0) + 1)
    if (!data || data.length < 1000) break
  }
  return counts
}

export default async function AdminMailingListsPage({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isSiteAdmin(user.id))) notFound()

  const { league: only } = await searchParams
  const db = createAdminClient()
  const { data: subData, error } = await db
    .from('recap_subscribers')
    .select('id, league_id, email, status, confirmed_at, unsubscribed_at, created_at')
    .order('created_at', { ascending: false })
  const subs = (subData ?? []) as SubRow[]

  const leagueIds = [...new Set(subs.map((s) => s.league_id))]
  const { data: leagueData } = leagueIds.length
    ? await db.from('leagues').select('id, name, slug').in('id', leagueIds)
    : { data: [] }
  const leagues = new Map(((leagueData ?? []) as LeagueRow[]).map((l) => [l.id, l]))
  const sent = subs.length ? await sentCounts(db) : new Map<string, number>()

  const active = subs.filter((s) => s.status === 'active').length
  const pending = subs.filter((s) => s.status === 'pending').length
  const left = subs.filter((s) => s.status === 'unsubscribed').length

  // One row per league, biggest list first.
  const byLeague = leagueIds
    .map((id) => {
      const rows = subs.filter((s) => s.league_id === id)
      return {
        league: leagues.get(id) ?? { id, name: 'Deleted league', slug: '' },
        active: rows.filter((s) => s.status === 'active').length,
        pending: rows.filter((s) => s.status === 'pending').length,
        left: rows.filter((s) => s.status === 'unsubscribed').length,
        sent: rows.reduce((n, s) => n + (sent.get(s.id) ?? 0), 0),
        latest: rows[0]?.created_at ?? null,
      }
    })
    .sort((a, b) => b.active - a.active || b.pending - a.pending || (b.latest ?? '').localeCompare(a.latest ?? ''))

  const shown = only ? subs.filter((s) => leagues.get(s.league_id)?.slug === only) : subs
  const onlyName = only ? byLeague.find((r) => r.league.slug === only)?.league.name ?? only : null

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
          <div className="nav-title">The <em>mailing lists.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: 'hidden' }} />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Signed up at the bottom of a recap ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)' }}>
          {active === 0 ? <>Nobody <em>yet.</em></> : <>{active} <em>on the lists.</em></>}
        </h1>
        <div className="hero-meta">
          {byLeague.length} league{byLeague.length === 1 ? '' : 's'} · {pending} unconfirmed · {left} left
        </div>
      </section>

      {error ? (
        <p style={{ color: 'var(--cream-soft)', textAlign: 'center', opacity: 0.7, padding: '0 1.25rem 2rem' }}>
          Couldn&apos;t read recap_subscribers ({error.message}). Has migration 0071 been applied?
        </p>
      ) : null}

      {byLeague.length > 0 && (
        <section className="section" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 1.25rem 1rem' }}>
          <h2 style={h2}>By league</h2>
          <div style={{ overflowX: 'auto', border: '1px solid var(--ink-line)', borderRadius: '2px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(232,200,137,.06)', textAlign: 'left' }}>
                  <th style={th}>League</th>
                  <th style={{ ...th, textAlign: 'right' }}>On the list</th>
                  <th style={{ ...th, textAlign: 'right' }}>Unconfirmed</th>
                  <th style={{ ...th, textAlign: 'right' }}>Left</th>
                  <th style={{ ...th, textAlign: 'right' }}>Copies sent</th>
                  <th style={th}>Latest signup</th>
                </tr>
              </thead>
              <tbody>
                {byLeague.map((r) => (
                  <tr key={r.league.id} style={{ borderTop: '1px solid var(--ink-line)' }}>
                    <td style={td}>
                      {r.league.slug ? (
                        <>
                          <Link href={`/admin/mailing-lists?league=${r.league.slug}`} style={{ color: 'var(--cream)', textDecoration: 'none' }}>
                            {r.league.name}
                          </Link>
                          <a href={`/leagues/${r.league.slug}/recap/`} style={{ marginLeft: '.6rem', color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: '.62rem', textDecoration: 'none' }}>
                            recap
                          </a>
                        </>
                      ) : (
                        r.league.name
                      )}
                    </td>
                    <td style={{ ...td, ...num, color: 'var(--gold)' }}>{r.active}</td>
                    <td style={{ ...td, ...num }}>{r.pending}</td>
                    <td style={{ ...td, ...num }}>{r.left}</td>
                    <td style={{ ...td, ...num }}>{r.sent}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', opacity: 0.7 }}>{fmt(r.latest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section" style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem 1.25rem 3rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <h2 style={h2}>{onlyName ? `Everyone on ${onlyName}` : 'Everyone'}</h2>
          {only ? (
            <Link href="/admin/mailing-lists" style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--gold)', textDecoration: 'none' }}>
              Show all leagues
            </Link>
          ) : null}
        </div>
        {shown.length === 0 ? (
          <p style={{ color: 'var(--cream-soft)', textAlign: 'center', opacity: 0.7 }}>
            No signups yet. They land here when someone adds their email at the bottom of a recap page.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--ink-line)', borderRadius: '2px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(232,200,137,.06)', textAlign: 'left' }}>
                  <th style={th}>Email</th>
                  {only ? null : <th style={th}>League</th>}
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: 'right' }}>Sent</th>
                  <th style={th}>Signed up</th>
                  <th style={th}>Confirmed / left</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--ink-line)' }}>
                    <td style={{ ...td, color: 'var(--cream)' }}>{s.email}</td>
                    {only ? null : <td style={td}>{leagues.get(s.league_id)?.name ?? '·'}</td>}
                    <td style={{ ...td, whiteSpace: 'nowrap', color: STATUS[s.status].color }}>{STATUS[s.status].label}</td>
                    <td style={{ ...td, ...num }}>{sent.get(s.id) ?? 0}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', opacity: 0.7 }}>{fmt(s.created_at)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', opacity: 0.7 }}>
                      {s.status === 'unsubscribed' ? fmt(s.unsubscribed_at) : fmt(s.confirmed_at)}
                    </td>
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

const h2: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '.7rem',
  letterSpacing: '.22em',
  textTransform: 'uppercase',
  color: 'var(--gold)',
  margin: '1.5rem 0 .75rem',
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

const num: React.CSSProperties = {
  textAlign: 'right',
  fontFamily: 'var(--mono)',
}
