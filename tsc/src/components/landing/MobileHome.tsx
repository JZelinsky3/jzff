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
          Your league&apos;s history.<br /><em>Bound in one book.</em>
        </h1>
        <p className="mlp-hook-sub">
          One league ID. Every season walked back to the beginning.
          A designed almanac your whole league can read.
        </p>

        {/* Single book cover */}
        <div className="mlp-book">
          <div className="mlp-book-edge" />
          <div className="mlp-book-cover">
            <span className="mlp-book-star">★</span>
            <span className="mlp-book-league">Your League</span>
            <span className="mlp-book-rule" />
            <span className="mlp-book-vol">The Complete History</span>
            <span className="mlp-book-years">2018 — 2024</span>
            <span className="mlp-book-seasons">7 Seasons Bound</span>
            <span className="mlp-book-ft">The Sunday Chronicle</span>
          </div>
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

      {/* ── Screen 2 · What's Inside ── */}
      <section className="mlp-screen mlp-inside">
        <div className="mlp-inside-head">
          <span className="mlp-inside-kicker">What&apos;s in your book</span>
          <h2 className="mlp-inside-title">Not a spreadsheet.<br /><em>An almanac.</em></h2>
          <p className="mlp-inside-sub">
            Other sites dump stats into tables. We design every page
            so your league looks the way it deserves.
          </p>
        </div>

        {/* Mini preview cards — product snapshots */}
        <div className="mlp-previews">
          {/* Standings preview */}
          <div className="mlp-prev">
            <div className="mlp-prev-label">Season Archives</div>
            <div className="mlp-prev-body mlp-prev-paper">
              <div className="mlp-prev-hd">Final Standings · 2024</div>
              <div className="mlp-prev-row"><span className="mlp-prev-rk">1</span><span className="mlp-prev-nm">Tight End Tendency</span><span className="mlp-prev-val">12–2</span></div>
              <div className="mlp-prev-row"><span className="mlp-prev-rk">2</span><span className="mlp-prev-nm">PAM Slingers</span><span className="mlp-prev-val">11–3</span></div>
              <div className="mlp-prev-row"><span className="mlp-prev-rk">3</span><span className="mlp-prev-nm">Dad Bod Dynasty</span><span className="mlp-prev-val">10–4</span></div>
              <div className="mlp-prev-ft">Every season, every matchup — back to the start.</div>
            </div>
          </div>

          {/* Champions preview */}
          <div className="mlp-prev">
            <div className="mlp-prev-label">Champion Roll</div>
            <div className="mlp-prev-body mlp-prev-dark">
              <div className="mlp-prev-champ">
                <span className="mlp-prev-trophy">★</span>
                <span className="mlp-prev-champ-info">
                  <span className="mlp-prev-champ-name">Tight End Tendency</span>
                  <span className="mlp-prev-champ-line">def. Slingers · 142.6–142.1</span>
                </span>
                <span className="mlp-prev-champ-yr">2024</span>
              </div>
              <div className="mlp-prev-champ">
                <span className="mlp-prev-trophy">★</span>
                <span className="mlp-prev-champ-info">
                  <span className="mlp-prev-champ-name">Dad Bod Dynasty</span>
                  <span className="mlp-prev-champ-line">def. Tendency · 138.0–119.4</span>
                </span>
                <span className="mlp-prev-champ-yr">2023</span>
              </div>
              <div className="mlp-prev-champ">
                <span className="mlp-prev-trophy dim">★</span>
                <span className="mlp-prev-champ-info">
                  <span className="mlp-prev-champ-name">PAM Slingers</span>
                  <span className="mlp-prev-champ-line">def. Bombers · 156.3–122.0</span>
                </span>
                <span className="mlp-prev-champ-yr">2022</span>
              </div>
            </div>
          </div>

          {/* Rivalry preview */}
          <div className="mlp-prev">
            <div className="mlp-prev-label">Rivalries</div>
            <div className="mlp-prev-body mlp-prev-dark mlp-prev-rivalry">
              <div className="mlp-prev-vs">
                <span>Slingers</span>
                <span className="mlp-prev-score">9 — 7</span>
                <span>Dad Bod</span>
              </div>
              <div className="mlp-prev-vs-meta">16 meetings · since 2018</div>
              <div className="mlp-prev-vs-line"><span>2024 · Wk 14</span><span>Slingers 132.4–128.7</span></div>
              <div className="mlp-prev-vs-line"><span>2023 · QF</span><span>Dad Bod 121.8–118.5</span></div>
            </div>
          </div>

          {/* Manager preview */}
          <div className="mlp-prev">
            <div className="mlp-prev-label">Manager Dossiers</div>
            <div className="mlp-prev-body mlp-prev-dark">
              <div className="mlp-prev-mgr-head">
                <span className="mlp-prev-mgr-av">JK</span>
                <span className="mlp-prev-mgr-info">
                  <span className="mlp-prev-mgr-name">Jake K.</span>
                  <span className="mlp-prev-mgr-team">PAM Slingers · 7 seasons</span>
                </span>
              </div>
              <div className="mlp-prev-mgr-stats">
                <span><b>3</b> Titles</span>
                <span><b>.682</b> Win%</span>
                <span><b>12</b> Playoffs</span>
              </div>
            </div>
          </div>
        </div>

        <a href="/demo/" target="_blank" rel="noopener" className="mlp-inside-demo">
          See every page in the demo
        </a>
      </section>

      {/* ── Screen 3 · Why This ── */}
      <section className="mlp-screen mlp-why">
        <span className="mlp-why-kicker">Why this one</span>
        <h2 className="mlp-why-title">Your league<br /><em>deserves better</em><br />than a data dump.</h2>

        <div className="mlp-why-points">
          <div className="mlp-why-pt">
            <span className="mlp-why-pt-icon">★</span>
            <span className="mlp-why-pt-body">
              <span className="mlp-why-pt-title">Designed, not generated</span>
              <span className="mlp-why-pt-desc">Every page is typeset like a real publication. Champion rolls, draft boards, career dossiers — all designed.</span>
            </span>
          </div>
          <div className="mlp-why-pt">
            <span className="mlp-why-pt-icon">◆</span>
            <span className="mlp-why-pt-body">
              <span className="mlp-why-pt-title">5 minutes to build</span>
              <span className="mlp-why-pt-desc">Paste your league ID. We walk every season automatically — draft picks, matchups, records, all of it.</span>
            </span>
          </div>
          <div className="mlp-why-pt">
            <span className="mlp-why-pt-icon">▸</span>
            <span className="mlp-why-pt-body">
              <span className="mlp-why-pt-title">Share with your league</span>
              <span className="mlp-why-pt-desc">Publish a public almanac anyone in your league can open, argue with, and remember.</span>
            </span>
          </div>
        </div>

        <div className="mlp-why-platforms">
          <span className="mlp-why-plat-label">Works with</span>
          <div className="mlp-plat-row">
            <span className="mlp-plat"><span className="mlp-plat-dot live" />Sleeper</span>
            <span className="mlp-plat"><span className="mlp-plat-dot live" />ESPN</span>
            <span className="mlp-plat"><span className="mlp-plat-dot beta" />NFL.com</span>
            <span className="mlp-plat"><span className="mlp-plat-dot beta" />Yahoo</span>
          </div>
        </div>
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
