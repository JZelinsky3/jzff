import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { fmtEastern, socialLive, xConfigured } from '@/lib/social/config'
import { KIND_LABELS, type Kind } from '@/lib/social/content'
import { xPostUrl } from '@/lib/social/x'
import { PostControls, QueueTools } from './controls'

// The social queue: what goes out on X and Threads, and when. The Saturday
// cron fills next week, the hourly cron sends what is due, and this page is
// where a post gets vetoed or reworded. See src/lib/social/.

export const metadata = { robots: { index: false, follow: false } }

type PostRow = {
  id: string
  kind: string
  scheduled_at: string
  status: string
  x_text: string | null
  threads_text: string | null
  image_path: string | null
  link: string | null
  x_post_id: string | null
  threads_post_id: string | null
  x_error: string | null
  threads_error: string | null
  attempts: number
  edited_at: string | null
}

const STATUS: Record<string, { label: string; color: string }> = {
  queued: { label: 'Queued', color: 'var(--gold)' },
  vetoed: { label: 'Vetoed', color: 'var(--cream-soft)' },
  sending: { label: 'Sending', color: 'var(--gold)' },
  sent: { label: 'Sent', color: '#7ac795' },
  partial: { label: 'One platform failed', color: 'var(--rust, #a04830)' },
  failed: { label: 'Failed', color: 'var(--rust, #a04830)' },
  expired: { label: 'Expired', color: 'var(--cream-soft)' },
}

// The last three weeks and everything ahead. "Coming up" is anything still
// queued plus whatever went out in the last hour, so a post doesn't vanish
// from the top the moment it is sent.
async function loadQueue() {
  const db = createAdminClient()
  const now = Date.now()
  const since = new Date(now - 21 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data, error }, { data: token }] = await Promise.all([
    db.from('social_posts')
      .select('id, kind, scheduled_at, status, x_text, threads_text, image_path, link, x_post_id, threads_post_id, x_error, threads_error, attempts, edited_at')
      .gte('scheduled_at', since)
      .order('scheduled_at', { ascending: true }),
    db.from('social_tokens').select('expires_at').eq('platform', 'threads').maybeSingle(),
  ])
  const posts = (data ?? []) as PostRow[]
  const upcoming = posts.filter((p) => Date.parse(p.scheduled_at) >= now - 60 * 60 * 1000 || p.status === 'queued')
  const past = posts.filter((p) => !upcoming.includes(p)).reverse()
  return { upcoming, past, error, token: token as { expires_at: string | null } | null }
}

export default async function AdminSocialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isSiteAdmin(user.id))) notFound()

  const { upcoming, past, error, token } = await loadQueue()

  const live = socialLive()
  const x = xConfigured()
  const threads = !!process.env.THREADS_ACCESS_TOKEN || !!token
  const threadsExpiry = token?.expires_at
    ? new Date(token.expires_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })
    : null

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
          <div className="nav-title">The <em>social queue.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: 'hidden' }} />
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ X and Threads, posted for you ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.25rem, 5vw, 4rem)' }}>
          {upcoming.filter((p) => p.status === 'queued').length} <em>queued.</em>
        </h1>
        <div className="hero-meta" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ color: live ? '#7ac795' : 'var(--rust, #a04830)' }}>Posting {live ? 'ON' : 'OFF'}</span>
          <span>X {x ? 'keys set' : 'not connected'}</span>
          <span>Threads {threads ? (threadsExpiry ? `token good to ${threadsExpiry}` : 'token set') : 'not connected'}</span>
        </div>
        <div style={{ marginTop: '1.25rem' }}><QueueTools /></div>
      </section>

      {error ? (
        <p style={{ color: 'var(--cream-soft)', textAlign: 'center', opacity: 0.7, padding: '0 1.25rem 2rem' }}>
          Couldn&apos;t read social_posts ({error.message}). Has migration 0073 been applied?
        </p>
      ) : null}

      <section className="section" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 1.25rem 1rem' }}>
        <h2 style={h2}>Coming up</h2>
        {upcoming.length === 0 ? (
          <p style={{ color: 'var(--cream-soft)', opacity: 0.7 }}>Nothing queued. Plan next week above, or wait for Saturday.</p>
        ) : upcoming.map((p) => <Post key={p.id} p={p} live={live} />)}
      </section>

      {past.length > 0 && (
        <section className="section" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 1.25rem 3rem' }}>
          <h2 style={h2}>Last three weeks</h2>
          {past.map((p) => <Post key={p.id} p={p} live={live} />)}
        </section>
      )}

      <SiteFooter />
    </main>
  )
}

