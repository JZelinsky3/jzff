import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const tickerItems = [
    'The Sunday Chronicle · The League Almanac',
    'Every Champion · Every Draft · Every Rivalry',
    'Sleeper · ESPN · Yahoo · NFL.com',
    'Bring your league ID · we walk the history',
  ]

  return (
    <main>
      <div className="ticker">
        <div className="ticker-track">
          <div className="ticker-group">
            {tickerItems.map((t, i) => (
              <span key={`a-${i}`} className="ticker-item"><span className="ticker-star">★</span> {t}</span>
            ))}
          </div>
          <div className="ticker-group">
            {tickerItems.map((t, i) => (
              <span key={`b-${i}`} className="ticker-item"><span className="ticker-star">★</span> {t}</span>
            ))}
          </div>
        </div>
      </div>

      <nav className="nav">
        <span className="nav-back" style={{ visibility: 'hidden' }}>—</span>
        <div className="nav-center">
          <div className="nav-kicker">Vol. II · The League Almanac</div>
          <div className="nav-title" style={{ letterSpacing: '.04em' }}>TS<em>C.</em></div>
        </div>
        <Link href="/login" className="nav-link">Sign in</Link>
      </nav>

      <section className="hero">
        <div className="hero-sup">★ JZFF · The Sunday Chronicle · Est. 2026 ★</div>
        <h1 className="hero-title">
          Your league.<br />
          <em>Bound forever.</em>
        </h1>
        <p className="hero-sub">Built for the history of the league.</p>
        <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/login?mode=signup" className="dc-btn">Start your archive →</Link>
          <Link href="/login" className="dc-btn-ghost">Sign in</Link>
        </div>
      </section>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · What gets archived</span>
          <span className="section-title">Every page already designed —</span>
          <span className="section-meta">filled in with your data</span>
        </div>
        <div className="card-grid">
          <Feature corner="i"   roman="I"    title={['Season', 'Archives']} desc="Walks back through every year your league has existed. Final standings, every matchup, every playoff run." href="/demo/seasons/" />
          <Feature corner="ii"  roman="II"   title={['Champion', 'Rolls']}  desc="Trophy lifters, runner-ups, regular-season kings who never quite got there." href="/demo/records.html" />
          <Feature corner="iii" roman="III"  title={['Draft', 'Boards']}    desc="Round by round — who they took, what slot, who got robbed late." href="/demo/draft/" />
          <Feature corner="iv"  roman="IV"   title={['Manager', 'Dossiers']}desc="Career records, championships, head-to-head against every rival." href="/demo/managers/" />
          <Feature corner="v"   roman="V"    title={['The', 'Rivalries']}   desc="Hand-picked feuds with running scoreboards and all-time meeting logs." href="/demo/rivalries/" />
          <Feature corner="vi"  roman="VI"   title={['One-click', 'Refresh']} desc="Pull this year as it happens. We keep the chronicle current." />
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 02 · See it live</span>
          <span className="section-title">Tour a finished almanac —</span>
          <span className="section-meta">no signup required</span>
        </div>
        <div className="dc-card-row">
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '1.15rem', color: 'var(--cream)' }}>
              Just looking around? Take a tour of a <em style={{ color: 'var(--gold)' }}>live</em> almanac before signing up.
            </div>
            <div style={{ opacity: 0.65, fontSize: '.85rem', marginTop: '.35rem' }}>
              Every page, populated with a real league&apos;s seven-year history.
            </div>
          </div>
          <a href="/demo/" className="dc-btn" target="_blank" rel="noopener">View the demo →</a>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 03 · Platforms</span>
          <span className="section-title">Bring your league from —</span>
          <span className="section-meta">more on the way</span>
        </div>
        <div className="dc-chapters">
          <Platform name="Sleeper"  status="Available"   pill="Live" klass="" />
          <Platform name="ESPN"     status="Available"   pill="Live" klass="" />
          <Platform name="NFL.com"  status="Historical"  pill="Live" klass="" />
          <Platform name="Yahoo"    status="Coming soon" pill="Soon" klass="cream" />
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}

function Feature({ corner, roman, title, desc, href }: { corner: string; roman: string; title: [string, string]; desc: string; href?: string }) {
  const inner = (
    <>
      <div className="card-corner">Ch. {corner}</div>
      <div className="card-roman">{roman}</div>
      <div className="card-title">{title[0]} <em>{title[1]}.</em></div>
      <div className="card-desc">{desc}</div>
    </>
  )
  if (href) {
    return (
      <a href={href} className="card" target="_blank" rel="noopener">
        {inner}
      </a>
    )
  }
  return <div className="card">{inner}</div>
}

function Platform({ name, status, pill, klass }: { name: string; status: string; pill: string; klass: string }) {
  return (
    <div className="dc-chapter">
      <div className="dc-chapter-num">●</div>
      <div className="dc-chapter-body">
        <div className="dc-chapter-title">{name}</div>
        <div className="dc-chapter-desc">{status}</div>
      </div>
      <span className={`dc-pill ${klass}`}>{pill}</span>
      <div className="dc-chapter-arrow"></div>
    </div>
  )
}
