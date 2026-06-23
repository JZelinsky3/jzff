import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'

export function MobileHome({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="mlp">
      {/* ── Top bar (shrinks on scroll via tsc-hdr-collapsed) ── */}
      <header className="mlp-bar">
        <span className="mlp-bar-title" aria-label="The Sunday Chronicle">
          <span aria-hidden="true">
            T<span className="mlp-bar-fade">{'he '}</span>S<span className="mlp-bar-fade">{'unday '}</span><em>C<span className="mlp-bar-fade">hronicle</span>.</em>
          </span>
        </span>
        {signedIn ? (
          <Link href="/dashboard" className="mlp-bar-link">Library</Link>
        ) : (
          <Link href="/login" className="mlp-bar-link">Sign in</Link>
        )}
      </header>

      {/* ── Screen 1 · The Hook ── */}
      <section className="mlp-screen mlp-hook">
        <div className="mlp-hook-kicker">The League Chronicle</div>
        <h1 className="mlp-hook-title">
          Your league&apos;s history.<br /><em>Bound in one book.</em>
        </h1>
        <p className="mlp-hook-sub">
          One league ID. Every season walked back to the beginning.
          A designed chronicle your whole league can read.
        </p>

        {/* Single book cover */}
        <div className="mlp-book">
          <div className="mlp-book-spine">
            <span className="mlp-book-spine-txt">Chronicle</span>
          </div>
          <div className="mlp-book-cover">
            <div className="mlp-book-inner">
              <span className="mlp-book-crest">★</span>
              <span className="mlp-book-league">Your League</span>
              <span className="mlp-book-rule" />
              <span className="mlp-book-vol">The Complete History</span>
              <span className="mlp-book-years">2018 — 2024</span>
              <span className="mlp-book-seasons">Seven Seasons</span>
              <span className="mlp-book-rule mlp-book-rule-sm" />
              <span className="mlp-book-ft">The Sunday Chronicle</span>
            </div>
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

        {/* Colophon prose ("what is this?") is intentionally NOT rendered on
            mobile. The Hook → Why → Inside → Live → Close screens below
            already convey the same information, and AI crawlers (GPTBot,
            ClaudeBot, PerplexityBot, Googlebot) identify as desktop UAs —
            so the desktop tree's <aside class="lp-colophon"> still satisfies
            the SEO/crawler-context need without forcing phone readers to
            scroll past a paragraph block they don't need. */}
      </section>

      {/* ── Screen 2 · Why This ── */}
      <section className="mlp-screen mlp-why">
        <span className="mlp-why-kicker">Why this one</span>
        <h2 className="mlp-why-title">Your league<br /><em>deserves better</em><br />than a data dump.</h2>

        <div className="mlp-why-points">
          <div className="mlp-why-pt">
            <span className="mlp-why-pt-icon">★</span>
            <span className="mlp-why-pt-body">
              <span className="mlp-why-pt-title">Designed, not generated</span>
              <span className="mlp-why-pt-desc">Every page is laid out like a real publication. Champion rolls, draft boards, career dossiers — all built to look the part.</span>
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
            <span className="mlp-why-pt-icon mlp-why-pt-icon-share">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12V14H12V12"/><path d="M8 10V3"/><path d="M5 5.5L8 2.5L11 5.5"/></svg>
            </span>
            <span className="mlp-why-pt-body">
              <span className="mlp-why-pt-title">Share with your league</span>
              <span className="mlp-why-pt-desc">Publish a public site anyone in your league can open, argue over, and come back to every week.</span>
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

      {/* ── Screen 3 · What's Inside ── */}
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
          {/* Standings preview — cream/paper */}
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

          {/* Records preview — dark/navy, 2-col grid */}
          <div className="mlp-prev">
            <div className="mlp-prev-label">Record Book</div>
            <div className="mlp-prev-body mlp-prev-dark mlp-prev-rec-grid">
              <div className="mlp-prev-rec">
                <span className="mlp-prev-rec-cat">Highest Score</span>
                <span className="mlp-prev-rec-val">186.4</span>
                <span className="mlp-prev-rec-who">Slingers · Wk 12, &apos;22</span>
              </div>
              <div className="mlp-prev-rec">
                <span className="mlp-prev-rec-cat">Win Streak</span>
                <span className="mlp-prev-rec-val">11</span>
                <span className="mlp-prev-rec-who">Tendency · 2024</span>
              </div>
              <div className="mlp-prev-rec">
                <span className="mlp-prev-rec-cat">Closest Final</span>
                <span className="mlp-prev-rec-val">0.5 pts</span>
                <span className="mlp-prev-rec-who">Tendency def. Slingers</span>
              </div>
              <div className="mlp-prev-rec">
                <span className="mlp-prev-rec-cat">Most Titles</span>
                <span className="mlp-prev-rec-val">3</span>
                <span className="mlp-prev-rec-who">PAM Slingers</span>
              </div>
              <div className="mlp-prev-rec">
                <span className="mlp-prev-rec-cat">Biggest Blowout</span>
                <span className="mlp-prev-rec-val">62.1</span>
                <span className="mlp-prev-rec-who">Dad Bod · Wk 4, &apos;23</span>
              </div>
              <div className="mlp-prev-rec">
                <span className="mlp-prev-rec-cat">Playoff Apps</span>
                <span className="mlp-prev-rec-val">12</span>
                <span className="mlp-prev-rec-who">PAM Slingers</span>
              </div>
            </div>
          </div>

          {/* Rivalry preview — cream/paper */}
          <div className="mlp-prev">
            <div className="mlp-prev-label">Rivalries</div>
            <div className="mlp-prev-body mlp-prev-paper mlp-prev-rivalry">
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

          {/* Manager preview — dark/navy */}
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

      {/* ── Screen 4 · Live Season ── */}
      <section className="mlp-screen mlp-live">
        <span className="mlp-live-kicker">Live season tools</span>
        <h2 className="mlp-live-title">It&apos;s not just history.<br /><em>It&apos;s every Sunday.</em></h2>
        <p className="mlp-live-sub">
          During the season, your chronicle comes alive. Tools built
          for the league as a unit — not just the individual.
        </p>

        <div className="mlp-live-tools">
          <div className="mlp-live-tool">
            <span className="mlp-live-tool-num">I</span>
            <span className="mlp-live-tool-body">
              <span className="mlp-live-tool-name">Sunday Live</span>
              <span className="mlp-live-tool-desc">Real-time command center for every matchup, news, and moments as they happen.</span>
            </span>
          </div>
          <div className="mlp-live-tool">
            <span className="mlp-live-tool-num">II</span>
            <span className="mlp-live-tool-body">
              <span className="mlp-live-tool-name">Matchup Preview</span>
              <span className="mlp-live-tool-desc">Weekly slate with form, all-time H2H, projections, and rivalry weight.</span>
            </span>
          </div>
          <div className="mlp-live-tool">
            <span className="mlp-live-tool-num">III</span>
            <span className="mlp-live-tool-body">
              <span className="mlp-live-tool-name">Power Rankings</span>
              <span className="mlp-live-tool-desc">Weekly rankings based on record, points, schedule strength, and recent form.</span>
            </span>
          </div>
          <div className="mlp-live-tool">
            <span className="mlp-live-tool-num">IV</span>
            <span className="mlp-live-tool-body">
              <span className="mlp-live-tool-name">Manager DNA</span>
              <span className="mlp-live-tool-desc">Behavioral profiles — trade hawks, streamers, set-and-forgets — from real data.</span>
            </span>
          </div>
          <div className="mlp-live-tool">
            <span className="mlp-live-tool-num">V</span>
            <span className="mlp-live-tool-body">
              <span className="mlp-live-tool-name">Trade Desk</span>
              <span className="mlp-live-tool-desc">Grader, analyzer, finder, and rumor mill — four rooms for every angle.</span>
            </span>
          </div>
        </div>
      </section>

      {/* ── Screen 5 · The Close ── */}
      <section className="mlp-screen mlp-close">
        <h2 className="mlp-close-title">Bind <em>your</em> league.</h2>
        <p className="mlp-close-sub">
          Pull your seasons in under five minutes. Publish a site your
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
    </main>
  )
}
