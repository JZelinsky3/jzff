import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'

// Phone-only landing page. Served instead of the desktop tree when the
// request is from a mobile UA (see src/app/page.tsx + src/lib/viewMode.ts).
//
// NOT a shrunk desktop. Modeled on the per-league mobile site
// (src/templates/pams-mobile/index.html): a content-forward FEED that
// surfaces the actual almanac data in mobile-native cards — a real
// standings snapshot, a champion roll, a swipeable draft strip, a manager
// dossier, a rivalry scoreboard — each with a "tour it" link to the demo.
// The visitor SEES the product instead of reading promises about it.
//
// Sample data is the same hardcoded demo set the desktop ChroniclePages
// renders, so the two stay in sync. Server-rendered, zero bespoke client JS
// (the swipeable draft strip is plain CSS overflow). The global
// MobileSiteMenu (root layout) supplies the nav trigger and anchors to the
// .ticker we render here.

const TICKER = [
  'Season Archives · Champion Rolls · Draft Boards',
  'Manager Dossiers · Head-to-head · Rivalries',
  'Free tier — one league, forever',
  'Sleeper · ESPN · Yahoo · NFL.com',
]

const STANDINGS: [string, string, string, string][] = [
  ['1', 'Tight End Tendency', '12–2', '1,842.1'],
  ['2', 'PAM Slingers', '11–3', '1,801.6'],
  ['3', 'Dad Bod Dynasty', '10–4', '1,755.4'],
  ['4', 'Pittsburgh Tomlinmen', '9–5', '1,712.0'],
  ['5', 'Iron Sheik Bombers', '8–6', '1,688.3'],
]

const CHAMPS: [string, string, string][] = [
  ['2024', 'Tendency', 'def. Slingers · 142.6–142.1'],
  ['2023', 'Dad Bod', 'def. Tendency · 138.0–119.4'],
  ['2022', 'Slingers', 'def. Bombers · 156.3–122.0'],
  ['2021', 'Slingers', 'def. Tomlinmen · 130.4–128.1'],
]

const DRAFT: [string, string, string][] = [
  ['1.01', 'CMC', 'Tendency'],
  ['1.02', "Ja'Marr", 'Slingers'],
  ['1.03', 'Bijan', 'Dad Bod'],
  ['1.04', 'Jefferson', 'Tomlinmen'],
  ['1.05', 'Lamb', 'Bombers'],
  ['1.06', 'Chase', 'Bench Mob'],
  ['1.07', 'Hill', 'Tendency'],
  ['1.08', 'Ekeler', 'Slingers'],
]

const DOSSIER: [string, string][] = [
  ['Titles', '3'],
  ['Finals', '5'],
  ['Reg. W%', '.682'],
  ['Playoffs', '12'],
  ['All-time PF', '12,144'],
  ['vs. Tendency', '6–4'],
]

const RIVALRY_LINES: [string, string][] = [
  ['2024 · Wk. 14', 'Slingers 132.4–128.7'],
  ['2023 · QF', 'Dad Bod 121.8–118.5'],
  ['2023 · Wk. 11', 'Slingers 144.3–99.1'],
]

const PLATFORMS: { name: string; status: string; pill: string; klass: string }[] = [
  { name: 'Sleeper', status: 'Available', pill: 'Live', klass: '' },
  { name: 'ESPN', status: 'Available', pill: 'Live', klass: '' },
  { name: 'NFL.com', status: 'Testing', pill: 'Beta', klass: 'cream' },
  { name: 'Yahoo', status: 'Testing', pill: 'Beta', klass: 'cream' },
]

function SectionHead({ num, kicker, title, em, href, link }: {
  num: string; kicker: string; title: string; em: string; href: string; link: string
}) {
  return (
    <div className="mlp-section-head">
      <div className="mlp-section-headl">
        <span className="mlp-section-num">{num}</span>
        <span className="mlp-section-kicker">{kicker}</span>
        <span className="mlp-section-title">{title} <em>{em}</em></span>
      </div>
      <Link href={href} target="_blank" rel="noopener" className="mlp-section-link">{link}</Link>
    </div>
  )
}

