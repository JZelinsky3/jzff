import type { Metadata } from "next"
import Link from "next/link"
import { BackButton } from "@/components/BackButton"
import { SiteFooter } from "@/components/SiteFooter"
import { MobileAbout } from "@/components/about/MobileAbout"
import { createClient } from "@/lib/supabase/server"
import { getViewMode } from "@/lib/viewMode"

export const metadata: Metadata = {
  title: "About · Fantasy football league archive built for commissioners",
  description:
    "The Sunday Chronicle turns any fantasy football league's full history into the best-designed public-facing almanac on the web. Works with Sleeper, ESPN, Yahoo, and NFL.com.",
  alternates: { canonical: "https://thesundaychronicle.app/about/" },
}

// FAQ schema markup so AI tools + Google parse the Q&A blocks as structured
// answers rather than free text.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is The Sunday Chronicle?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Sunday Chronicle is a SaaS that takes a fantasy football league ID and turns the league's entire history into a public-facing almanac with chapters for standings, champions, drafts, manager profiles, head-to-head records, and rivalries.",
      },
    },
    {
      "@type": "Question",
      name: "Which fantasy football platforms does it support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sleeper (full historical + live season), ESPN (full historical + live season, with cookie pasting for private leagues), and NFL.com (historical seasons only). Yahoo support is in progress, blocked on Yahoo's developer portal.",
      },
    },
    {
      "@type": "Question",
      name: "How much does The Sunday Chronicle cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Three tiers. Rookie at $3/month or $15/year for 1 league. Veteran at $5/month or $25/year for up to 3 leagues. All-Pro at $15/month or $50/year for up to 10 leagues. Every plan has a 7-day free trial; one trial per user lifetime.",
      },
    },
    {
      "@type": "Question",
      name: "Who is The Sunday Chronicle for?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Fantasy football commissioners running long-standing dynasty or redraft leagues who want a permanent shareable record of their league's history. Especially useful for leagues that have moved between platforms or have years of context scattered across screenshots and group chats.",
      },
    },
    {
      "@type": "Question",
      name: "Where can I see what the almanac looks like?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Visit thesundaychronicle.app/demo/ for a fully-populated demo built from a real seven-year fantasy league's history. No signup required.",
      },
    },
    {
      "@type": "Question",
      name: "Who built it?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Built and maintained by JZFF (jzffgames@gmail.com), a one-person indie product.",
      },
    },
  ],
}

// Chapters of a finished almanac, rendered as the "table of contents"
// plate in §03. Purely illustrative; the real chapter list depends on
// what a league's sources can reach.
const CHAPTERS = [
  { n: "I", title: "Standings, all-time", note: "Every season, one table" },
  { n: "II", title: "The Champions' Roll", note: "Banners and near-misses" },
  { n: "III", title: "Season Archives", note: "Year by year, week by week" },
  { n: "IV", title: "The Record Book", note: "Highs, lows, heartbreaks" },
  { n: "V", title: "Draft History", note: "Steals and busts, receipted" },
  { n: "VI", title: "Manager Dossiers", note: "A page per manager" },
  { n: "VII", title: "Rivalries", note: "Hand-curated feuds" },
  { n: "VIII", title: "Pick'ems & Power Ranks", note: "The weekly paper trail" },
]

