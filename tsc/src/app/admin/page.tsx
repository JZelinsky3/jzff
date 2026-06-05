import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { isLifetimeUser, TIER_LABELS } from '@/lib/stripe'
import { GrantCompButton, RevokeCompButton } from './controls'

type ProfileRow = {
  id: string
  display_name: string | null
  email: string | null
  member_code: string | null
  created_at: string
}

type LeagueRow = {
  id: string
  name: string
  slug: string
  platform: string
  owner_id: string
  created_at: string
  last_synced_at: string | null
  published_at: string | null
  grace_period_ends_at: string | null
  is_udfa: boolean
}

type SubscriptionRow = {
  user_id: string
  tier: 'tier1' | 'tier2' | 'tier3'
  billing_period: 'monthly' | 'yearly'
  status: string
  current_period_end: string | null
  trial_ends_at: string | null
}

type CompRow = { user_id: string; granted_by: string | null; note: string | null; created_at: string }

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isSiteAdmin(user.id))) notFound()

  const db = createAdminClient()

  const [profilesRes, leaguesRes, subsRes, compsRes, authUsersRes] = await Promise.all([
    db.from('profiles').select('id, display_name, member_code, created_at').order('created_at', { ascending: false }),
    db.from('leagues').select('id, name, slug, platform, owner_id, created_at, last_synced_at, published_at, grace_period_ends_at, is_udfa').order('created_at', { ascending: false }),
    db.from('subscriptions').select('user_id, tier, billing_period, status, current_period_end, trial_ends_at'),
    db.from('comp_grants').select('user_id, granted_by, note, created_at'),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const emailById = new Map<string, string>()
  for (const u of authUsersRes.data?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email)
  }

  const profiles: ProfileRow[] = (profilesRes.data ?? []).map((p) => ({
    id: p.id as string,
    display_name: (p.display_name as string | null) ?? null,
    email: emailById.get(p.id as string) ?? null,
    member_code: (p.member_code as string | null) ?? null,
    created_at: p.created_at as string,
  }))
  const leagues = (leaguesRes.data ?? []) as LeagueRow[]
  const subs = (subsRes.data ?? []) as SubscriptionRow[]
  const comps = (compsRes.data ?? []) as CompRow[]

  const subByUser = new Map(subs.map((s) => [s.user_id, s]))
  const compByUser = new Map(comps.map((c) => [c.user_id, c]))
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const leagueCountByOwner = new Map<string, number>()
  for (const l of leagues) {
    leagueCountByOwner.set(l.owner_id, (leagueCountByOwner.get(l.owner_id) ?? 0) + 1)
  }

  return (
    <main>
      <nav className="nav">
        <Link href="/dashboard" className="dc-nav-icon" aria-label="Back to your library">
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <div className="nav-center">
          <div className="nav-kicker">Site admin</div>
          <div className="nav-title">The <em>Overseer.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: 'hidden' }} />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ Site administrator ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)' }}>
          Every <em>league.</em> Every <em>profile.</em>
        </h1>
        <p className="hero-sub">
          Oversee accounts and leagues across the site. Comp grants here flow
          straight into the paywall — recipient gets unlimited-league access
          without a Stripe subscription.
        </p>
        <div className="hero-meta">
          {profiles.length} profile{profiles.length === 1 ? '' : 's'} · {leagues.length} league{leagues.length === 1 ? '' : 's'} · {subs.length} subscription{subs.length === 1 ? '' : 's'} · {comps.length} comp grant{comps.length === 1 ? '' : 's'}
        </div>
      </section>

      <section className="section" style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 1.25rem 2rem' }}>
        <h2 style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', margin: '1.5rem 0 .75rem' }}>
          Profiles &amp; subscriptions
        </h2>
        <div style={{ overflowX: 'auto', border: '1px solid var(--ink-line)', borderRadius: '2px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
            <thead>
              <tr style={{ background: 'rgba(232,200,137,.06)', textAlign: 'left' }}>
                <th style={th}>User</th>
                <th style={th}>Email</th>
                <th style={th}>Code</th>
                <th style={th}>Leagues</th>
                <th style={th}>Subscription</th>
                <th style={th}>Comp</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const sub = subByUser.get(p.id)
                const comp = compByUser.get(p.id)
                const envComp = isLifetimeUser(p.id)
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--ink-line)' }}>
                    <td style={td}>
                      <div style={{ color: 'var(--cream)' }}>{p.display_name || '—'}</div>
                      <div style={{ opacity: 0.5, fontFamily: 'var(--mono)', fontSize: '.65rem' }}>{p.id.slice(0, 8)}…</div>
                    </td>
                    <td style={td}>{p.email ?? '—'}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', letterSpacing: '.1em', color: 'var(--cream)' }}>
                      {p.member_code ?? '—'}
                    </td>
                    <td style={td}>{leagueCountByOwner.get(p.id) ?? 0}</td>
                    <td style={td}>
                      {sub ? (
                        <>
                          <div>{TIER_LABELS[sub.tier]?.name ?? sub.tier} · {sub.billing_period}</div>
                          <div style={{ opacity: 0.6, fontSize: '.7rem' }}>{sub.status}</div>
                        </>
                      ) : (
                        <span style={{ opacity: 0.5 }}>—</span>
                      )}
                    </td>
                    <td style={td}>
                      {envComp ? (
                        <span style={{ color: 'var(--gold)' }}>★ env</span>
                      ) : comp ? (
                        <span style={{ color: 'var(--gold)' }}>★ granted</span>
                      ) : (
                        <span style={{ opacity: 0.4 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {envComp ? (
                        <span style={{ opacity: 0.4, fontFamily: 'var(--mono)', fontSize: '.65rem' }}>via env</span>
                      ) : comp ? (
                        <RevokeCompButton userId={p.id} />
                      ) : (
                        <GrantCompButton userId={p.id} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <h2 style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--gold)', margin: '2rem 0 .75rem' }}>
          Leagues
        </h2>
        <div style={{ overflowX: 'auto', border: '1px solid var(--ink-line)', borderRadius: '2px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
            <thead>
              <tr style={{ background: 'rgba(232,200,137,.06)', textAlign: 'left' }}>
                <th style={th}>League</th>
                <th style={th}>Owner</th>
                <th style={th}>Platform</th>
                <th style={th}>Created</th>
                <th style={th}>State</th>
              </tr>
            </thead>
            <tbody>
              {leagues.map((l) => {
                const owner = profileById.get(l.owner_id)
                const grace = l.grace_period_ends_at
                const tags: string[] = []
                if (l.is_udfa) tags.push('udfa')
                if (l.published_at) tags.push('published')
                if (grace) tags.push('grace')
                return (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--ink-line)' }}>
                    <td style={td}>
                      <Link href={`/league/${l.slug}`} style={{ color: 'var(--cream)' }}>{l.name}</Link>
                      <div style={{ opacity: 0.5, fontFamily: 'var(--mono)', fontSize: '.65rem' }}>{l.slug}</div>
                    </td>
                    <td style={td}>
                      <div>{owner?.display_name || '—'}</div>
                      <div style={{ opacity: 0.6, fontSize: '.7rem' }}>{owner?.email ?? '—'}</div>
                    </td>
                    <td style={td}>{l.platform}</td>
                    <td style={td}>{new Date(l.created_at).toLocaleDateString()}</td>
                    <td style={td}>
                      {tags.length === 0 ? (
                        <span style={{ opacity: 0.4 }}>—</span>
                      ) : (
                        tags.map((t) => (
                          <span key={t} style={{
                            display: 'inline-block', marginRight: '.35rem',
                            padding: '.1rem .4rem',
                            fontFamily: 'var(--mono)', fontSize: '.6rem',
                            letterSpacing: '.15em', textTransform: 'uppercase',
                            border: '1px solid var(--ink-line)', borderRadius: '2px',
                            color: t === 'grace' ? 'rgba(220,120,80,.85)' : 'var(--cream-soft)',
                          }}>{t}</span>
                        ))
                      )}
                      {grace && (
                        <div style={{ opacity: 0.6, fontSize: '.65rem', marginTop: '.2rem' }}>
                          ends {new Date(grace).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
  fontWeight: 400,
}

const td: React.CSSProperties = {
  padding: '.6rem .8rem',
  color: 'var(--cream-soft)',
  verticalAlign: 'top',
}
