import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'

// Phone-only landing page. Served instead of the desktop tree when the
// request is from a mobile UA (see src/app/page.tsx + src/lib/viewMode.ts).
//
// Deliberately server-rendered with zero bespoke client JS: the heavy
// desktop client components (ChroniclePages horizontal-scroll rail,
// HeroClipping rotator, DemoViewer iframe, LandingNav mega-menu, the
// WelcomePopup) are NOT imported here, so phones download none of them.
// The global mobile nav (MobileSiteMenu) is already mounted in the root
// layout and floats its avatar/hamburger trigger over the masthead.
//
// Mobile rework rules (see project memory): short copy, dense cards that
// don't eat the whole viewport, tight consistent spacing, no full-bleed.

const TICKER = [
  'Live Season Hub · Matchup Preview · Best Coach',
  'Trade Grader · Milestones · Records Watch',
  'Manager DNA · live-season tells',
  'Free tier — one league, forever',
  'Sleeper · ESPN · Yahoo · NFL.com',
]

// Five chapter cards. Same five "pages of the Chronicle" the desktop rail
// shows, trimmed to a tap target + one-line blurb each.
const CHAPTERS: { num: string; chapter: string; title: string; em: string; blurb: string; href: string }[] = [
  { num: 'I',   chapter: 'Season',     title: 'Season',  em: 'Archives.',  blurb: 'Every year walked back — standings, matchups, playoff runs.', href: '/demo/seasons/' },
  { num: 'II',  chapter: 'Champions',  title: 'Champion', em: 'Rolls.',    blurb: 'Trophy lifters, runner-ups, and the kings who never got there.', href: '/demo/records.html' },
  { num: 'III', chapter: 'Drafts',     title: 'Draft',   em: 'Boards.',    blurb: 'Round by round, every year. Tap a name, read every season since.', href: '/demo/draft/' },
  { num: 'IV',  chapter: 'Managers',   title: 'Manager', em: 'Dossiers.',  blurb: 'A page per owner — career record, titles, head-to-head.', href: '/demo/managers/' },
  { num: 'V',   chapter: 'Rivalries',  title: 'The',     em: 'Rivalries.', blurb: 'Hand-picked feuds with running scoreboards.', href: '/demo/rivalries/' },
]

const PLATFORMS: { name: string; status: string; pill: string; klass: string }[] = [
  { name: 'Sleeper',  status: 'Available', pill: 'Live', klass: '' },
  { name: 'ESPN',     status: 'Available', pill: 'Live', klass: '' },
  { name: 'NFL.com',  status: 'Testing',   pill: 'Beta', klass: 'cream' },
  { name: 'Yahoo',    status: 'Testing',   pill: 'Beta', klass: 'cream' },
]