export function MobileHome({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="mlp-main">
      {/* Ticker — reuses global .ticker styles; the MobileSiteMenu trigger
          anchors its offset to this element on the landing. */}
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

      {/* Masthead — top-right corner left clear for the global menu trigger. */}
      <header className="mlp-mast">
        <div className="mlp-mast-kicker">Vol. II · The League Almanac</div>
        <div className="mlp-mast-title">The Sunday <em>Chronicle.</em></div>
      </header>

      {/* Hero */}
      <section className="mlp-hero">
        <div className="mlp-hero-sup">★ JZFF · Est. 2026 ★</div>
        <h1 className="mlp-hero-title">Your league.<br /><em>Bound forever.</em></h1>
        <p className="mlp-hero-sub">
          An almanac for the history of the league. Bring a league ID and we walk every
          season back to the beginning. Here&apos;s what your book holds —
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
      </section>

      {/* §01 · Season Archives — a real final-standings snapshot */}
      <section className="mlp-section">
        <SectionHead num="§ 01" kicker="Season Archives" title="The" em="Table." href="/demo/seasons/" link="Tour" />
        <div className="mlp-card mlp-paper">
          <div className="mlp-paper-head"><span>Final Standings · 2024</span><span>Wk. 17</span></div>
          <div className="mlp-stand">
            {STANDINGS.map(([rk, name, rec, pf]) => (
              <div key={rk} className="mlp-stand-row">
                <span className="mlp-stand-rk">{rk}</span>
                <span className="mlp-stand-name">{name}</span>
                <span className="mlp-stand-rec">{rec}</span>
                <span className="mlp-stand-pf">{pf}</span>
              </div>
            ))}
          </div>
          <div className="mlp-paper-foot">Every season, every matchup — walked back to the beginning.</div>
        </div>
      </section>

      {/* §02 · Champion Rolls — a real roll of title games */}
      <section className="mlp-section">
        <SectionHead num="§ 02" kicker="Champion Rolls" title="The" em="Lifters." href="/demo/records.html" link="Record book" />
        <div className="mlp-card mlp-paper">
          <div className="mlp-roll">
            {CHAMPS.map(([yr, ch, fin]) => (
              <div key={yr} className="mlp-roll-row">
                <span className="mlp-roll-yr">{yr}</span>
                <span className="mlp-roll-body">
                  <span className="mlp-roll-ch">{ch}</span>
                  <span className="mlp-roll-fin">{fin}</span>
                </span>
                <span className="mlp-roll-trophy" aria-hidden="true">★</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* §03 · Draft Boards — a real swipeable round-1 strip */}
      <section className="mlp-section">
        <SectionHead num="§ 03" kicker="Draft Boards" title="Round" em="One." href="/demo/draft/" link="Full board" />
        <div className="mlp-draft" role="list" aria-label="2024 Round 1 draft board">
          {DRAFT.map(([pk, ply, mgr]) => (
            <div key={pk} className="mlp-pick" role="listitem">
              <span className="mlp-pick-no">{pk}</span>
              <span className="mlp-pick-name">{ply}</span>
              <span className="mlp-pick-mgr">{mgr}</span>
            </div>
          ))}
        </div>
        <p className="mlp-draft-note">2024 · 10-team · ½ PPR — swipe the board →</p>
      </section>

      {/* §04 · Manager Dossiers — a real career card */}
      <section className="mlp-section">
        <SectionHead num="§ 04" kicker="Manager Dossiers" title="The" em="Dossier." href="/demo/managers/" link="All managers" />
        <div className="mlp-card mlp-dossier">
          <div className="mlp-dossier-head">
            <span className="mlp-dossier-av" aria-hidden="true">JK</span>
            <span className="mlp-dossier-id">
              <span className="mlp-dossier-name">Jake K. <em>· PAM Slingers</em></span>
              <span className="mlp-dossier-tag">Joined 2018 · Seven seasons</span>
            </span>
          </div>
          <div className="mlp-dossier-stats">
            {DOSSIER.map(([k, v]) => (
              <span key={k} className="mlp-dossier-stat">
                <span className="mlp-dossier-val">{v}</span>
                <span className="mlp-dossier-lbl">{k}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* §05 · Rivalries — a real running scoreboard */}
      <section className="mlp-section">
        <SectionHead num="§ 05" kicker="Bad Blood" title="The" em="Rivalries." href="/demo/rivalries/" link="All rivalries" />
        <div className="mlp-card mlp-rivalry">
          <div className="mlp-rivalry-vs">
            <span className="mlp-rivalry-side">
              <span className="mlp-rivalry-name">Slingers</span>
              <span className="mlp-rivalry-rec">9</span>
            </span>
            <span className="mlp-rivalry-dash">—</span>
            <span className="mlp-rivalry-side">
              <span className="mlp-rivalry-rec">7</span>
              <span className="mlp-rivalry-name">Dad Bod</span>
            </span>
          </div>
          <div className="mlp-rivalry-meta">16 meetings · since 2018</div>
          <div className="mlp-rivalry-lines">
            {RIVALRY_LINES.map(([when, score]) => (
              <div key={when} className="mlp-rivalry-line"><span>{when}</span><span>{score}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* §06 · See it live — open the full demo almanac */}
      <section className="mlp-section">
        <SectionHead num="§ 06" kicker="See it live" title="The whole" em="book." href="/demo/" link="Open" />
        <a href="/demo/" target="_blank" rel="noopener" className="mlp-demo-card">
          <span className="mlp-demo-tag">▶ Demo</span>
          <span className="mlp-demo-title">Lakeside <em>League.</em></span>
          <span className="mlp-demo-meta">7 seasons · every page populated · Sleeper</span>
          <span className="mlp-demo-cta">Walk a real league&apos;s history</span>
        </a>
      </section>

      {/* §07 · Platforms */}
      <section className="mlp-section">
        <SectionHead num="§ 07" kicker="Platforms" title="Bring it" em="from —" href="/guides" link="Guides" />
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

      {/* Final CTA */}
      <section className="mlp-final">
        <div className="mlp-final-kicker">★ Last call · Free preview ★</div>
        <h2 className="mlp-final-title">Bind <em>your</em> league.</h2>
        <p className="mlp-final-sub">
          Pull your seasons in under five minutes. Publish a public almanac your league can
          read, argue with, and remember.
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

      {/* Escape hatch to the desktop layout (sets dc_view cookie via /api/view). */}
      <a className="mlp-viewswitch" href="/api/view/?mode=desktop&to=/">View desktop site</a>
    </main>
  )
}