export default async function AboutPage() {
  // Auth check feeds both trees: the mobile shell's menu and the desktop
  // nav's Library/Login slot.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if ((await getViewMode()) === 'mobile') {
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
        <MobileAbout signedIn={!!user} />
      </>
    )
  }

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <nav className="nav">
        <BackButton fallbackHref="/" ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">About · The Sunday Chronicle</div>
          <div className="nav-title">What <em>this is.</em></div>
        </div>
        <div className="pricing-nav-right">
          <Link href="/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Home</span>
          </Link>
          <Link href="/pricing/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Pricing</span>
          </Link>
          <Link href="/guides/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Guides</span>
          </Link>
          {user ? (
            <Link href="/dashboard" className="pricing-nav-cta">
              Library <span className="pricing-nav-cta-arrow" aria-hidden>→</span>
            </Link>
          ) : (
            <Link href="/login" className="pricing-nav-cta">
              Login <span className="pricing-nav-cta-arrow" aria-hidden>→</span>
            </Link>
          )}
        </div>
      </nav>

      <section className="hero" style={{ paddingTop: "3rem", paddingBottom: "1rem" }}>
        <div className="hero-sup">★ For the commissioner who keeps the records ★</div>
        <h1 className="hero-title" style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}>
          A league's <em>history,</em> done right.
        </h1>
        <p className="hero-sub">
          Paste a league ID. We walk back through every season your league has
          existed and print the whole story into one shareable almanac.
        </p>
      </section>

      {/* ── § 01 · The pitch: prose spread + specimen page ─────────── */}
      <div className="section abt-section">
        <div className="section-header">
          <span className="section-num">§ 01 · The pitch</span>
          <span className="section-title">Why this exists</span>
          <span className="section-meta">Two minutes, front to back</span>
        </div>
        <div className="abt-spread">
          <div className="abt-prose">
            <p className="abt-lede">
              Every league has a history. Ten years of drafts, collapses, revenge
              games, and one guy who still brings up the 2019 championship. The
              problem is where that history lives: buried in screenshots, group
              chats, and platform screens that reset every August.
            </p>
            <p>
              The Sunday Chronicle walks back through every season your league ID
              can reach and typesets the whole record into a single public
              almanac. It is, we think, the best-designed fantasy football
              almanac on the web, and the polish is the point: most league
              history goes unkept because it never looked worth keeping.
              Standings, champions, drafts, head-to-head ledgers,
              hand-curated rivalries, weekly pick&apos;ems. One URL your league
              passes around forever, like{" "}
              <code>thesundaychronicle.app/leagues/your-league/</code>.
            </p>
            <p>
              It&apos;s built for commissioners of long-standing leagues, and it
              especially earns its keep when a league has moved platforms over
              the years. Yahoo to ESPN to Sleeper? The almanac stitches the eras
              back into one book.
            </p>
          </div>

          {/* Decorative "specimen" front page. Pure ornament: it gives the
              reader something to look at that resembles the product without
              being a screenshot that goes stale. */}
          <div className="abt-specimen" aria-hidden>
            <div className="abt-specimen-page">
              <div className="abt-specimen-mast">The Sunday <em>Chronicle.</em></div>
              <div className="abt-specimen-dateline">
                <span>Vol. VII</span><span>·</span><span>Your league&apos;s almanac</span><span>·</span><span>Sunday</span>
              </div>
              <div className="abt-specimen-head">Champions, feuds &amp; the record book.</div>
              <div className="abt-specimen-cols">
                <span className="abt-specimen-col" />
                <span className="abt-specimen-col" />
                <span className="abt-specimen-col" />
              </div>
              <div className="abt-specimen-strip">
                <span>§ Standings</span>
                <span>§ Drafts</span>
                <span>§ Rivalries</span>
              </div>
              <div className="abt-specimen-seal">★</div>
            </div>
            <div className="abt-specimen-caption">Fig. 1 · A finished front page</div>
          </div>
        </div>
      </div>

      {/* ── § 02 · How it works: three plates ──────────────────────── */}
      <div className="section abt-section">
        <div className="section-header">
          <span className="section-num">§ 02 · How it works</span>
          <span className="section-title">Three moves</span>
          <span className="section-meta">About thirty seconds of typing</span>
        </div>
        <div className="abt-steps">
          <div className="abt-step">
            <div className="abt-step-icon">
              <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="7" width="24" height="18" rx="1.5" />
                <line x1="8" y1="13" x2="17" y2="13" />
                <line x1="8" y1="17" x2="24" y2="17" />
                <line x1="8" y1="21" x2="14" y2="21" />
                <circle cx="22" cy="12" r="1.4" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div className="abt-step-num">I</div>
            <div className="abt-step-title">Paste your league ID</div>
            <div className="abt-step-desc">
              Sleeper, ESPN, or NFL.com. Private ESPN leagues just need two
              cookies pasted alongside it.
            </div>
          </div>
          <div className="abt-step">
            <div className="abt-step-icon">
              <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="14" r="5.5" />
                <circle cx="11" cy="14" r="1.2" fill="currentColor" stroke="none" />
                <path d="M16.5 12h9M16.5 16h9" />
                <path d="M20 9l6-3v20l-6-3" />
              </svg>
            </div>
            <div className="abt-step-num">II</div>
            <div className="abt-step-title">The press runs</div>
            <div className="abt-step-desc">
              We walk every season the ID can reach and typeset the full
              history. Drafts, matchups, standings, the lot.
            </div>
          </div>
          <div className="abt-step">
            <div className="abt-step-icon">
              <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 19l6-6" />
                <path d="M15.5 21.5l-2.4 2.4a4.2 4.2 0 0 1-6-6l2.4-2.4" />
                <path d="M16.5 10.5l2.4-2.4a4.2 4.2 0 0 1 6 6l-2.4 2.4" />
              </svg>
            </div>
            <div className="abt-step-num">III</div>
            <div className="abt-step-title">Hand out one URL</div>
            <div className="abt-step-desc">
              Your league gets a public almanac. No app to install, no accounts
              for your leaguemates.
            </div>
          </div>
        </div>
      </div>

      {/* ── § 03 · What's inside: table of contents plate ──────────── */}
      <div className="section abt-section">
        <div className="section-header">
          <span className="section-num">§ 03 · What&apos;s inside</span>
          <span className="section-title">Table of contents</span>
          <span className="section-meta">Every almanac ships with these</span>
        </div>
        <div className="abt-toc">
          {CHAPTERS.map((c) => (
            <div key={c.n} className="abt-toc-row">
              <span className="abt-toc-title">
                {c.title}
                <span className="abt-toc-note">{c.note}</span>
              </span>
              <span className="abt-toc-leader" aria-hidden />
              <span className="abt-toc-num">Ch. {c.n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── § 04 · Platforms ledger ─────────────────────────────────── */}
      <div className="section abt-section">
        <div className="section-header">
          <span className="section-num">§ 04 · Platforms</span>
          <span className="section-title">Where we can reach</span>
          <span className="section-meta">One league can mix sources</span>
        </div>
        <div className="abt-ledger">
          <div className="abt-ledger-row">
            <span className="abt-ledger-name">Sleeper</span>
            <span className="abt-ledger-status is-full"><span className="abt-ledger-dot" />Full history + live season</span>
            <span className="abt-ledger-note">The easy one. Paste the ID and go.</span>
          </div>
          <div className="abt-ledger-row">
            <span className="abt-ledger-name">ESPN</span>
            <span className="abt-ledger-status is-full"><span className="abt-ledger-dot" />Full history + live season</span>
            <span className="abt-ledger-note">Private leagues paste SWID + espn_s2 cookies.</span>
          </div>
          <div className="abt-ledger-row">
            <span className="abt-ledger-name">NFL.com</span>
            <span className="abt-ledger-status is-partial"><span className="abt-ledger-dot" />Historical seasons</span>
            <span className="abt-ledger-note">NFL.com hasn&apos;t reopened live leagues yet.</span>
          </div>
          <div className="abt-ledger-row">
            <span className="abt-ledger-name">Yahoo</span>
            <span className="abt-ledger-status is-soon"><span className="abt-ledger-dot" />In the works</span>
            <span className="abt-ledger-note">Waiting on Yahoo&apos;s developer portal.</span>
          </div>
        </div>
      </div>

      {/* ── § 05 · Rates card ───────────────────────────────────────── */}
      <div className="section abt-section">
        <div className="section-header">
          <span className="section-num">§ 05 · Rates</span>
          <span className="section-title">Three tiers</span>
          <span className="section-meta">7-day free trial on every plan</span>
        </div>
        <div className="abt-rates">
          <div className="abt-rate">
            <div className="abt-rate-tier">Rookie</div>
            <div className="abt-rate-price">$3<span>/mo</span></div>
            <div className="abt-rate-alt">or $15 a year</div>
            <div className="abt-rate-leagues">1 league</div>
          </div>
          <div className="abt-rate">
            <div className="abt-rate-tier">Veteran</div>
            <div className="abt-rate-price">$5<span>/mo</span></div>
            <div className="abt-rate-alt">or $25 a year</div>
            <div className="abt-rate-leagues">Up to 3 leagues</div>
          </div>
          <div className="abt-rate">
            <div className="abt-rate-tier">All-Pro</div>
            <div className="abt-rate-price">$15<span>/mo</span></div>
            <div className="abt-rate-alt">or $50 a year</div>
            <div className="abt-rate-leagues">Up to 10 leagues</div>
          </div>
        </div>
        <div className="abt-rates-foot">
          Every plan starts with a 7-day free trial; one trial per reader.{" "}
          <Link href="/pricing">Full pricing</Link> has the feature-by-feature breakdown.
        </div>
      </div>

      {/* ── § 06 · Letters: the remaining Q&A ───────────────────────── */}
      <div className="section abt-section">
        <div className="section-header">
          <span className="section-num">§ 06 · Letters</span>
          <span className="section-title">Fair questions</span>
          <span className="section-meta">Answered honestly</span>
        </div>
        <div className="abt-letters">
          <div className="abt-letter">
            <div className="abt-letter-q">Can I see one before signing up?</div>
            <p>
              Yes. <Link href="/demo/">The demo</Link> is a fully-populated
              almanac built from a real seven-year league&apos;s history. No
              signup required, wander as long as you like.
            </p>
          </div>
          <div className="abt-letter">
            <div className="abt-letter-q">What happens if I cancel?</div>
            <p>
              Your leagues stay in good standing for 6 months in case you come
              back. After that they&apos;re permanently deleted, and your
              dashboard shows the exact date well in advance.
            </p>
          </div>
          <div className="abt-letter">
            <div className="abt-letter-q">Who&apos;s behind it?</div>
            <p>
              JZFF, a long-time commissioner who got tired of league history
              living in screenshots. One person, so feedback lands directly:{" "}
              <a href="mailto:jzffgames@gmail.com">jzffgames@gmail.com</a>.
            </p>
          </div>
          <div className="abt-letter">
            <div className="abt-letter-q">Where do I start?</div>
            <p>
              Sign up, paste your league ID, and watch the chronicle fill
              itself in. The walk through your history usually takes under a
              minute.
            </p>
          </div>
        </div>
      </div>

      {/* ── § 07 · Colophon + CTA ───────────────────────────────────── */}
      <div className="section abt-section abt-colophon">
        <div className="abt-colophon-orn" aria-hidden>✦ ✦ ✦</div>
        <div className="abt-colophon-line">
          Written, edited &amp; printed by <strong>JZFF</strong>
        </div>
        <div className="abt-colophon-sub">
          Set in DM Serif Display &amp; JetBrains Mono · Published from the predawn route
        </div>
        <div className="abt-colophon-ctas">
          <Link href="/login?mode=signup" className="dc-btn">Start your archive</Link>
          <a href="/demo/" target="_blank" rel="noopener" className="dc-btn-ghost">Tour the demo</a>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
