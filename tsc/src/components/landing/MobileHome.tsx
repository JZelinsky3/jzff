import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'

export function MobileHome({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="mlp">
      {/* ── Top bar ── */}
      <header className="mlp-bar">
        <span className="mlp-bar-title">The Sunday <em>Chronicle.</em></span>
        {signedIn ? (
          <Link href="/dashboard" className="mlp-bar-link">Library</Link>
        ) : (
          <Link href="/login" className="mlp-bar-link">Sign in</Link>
        )}
      </header>

      {/* ── Screen 1 · The Hook ── */}
      <section className="mlp-screen mlp-hook">
        <div className="mlp-hook-kicker">The League Almanac</div>
        <h1 className="mlp-hook-title">
          Ten years of<br />trash talk.<br /><em>One book.</em>
        </h1>

        <div className="mlp-shelf">
          {(['2024', '2023', '2022', '2021', '2020', '2019', '2018'] as const).map((yr) => (
            <div key={yr} className="mlp-spine">
              <span className="mlp-spine-yr">{yr}</span>
              <span className="mlp-spine-rule" />
              <span className="mlp-spine-star">★</span>
            </div>
          ))}
        </div>

        <div className="mlp-hook-ctas">
          {signedIn ? (
            <Link href="/dashboard/new" className="dc-btn dc-btn-block">Add a league</Link>
          ) : (
            <Link href="/login?mode=signup" className="dc-btn dc-btn-block">Start your archive</Link>
          )}
        </div>
        <div className="mlp-hook-meta">Free. No card. 5 minutes.</div>
      </section>

      {/* ── Screen 2 · The What ── */}
      <section className="mlp-screen mlp-what">
        <h2 className="mlp-what-title">
          Every season.<br />Every draft pick.<br />Every rivalry.<br />
          <em>Back to the beginning.</em>
        </h2>

        <div className="mlp-pillars">
          <div className="mlp-pillar">
            <span className="mlp-pillar-glyph">★</span>
            <span className="mlp-pillar-label">Champions</span>
          </div>
          <div className="mlp-pillar">
            <span className="mlp-pillar-glyph">▦</span>
            <span className="mlp-pillar-label">Standings</span>
          </div>
          <div className="mlp-pillar">
            <span className="mlp-pillar-glyph">◆</span>
            <span className="mlp-pillar-label">Drafts</span>
          </div>
          <div className="mlp-pillar">
            <span className="mlp-pillar-glyph">⚔</span>
            <span className="mlp-pillar-label">Rivalries</span>
          </div>
        </div>

        <p className="mlp-what-sub">
          Bring a league ID and we walk every season back to the beginning.
          Your almanac builds itself.
        </p>
      </section>

      {/* ── Screen 3 · The Proof ── */}
      <section className="mlp-screen mlp-proof">
        <div className="mlp-proof-kicker">Works with</div>
        <div className="mlp-platforms">
          <span className="mlp-plat"><span className="mlp-plat-dot live" />Sleeper</span>
          <span className="mlp-plat"><span className="mlp-plat-dot live" />ESPN</span>
          <span className="mlp-plat"><span className="mlp-plat-dot beta" />NFL.com</span>
          <span className="mlp-plat"><span className="mlp-plat-dot beta" />Yahoo</span>
        </div>

        <a href="/demo/" target="_blank" rel="noopener" className="mlp-demo-card">
          <span className="mlp-demo-badge">Demo</span>
          <span className="mlp-demo-title">Walk a real league&apos;s history</span>
          <span className="mlp-demo-meta">7 seasons · every page · no signup</span>
        </a>
      </section>

      {/* ── Screen 4 · The Close ── */}
      <section className="mlp-screen mlp-close">
        <h2 className="mlp-close-title">Bind <em>your</em> league.</h2>
        <p className="mlp-close-sub">
          Pull your seasons in under five minutes. Publish an almanac your
          whole league can read, argue with, and remember.
        </p>
        <div className="mlp-close-ctas">
          {signedIn ? (
            <Link href="/dashboard/new" className="dc-btn dc-btn-block">Add a league</Link>
          ) : (
            <Link href="/login?mode=signup" className="dc-btn dc-btn-block">Start your archive</Link>
          )}
          <a href="/demo/" target="_blank" rel="noopener" className="dc-btn-ghost dc-btn-block">
            Walk the demo
          </a>
        </div>
      </section>

      <SiteFooter />

      <a className="mlp-viewswitch" href="/api/view/?mode=desktop&to=/">View desktop site</a>
    </main>
  )
}