export function MobileHome({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="mlp-main">
      {/* Ticker — reuses the global .ticker styles; the MobileSiteMenu
          trigger anchors its top offset to this element on the landing. */}
      <div className="ticker">
        <div className="ticker-track">
          <div className="ticker-group">
            {TICKER.map((t, i) => (
              <span key={`a-${i}`} className="ticker-item"><span className="ticker-star">★</span> {t}</span>
            ))}
          </div>
          <div className="ticker-group">
            {TICKER.map((t, i) => (
              <span key={`b-${i}`} className="ticker-item"><span className="ticker-star">★</span> {t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Masthead. The avatar/hamburger trigger floats top-right (global). */}
      <header className="mlp-mast">
        <div className="mlp-mast-kicker">Vol. II · The League Almanac</div>
        <div className="mlp-mast-title">The Sunday <em>Chronicle.</em></div>
      </header>

      {/* Hero */}
      <section className="mlp-hero">
        <div className="mlp-hero-sup">★ JZFF · Est. 2026 ★</div>
        <h1 className="mlp-hero-title">Your league.<br /><em>Bound forever.</em></h1>
        <p className="mlp-hero-sub">
          An almanac for the history of the league. Bring a league ID and we walk
          every season back to the beginning.
        </p>
        <div className="mlp-ctas">
          {signedIn ? (
            <>
              <Link href="/dashboard" className="dc-btn">Open your library</Link>
              <Link href="/dashboard/new" className="dc-btn-ghost">Add a league</Link>
            </>
          ) : (
            <>
              <Link href="/login?mode=signup" className="dc-btn">Start your archive</Link>
              <Link href="/login" className="dc-btn-ghost">Sign in</Link>
            </>
          )}
        </div>
        <div className="mlp-hero-meta">
          <span>Free until the 2026 season</span>
          <span className="mlp-dot">·</span>
          <span>No card to start</span>
        </div>

        {/* One static almanac page (the rotating desktop version ships JS;
            on mobile we print a single representative leaf). */}
        <article className="mlp-leaf" aria-label="A page from a finished almanac">
          <div className="mlp-leaf-head">
            <span>Ch. II · Champion Rolls</span>
            <span>p. 47</span>
          </div>
          <div className="mlp-leaf-orn" aria-hidden="true">
            <span className="mlp-leaf-rule" />✦<span className="mlp-leaf-rule" />
          </div>
          <h3 className="mlp-leaf-title">Champion, <em>2024.</em></h3>
          <p className="mlp-leaf-lead">Tendency, at last — by a half-point and a Monday-night kicker.</p>
          <div className="mlp-leaf-feature">
            <span className="mlp-leaf-feature-lbl">Final</span>
            <span className="mlp-leaf-feature-val">Tendency 142.6 · Slingers 142.1</span>
          </div>
        </article>
      </section>

      {/* §02 · Pages of the Chronicle — vertical card stack */}
      <section className="mlp-section">
        <div className="mlp-section-head">
          <span className="mlp-section-num">§ 02 · The Pages</span>
          <span className="mlp-section-title">Five pages of the <em>chronicle.</em></span>
        </div>
        <div className="mlp-chapters">
          {CHAPTERS.map((c) => (
            <Link key={c.num} href={c.href} target="_blank" rel="noopener" className="mlp-chapter">
              <span className="mlp-chapter-num">{c.num}</span>
              <span className="mlp-chapter-body">
                <span className="mlp-chapter-kicker">Chapter {c.num} · {c.chapter}</span>
                <span className="mlp-chapter-title">{c.title} <em>{c.em}</em></span>
                <span className="mlp-chapter-blurb">{c.blurb}</span>
              </span>
              <span className="mlp-chapter-arrow" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      </section>

      {/* §03 · See it live */}
      <section className="mlp-section">
        <div className="mlp-section-head">
          <span className="mlp-section-num">§ 03 · See it live</span>
          <span className="mlp-section-title">Tour a finished <em>almanac.</em></span>
        </div>
        <p className="mlp-lede">
          Walk a real league&apos;s seven-year history — every page populated, every link
          working. The exact almanac you&apos;ll get for your league.
        </p>
        <a href="/demo/" target="_blank" rel="noopener" className="mlp-demo-card">
          <span className="mlp-demo-tag">▶ Demo</span>
          <span className="mlp-demo-title">Lakeside <em>League.</em></span>
          <span className="mlp-demo-meta">7 seasons · Sleeper</span>
          <span className="mlp-demo-cta">Open the demo</span>
        </a>
      </section>

      {/* §04 · Platforms */}
      <section className="mlp-section">
        <div className="mlp-section-head">
          <span className="mlp-section-num">§ 04 · Platforms</span>
          <span className="mlp-section-title">Bring your league <em>from —</em></span>
        </div>
        <div className="mlp-platforms">
          {PLATFORMS.map((p) => (
            <div key={p.name} className="mlp-platform">
              <span className="mlp-platform-dot" aria-hidden="true">●</span>
              <span className="mlp-platform-body">
                <span className="mlp-platform-name">{p.name}</span>
                <span className="mlp-platform-status">{p.status}</span>
              </span>
              <span className={`mlp-pill ${p.klass}`}>{p.pill}</span>
            </div>
          ))}
        </div>
      </section>

      {/* §05 · Final CTA */}
      <section className="mlp-final">
        <div className="mlp-final-kicker">★ Last call · Free preview ★</div>
        <h2 className="mlp-final-title">Bind <em>your</em> league.</h2>
        <p className="mlp-final-sub">
          Pull your seasons in under five minutes. Publish a public almanac your league
          can read, argue with, and remember.
        </p>
        <div className="mlp-ctas">
          {signedIn ? (
            <Link href="/dashboard/new" className="dc-btn">Add a league</Link>
          ) : (
            <Link href="/login?mode=signup" className="dc-btn">Start your archive</Link>
          )}
          <a href="/demo/" target="_blank" rel="noopener" className="dc-btn-ghost">Walk the demo</a>
        </div>
      </section>

      <SiteFooter />

      {/* Escape hatch to the full desktop layout. Routes through /api/view
          to set the dc_view cookie (Server Components can't set cookies). */}
      <a className="mlp-viewswitch" href="/api/view/?mode=desktop&to=/">View desktop site</a>
    </main>
  )
}
