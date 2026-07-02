import Link from 'next/link'
import s from './MobileHomeCover.module.css'
import { MobileHomeDock } from './MobileHomeDock'

// Mobile landing v2 — "The Newsstand Cover" (revised after compare-and-mix
// with the previous MobileHome).
//
// Kept from v1: dark ink as app chrome, printed cream paper as the product
// (the framed "in print" standings page), the swipeable chapters rail, and
// the bottom action dock. Adopted from the old MobileHome: the sticky
// collapsing top bar (T·S·C. letter-collapse via the global
// MobileHeaderCollapse body class) and the book-cover hero. The hero paper
// clippings were cut — too big at phone widths.
//
// The dock is the only client JS on the page (scroll-direction shrink);
// everything else is server-rendered with CSS-only behavior.

const CHAPTERS: {
  numeral: string
  title: string
  blurb: string
  href: string
  icon: React.ReactNode
}[] = [
  {
    numeral: 'I',
    title: 'Seasons',
    blurb: 'Every year walked back. Standings, matchups, playoff runs.',
    href: '/demo/seasons/',
    icon: (
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z M4 21a2 2 0 0 1 2-2h13 M8 7h7 M8 11h5" />
    ),
  },
  {
    numeral: 'II',
    title: 'Records',
    blurb: 'Every mark that still stands. Highs, streaks, and heartbreaks.',
    href: '/demo/records.html',
    icon: (
      <path d="M5 20v-8 M12 20V5 M19 20v-11 M3 20h18" />
    ),
  },
  {
    numeral: 'III',
    title: 'Drafts',
    blurb: 'Every board, round by round, back to the first pick ever made.',
    href: '/demo/draft/',
    icon: (
      <path d="M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z" />
    ),
  },
  {
    numeral: 'IV',
    title: 'Managers',
    blurb: 'A dossier for every owner. Career records, titles, head-to-heads.',
    href: '/demo/managers/',
    icon: (
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    ),
  },
  {
    numeral: 'V',
    title: 'Rivalries',
    blurb: 'Hand-picked feuds with running scoreboards since year one.',
    href: '/demo/rivalries/',
    icon: (
      <path d="M13 3 5 14h5l-2 7 9-11h-5l1-7z" />
    ),
  },
  {
    numeral: 'VI',
    title: 'Live Season',
    blurb: 'Synced every Sunday. Previews, best-coach, manager DNA.',
    href: '/demo/live/',
    icon: (
      <path d="M5 9a10 10 0 0 1 14 0 M8 12.5a6 6 0 0 1 8 0 M12 17h.01" />
    ),
  },
]

const STANDINGS: [string, string, string, string][] = [
  ['1', 'Tight End Tendency', '12-2', '1,842.1'],
  ['2', 'PAM Slingers', '11-3', '1,801.6'],
  ['3', 'Dad Bod Dynasty', '10-4', '1,755.4'],
  ['4', 'Pittsburgh Tomlinmen', '9-5', '1,712.0'],
  ['5', 'Iron Sheik Bombers', '8-6', '1,688.3'],
  ['6', 'Bench Mob', '7-7', '1,640.9'],
]

// Same FAQPage JSON-LD the desktop landing ships. Google indexes mobile-first
// (Googlebot smartphone UA gets served THIS tree by the getViewMode fork), so
// the schema has to live here too or category queries lose it.
const FAQ_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Where can I view all my fantasy football league history in one place?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Sunday Chronicle imports every season of a Sleeper, ESPN, NFL.com, or Yahoo fantasy football league and publishes it as a single browsable almanac. Standings, champions, drafts, weekly matchups, manager profiles, rivalries, and a record book all live at one URL that the whole league can read and bookmark.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does The Sunday Chronicle cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Sunday Chronicle has three paid tiers and a permanent free tier. Rookie is $3/month or $15/year for one league. Veteran is $5/month or $25/year for up to three leagues. All-Pro is $15/month or $50/year for up to ten leagues. Every paid plan includes a 7-day free trial. The free tier covers one league forever.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which fantasy football platforms does The Sunday Chronicle support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Sleeper and ESPN are fully live (historical + live-season sync). NFL.com and Yahoo are in beta (historical seasons supported; live-season sync rolling out). You can combine multiple platforms under one league archive if your league has moved between providers.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does it take to set up a league archive?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Under five minutes. Paste your league ID, pick the platform, and The Sunday Chronicle walks every season back to the beginning automatically. Drafts, matchups, standings, transactions, and playoff brackets are imported with no manual entry.',
      },
    },
  ],
}

