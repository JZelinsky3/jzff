import Link from 'next/link'
import s from './MobileHomeCover.module.css'

// Mobile landing v2 — "The Newsstand Cover".
//
// Design thesis: the dark ink is the app's chrome; the PRODUCT is printed
// paper. So the almanac itself always appears as cream paper clippings
// (hero clipping, the in-print standings page), while everything around it
// behaves like a native app: scrolling identity sash, swipeable chapters
// rail, persistent bottom action dock.
//
// Ships zero client JS — the sash marquee and the cycling hero clipping are
// pure CSS animations, the chapters rail is CSS scroll-snap. Server
// component all the way down.

const SASH_ITEMS = [
  'Est. 2026 · Vol. II',
  'Sleeper · ESPN · NFL.com · Yahoo',
  'One league free, forever',
  'Live season tools included',
]

// Hero clippings — three vignettes from the demo league (same stories the
// desktop HeroClipping rotates through), printed as paper scraps. Cycled
// by CSS animation, 8s per clipping.
const CLIPPINGS = [
  {
    chapter: 'Ch. II · Champion Rolls',
    page: 'p. 47',
    title: ['Champion,', '2024.'],
    line: 'Tendency 142.6 · Slingers 142.1',
    sub: 'Decided by a Monday-night kicker. The book records the result, not the heartbreak.',
  },
  {
    chapter: 'Ch. III · Record Book',
    page: 'p. 112',
    title: ['Single-week', 'high.'],
    line: '198.4 · Dad Bod · Wk 9, 2022',
    sub: 'The league high-water mark, kept in print so the argument can rest.',
  },
  {
    chapter: 'Ch. V · Rivalries',
    page: 'p. 184',
    title: ['Slingers vs.', 'Dad Bod.'],
    line: '9 to 7 · 16 meetings',
    sub: 'Every Sunday they ruined for each other, with a running scoreboard.',
  },
]

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
    title: 'Champions',
    blurb: 'Trophy lifters, runners-up, and the kings who never got there.',
    href: '/demo/records.html',
    icon: (
      <path d="M7 3h10v6a5 5 0 0 1-10 0V3z M7 5H4.5a1 1 0 0 0-1 1c0 2.4 1.7 4 3.7 4.3 M17 5h2.5a1 1 0 0 1 1 1c0 2.4-1.7 4-3.7 4.3 M12 14v3.5 M8.5 21h7" />
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
    href: '/demo/',
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

// Same FAQPage JSON-LD the desktop landing ships. Google indexes mobile-first,
// so the mobile tree is the version crawlers actually read — the schema has
// to live here too or category queries lose it.
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
  const secondaryHref = signedIn ? '/dashboard/new' : '/demo/'
  const secondaryLabel = signedIn ? 'Add a league' : 'Demo'

  return (
    <main className={s.main}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }}
      />

      {/* Identity sash. Height (38px / 34px under 520px) is load-bearing:
          the global .msm-root--landing menu trigger offsets itself by
          exactly this much to land on the masthead row. */}
      <div className={s.sash} aria-hidden="true">
        <div className={s.sashTrack}>
          {[0, 1].map((g) => (
            <div key={g} className={s.sashGroup}>
              {SASH_ITEMS.map((item, i) => (
                <span key={i} className={s.sashItem}>
                  <span className={s.sashStar}>★</span> {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <header className={s.masthead}>
        <div className={s.mastKicker}>Vol. II · The League Almanac</div>
        <div className={s.mastTitle}>
          The Sunday <em>Chronicle.</em>
        </div>
      </header>

      {/* ── Cover ─────────────────────────────────────────────── */}
      <section className={s.hero}>
        <div className={s.heroSup}>★ Fantasy football, bound in print ★</div>
        <h1 className={s.heroTitle}>
          Your league.
          <br />
          <em>Bound forever.</em>
        </h1>
        <p className={s.heroSub}>
          Paste a league ID. Every season your league has ever played comes
          back as one public almanac.
        </p>
        <div className={s.heroMeta}>
          <span>Free until the 2026 season</span>
          <span className={s.heroMetaSep}>·</span>
          <span>No card to start</span>
        </div>

        {/* Cycling paper clipping. Whole stack links to the demo. */}
        <Link
          href="/demo/"
          target="_blank"
          rel="noopener"
          className={s.clipWrap}
          aria-label="Pages from a finished almanac. Opens the demo league."
        >
          <span className={s.clipShadow1} aria-hidden="true" />
          <span className={s.clipShadow2} aria-hidden="true" />
          <span className={s.clipStack}>
            {CLIPPINGS.map((c, i) => (
              <span key={i} className={s.clip}>
                <span className={s.clipHead}>
                  <span>{c.chapter}</span>
                  <span>{c.page}</span>
                </span>
                <span className={s.clipRule} aria-hidden="true">
                  ✦
                </span>
                <span className={s.clipTitle}>
                  {c.title[0]} <em>{c.title[1]}</em>
                </span>
                <span className={s.clipLine}>{c.line}</span>
                <span className={s.clipSub}>{c.sub}</span>
              </span>
            ))}
            <span className={s.clipSeal} aria-hidden="true">
              Demo
              <br />
              Vol. VII
            </span>
          </span>
          <span className={s.clipCaption}>From a real seven-year league · tap to open</span>
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
              <span className={s.railCta}>Open in the demo</span>
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
            Every page populated, every link working. No signup.
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

      {/* ── Colophon + footer ─────────────────────────────────── */}
      <aside className={s.colophon}>
        <p>
          <strong>The Sunday Chronicle is a fantasy football league history
          almanac.</strong>{' '}
          Paste a Sleeper, ESPN, NFL.com, or Yahoo league ID and it imports
          every season the league has ever existed, then publishes a polished
          public site at one permanent URL. During the NFL season the same
          almanac stays in sync automatically.
        </p>
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

      {/* ── Persistent action dock ────────────────────────────── */}
      <div className={s.dock}>
        <Link href={primaryHref} className={s.dockPrimary}>
          {primaryLabel}
        </Link>
        <Link
          href={secondaryHref}
          className={s.dockGhost}
          {...(!signedIn ? { target: '_blank', rel: 'noopener' } : {})}
        >
          {secondaryLabel}
        </Link>
      </div>
    </main>
  )
}