function Post({ p, live }: { p: PostRow; live: boolean }) {
  const st = STATUS[p.status] ?? { label: p.status, color: 'var(--cream-soft)' }
  const errors = [p.x_error && `X: ${p.x_error}`, p.threads_error && `Threads: ${p.threads_error}`].filter(Boolean)
  return (
    <article id={p.id} style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', borderTop: '1px solid var(--ink-line)', padding: '1.25rem 0', opacity: p.status === 'vetoed' || p.status === 'expired' ? 0.55 : 1 }}>
      {p.image_path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image_path} alt="" loading="lazy" style={{ width: '180px', height: 'auto', alignSelf: 'flex-start', border: '1px solid var(--ink-line)' }} />
      ) : null}
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'baseline', ...mono }}>
          <span style={{ color: 'var(--gold)' }}>{fmtEastern(p.scheduled_at)}</span>
          <span style={{ color: 'var(--cream-soft)' }}>{KIND_LABELS[p.kind as Kind] ?? p.kind}</span>
          <span style={{ color: st.color }}>{st.label}</span>
          {p.edited_at ? <span style={{ color: 'var(--cream-soft)', opacity: 0.6 }}>Edited</span> : null}
        </div>
        {p.x_text ? (
          <div style={{ display: 'grid', gap: '.6rem', marginTop: '.6rem' }}>
            <Copy label="X" text={p.x_text} />
            <Copy label="Threads" text={p.threads_text ?? ''} />
          </div>
        ) : (
          <p style={{ color: 'var(--cream-soft)', fontStyle: 'italic', margin: '.6rem 0 0' }}>
            Written on the day from live Sleeper data. Veto now to skip it.
          </p>
        )}
        {(p.x_post_id || p.threads_post_id) ? (
          <div style={{ display: 'flex', gap: '1rem', marginTop: '.6rem', ...mono }}>
            {p.x_post_id ? <a href={xPostUrl(p.x_post_id)} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>On X</a> : null}
            {p.threads_post_id ? <span style={{ color: 'var(--gold)' }}>On Threads</span> : null}
          </div>
        ) : null}
        {errors.length ? (
          <div style={{ color: 'rgba(220,120,80,.9)', fontSize: '.72rem', marginTop: '.5rem', wordBreak: 'break-word' }}>
            {errors.join(' · ')}{p.attempts ? ` (attempt ${p.attempts})` : ''}
          </div>
        ) : null}
        <PostControls id={p.id} status={p.status} xText={p.x_text} threadsText={p.threads_text} live={live} />
      </div>
    </article>
  )
}

function Copy({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div style={{ ...mono, color: 'var(--gold)', opacity: 0.75, marginBottom: '.2rem' }}>{label}</div>
      <div style={{ whiteSpace: 'pre-wrap', color: 'var(--cream)', fontSize: '.88rem', lineHeight: 1.5, wordBreak: 'break-word' }}>{text}</div>
    </div>
  )
}

const mono: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.15em', textTransform: 'uppercase' }

const h2: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '.7rem',
  letterSpacing: '.22em',
  textTransform: 'uppercase',
  color: 'var(--gold)',
  margin: '1.5rem 0 .75rem',
}