export function MobileHomeCover({ signedIn }: { signedIn: boolean }) {
  const primaryHref = signedIn ? '/dashboard' : '/login?mode=signup'
  const primaryLabel = signedIn ? 'Open your library' : 'Start your archive'

  return (
    // The bare `mhc` class exists only for the globals.css sibling rule that
    // hides the global hamburger (this bar carries its own Sign in pill).
    <main className={`mhc ${s.main}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }}
      />

      {/* ── Top bar — title letters collapse to T·S·C. on scroll via the
             global MobileHeaderCollapse body class ─────────────────── */}
      <header className={s.bar}>
        <span className={s.barTitle} aria-label="The Sunday Chronicle">
          <span aria-hidden="true">
            T<span className={s.barFade}>{'he '}</span>S
            <span className={s.barFade}>{'unday '}</span>
            <em>
              C<span className={s.barFade}>hronicle</span>.
            </em>
          </span>
        </span>
        {signedIn ? (
          <Link href="/dashboard" className={s.barLink}>
            Library
          </Link>
        ) : (
          <Link href="/login" className={s.barLink}>
            Sign in
          </Link>
        )}
      </header>

      {/* ── The Hook — book-cover hero ────────────────────────── */}
      <section className={s.hook}>
        <div className={s.hookKicker}>The League Chronicle</div>
        <h1 className={s.hookTitle}>
          Your league&apos;s history.
          <br />
          <em>Bound in one book.</em>
        </h1>
        <p className={s.hookSub}>
          One league ID. Every season walked back to the beginning. A designed
          chronicle your whole league can read.
        </p>

        {/* The cover swings open at the spine every few seconds (CSS-only)
            to peek at a printed first page, then settles closed. */}
        <div className={s.book} aria-hidden="true">
          <div className={s.bookSpine}>
            <span className={s.bookSpineTxt}>Chronicle</span>
          </div>
          <div className={s.bookBody}>
            <div className={s.bookPage}>
              <span className={s.bookPageKicker}>Chapter I</span>
              <span className={s.bookPageTitle}>Opening Day.</span>
              <span className={s.bookPageLines} />
              <span className={s.bookPageNum}>p. 1</span>
            </div>
            <div className={s.bookCover}>
              <div className={s.bookInner}>
                <span className={s.bookCrest}>★</span>
                <span className={s.bookLeague}>Your League</span>
                <span className={s.bookRule} />
                <span className={s.bookVol}>The Complete History</span>
                <span className={s.bookYears}>2018-2024</span>
                <span className={s.bookSeasons}>Seven Seasons</span>
                <span className={`${s.bookRule} ${s.bookRuleSm}`} />
                <span className={s.bookFt}>The Sunday Chronicle</span>
              </div>
            </div>
          </div>
        </div>

        <Link href={primaryHref} className={s.hookBtn}>
          {primaryLabel}
        </Link>

        <div className={s.statStrip}>
          <div className={s.stat}>
            <b>5 min</b>
            <span>Setup</span>
          </div>
          <div className={s.stat}>
            <b>4</b>
            <span>Platforms</span>
          </div>
          <div className={s.stat}>
            <b>$0</b>
            <span>To start</span>
          </div>
        </div>
      </section>

      {/* ── Chapters rail ─────────────────────────────────────── */}
      <section className={s.section} aria-label="Chapters of the almanac">
        <div className={s.sectionHead}>
          <div>
            <div className={s.kicker}>Inside the book</div>
            <h2 className={s.h2}>
              Six <em>chapters.</em>
            </h2>
          </div>
          <span className={s.swipeHint} aria-hidden="true">
            Swipe
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <polyline points="9 5 16 12 9 19" />
            </svg>
          </span>
        </div>
        <div className={s.rail}>
          {CHAPTERS.map((ch) => (
            <Link
              key={ch.numeral}
              href={ch.href}
              target="_blank"
              rel="noopener"
              className={s.railCard}
            >
              <span className={s.railNumeral} aria-hidden="true">
                {ch.numeral}
              </span>
              <span className={s.railIcon} aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  {ch.icon}
                </svg>
              </span>
              <span className={s.railChap}>Chapter {ch.numeral}</span>
              <span className={s.railTitle}>{ch.title}</span>
              <span className={s.railBlurb}>{ch.blurb}</span>
              <span className={s.railCta}>View</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── A page, in print ──────────────────────────────────── */}
      <section className={s.paper} aria-label="A finished almanac page">
        <div className={s.paperInner}>
          <div className={s.paperMast}>The Sunday Chronicle</div>
          <div className={s.paperMeta}>Final standings · 2024 · Vol. VII</div>
          <div className={s.paperRules} aria-hidden="true" />
          <div className={s.paperTable}>
            {STANDINGS.map(([rk, name, rec, pf]) => (
              <div key={rk} className={s.paperRow}>
                <span className={s.paperRk}>{rk}</span>
                <span className={s.paperName}>{name}</span>
                <span className={s.paperRec}>{rec}</span>
                <span className={s.paperPf}>{pf}</span>
              </div>
            ))}
          </div>
          <div className={s.paperFoot}>
            <span>thesundaychronicle.app/leagues/your-league</span>
          </div>
          <Link href="/demo/" target="_blank" rel="noopener" className={s.paperBtn}>
            Walk the full demo
          </Link>
          <div className={s.paperCaption}>
            A real league&apos;s seven seasons, cover to cover. No signup.
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section className={s.section}>
        <div className={s.kicker}>How it works</div>
        <h2 className={s.h2}>
          Three <em>steps.</em>
        </h2>
        <div className={s.steps}>
          <div className={s.step}>
            <span className={s.stepNum}>01</span>
            <span className={s.stepBody}>
              <b>Paste your league ID</b>
              Sleeper, ESPN, NFL.com, or Yahoo.
            </span>
          </div>
          <div className={s.step}>
            <span className={s.stepNum}>02</span>
            <span className={s.stepBody}>
              <b>We walk it back</b>
              Seasons, drafts, and matchups, all the way to year one.
            </span>
          </div>
          <div className={s.step}>
            <span className={s.stepNum}>03</span>
            <span className={s.stepBody}>
              <b>Share one link</b>
              The whole league reads the same book.
            </span>
          </div>
        </div>
      </section>

      {/* ── Platforms ─────────────────────────────────────────── */}
      <section className={s.section}>
        <div className={s.kicker}>Platforms</div>
        <h2 className={s.h2}>
          Bring your league <em>from.</em>
        </h2>
        <div className={s.platGrid}>
          <div className={s.plat}>
            <span className={`${s.platDot} ${s.platLive}`} aria-hidden="true" />
            <span className={s.platName}>Sleeper</span>
            <span className={s.platStatus}>Live</span>
          </div>
          <div className={s.plat}>
            <span className={`${s.platDot} ${s.platLive}`} aria-hidden="true" />
            <span className={s.platName}>ESPN</span>
            <span className={s.platStatus}>Live</span>
          </div>
          <div className={s.plat}>
            <span className={`${s.platDot} ${s.platBeta}`} aria-hidden="true" />
            <span className={s.platName}>NFL.com</span>
            <span className={s.platStatus}>Beta</span>
          </div>
          <div className={s.plat}>
            <span className={`${s.platDot} ${s.platBeta}`} aria-hidden="true" />
            <span className={s.platName}>Yahoo</span>
            <span className={s.platStatus}>Beta</span>
          </div>
        </div>
      </section>

      {/* ── The Clubhouse clipping ────────────────────────────── */}
      <section className={s.section}>
        <Link href="/hub/" className={s.clubClip}>
          <span className={s.clubHead}>
            <span>From the site desk</span>
            <span>Open to all</span>
          </span>
          <span className={s.clubTitle}>
            The <em>Clubhouse.</em>
          </span>
          <span className={s.clubSub}>
            Site-wide records, live stats, and league discovery. See what
            every chronicle on the site is up to.
          </span>
          <span className={s.clubCta}>Step inside</span>
        </Link>
      </section>

      {/* ── Pricing teaser ────────────────────────────────────── */}
      <section className={s.section}>
        <div className={s.priceCard}>
          <div className={s.kicker}>Pricing</div>
          <h2 className={s.priceTitle}>
            Free to start. <em>Cheap to keep.</em>
          </h2>
          <p className={s.priceSub}>One league free, forever. Paid plans add leagues and the full live-season kit.</p>
          <div className={s.priceRows}>
            <div className={s.priceRow}>
              <span>Rookie</span>
              <span className={s.priceDots} aria-hidden="true" />
              <b>$3/mo · 1 league</b>
            </div>
            <div className={s.priceRow}>
              <span>Veteran</span>
              <span className={s.priceDots} aria-hidden="true" />
              <b>$5/mo · 3 leagues</b>
            </div>
            <div className={s.priceRow}>
              <span>All-Pro</span>
              <span className={s.priceDots} aria-hidden="true" />
              <b>$15/mo · 10 leagues</b>
            </div>
          </div>
          <div className={s.priceFine}>Every paid plan starts with a 7-day free trial.</div>
          <Link href="/pricing/" className={s.priceLink}>
            See full pricing
          </Link>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────── */}
      <section className={s.section}>
        <div className={s.finalCard}>
          <div className={s.finalKicker}>★ Last call ★</div>
          <h2 className={s.finalTitle}>
            Bind <em>your</em> league.
          </h2>
          <p className={s.finalSub}>
            Five minutes from league ID to a book your league argues about for years.
          </p>
          <Link href={primaryHref} className={s.finalBtn}>
            {primaryLabel}
          </Link>
        </div>
      </section>

      {/* ── Colophon (collapsed) + footer ─────────────────────────
          The full prose stays in the SSR HTML for crawlers (Google indexes
          the mobile tree and reads closed <details> content); readers see
          two lines and a More toggle. No JS — native disclosure element. */}
      <aside className={s.colophon}>
        <details className={s.coloDetails}>
          <summary className={s.coloSummary}>
            <strong>
              The Sunday Chronicle is a fantasy football league history
              almanac.
            </strong>
            <span className={s.coloToggle} aria-hidden="true" />
          </summary>
          <p>
            Paste a Sleeper, ESPN, NFL.com, or Yahoo league ID and it imports
            every season the league has ever existed, then publishes a
            polished public site at one permanent URL. During the NFL season
            the same almanac stays in sync automatically: matchup previews,
            best-coach tracking, manager DNA, milestone watches, weekly
            recaps. One league is free forever; paid plans start at $3 a
            month with a 7-day trial.
          </p>
        </details>
      </aside>

      <footer className={s.footer}>
        <nav className={s.footLinks} aria-label="Site">
          <Link href="/about/">About</Link>
          <Link href="/pricing/">Pricing</Link>
          <Link href="/guides/">Guides</Link>
          <Link href="/privacy/">Privacy</Link>
          <Link href="/terms/">Terms</Link>
        </nav>
        <div className={s.footRow}>
          {signedIn ? (
            <Link href="/dashboard" className={s.footAction}>
              Your library
            </Link>
          ) : (
            <Link href="/login" className={s.footAction}>
              Sign in
            </Link>
          )}
          <a href="/api/view/?mode=desktop&to=/" className={s.footAction}>
            Desktop site
          </a>
        </div>
        <div className={s.footFine}>© 2026 The Sunday Chronicle · JZFF</div>
      </footer>

      <MobileHomeDock signedIn={signedIn} />
    </main>
  )
}
