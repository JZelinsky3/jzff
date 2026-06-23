import type { Metadata } from "next"
import Link from "next/link"
import { BackButton } from "@/components/BackButton"
import { SiteFooter } from "@/components/SiteFooter"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Guides — Fantasy football league history, archives, and commissioner tools",
  description:
    "Practical guides for fantasy football commissioners — how to archive your league's history from Sleeper, ESPN, Yahoo, or NFL.com, plus buyer's guides comparing the active league-management, almanac, recap, and trade-analysis tools in 2026.",
  alternates: { canonical: "https://thesundaychronicle.app/guides/" },
}

// Guides are grouped by intent. The index splits them into sections so a
// reader landing here can navigate to the right category instead of scrolling
// a long flat list — comparisons go to buyers, deep-dives go to users
// evaluating features, how-tos go to commissioners setting up, and editorial
// goes to readers in offseason mood.
type Guide = {
  slug: string
  title: string
  tagline: string
  // Optional accent so each section can show a short noun (the "what this
  // guide gives you" label) on the card. Kept short — it's a chip, not prose.
  chip?: string
}

type Section = {
  kicker: string
  title: string
  titleEm: string
  blurb: string
  guides: Guide[]
}

const SECTIONS: Section[] = [
  {
    kicker: "Buyer's guides",
    title: "Compare the active services —",
    titleEm: "by category.",
    blurb:
      "Side-by-side reviews of the tools in each fantasy-football software category. Start here if you're picking what to use.",
    guides: [
      {
        slug: "best-fantasy-football-almanac",
        title: "Best fantasy football almanac services",
        tagline: "What an almanac is, what to look for, and how the active services stack up — from full archives to recap-only tools.",
        chip: "Comparison",
      },
      {
        slug: "fantasy-football-league-history-software",
        title: "League history software — what actually preserves a league",
        tagline: "The category beyond your host platform's basic history tab — what these tools do, which work cross-platform, and how to pick one.",
        chip: "Comparison",
      },
      {
        slug: "fantasy-football-league-management-software",
        title: "League management software — reviews & comparison",
        tagline: "The host platform plus the third-party tools commissioners actually use. Where each fits in a 2026 league stack.",
        chip: "Comparison",
      },
      {
        slug: "best-fantasy-football-recap",
        title: "Best fantasy football recap services",
        tagline: "Weekly recaps compared — designed for league-specific voice vs generic AI prose, archived vs standalone.",
        chip: "Comparison",
      },
    ],
  },
  {
    kicker: "Tool deep-dives",
    title: "Inside the individual tools —",
    titleEm: "what they do, how to use them.",
    blurb:
      "Feature-by-feature looks at the categories TSC already covers — trade grading, milestone tracking, manager profiling.",
    guides: [
      {
        slug: "fantasy-football-trade-analyzer",
        title: "Trade analysis tools — how to pick one",
        tagline: "Live redraft graders vs dynasty value calculators vs post-trade graders — which to use when, and where each fits in a league stack.",
        chip: "Feature",
      },
      {
        slug: "fantasy-football-milestone-tracker",
        title: "Milestone tracking — what to track and how",
        tagline: "Career wins, championship counts, point thresholds, streaks, rivalry chapters. The markers that turn a multi-year league into a story.",
        chip: "Feature",
      },
      {
        slug: "fantasy-football-manager-analysis",
        title: "Manager analysis — DNA, tendencies, and style",
        tagline: "Drafting style, lineup habits, trade behavior, response to adversity — profiling managers as a personality, not a record.",
        chip: "Feature",
      },
    ],
  },
  {
    kicker: "Platform how-tos",
    title: "Set up your league —",
    titleEm: "step by step.",
    blurb:
      "Practical walkthroughs for each fantasy host. Find your league ID, paste it, publish.",
    guides: [
      {
        slug: "sleeper-league-history",
        title: "Sleeper — archive your league history",
        tagline: "Every season, every draft, every champion — pulled from any Sleeper league ID in 30 seconds.",
        chip: "How-to",
      },
      {
        slug: "espn-league-history",
        title: "ESPN — full history (public + private leagues)",
        tagline: "ESPN hides old seasons behind a clunky interface. Here's how to pull every year — including private leagues — into one public almanac.",
        chip: "How-to",
      },
      {
        slug: "yahoo-league-history",
        title: "Yahoo — archive your fantasy league history",
        tagline: "Yahoo needs a one-time OAuth sign-in. After that, every season your league has played comes back as a clean public almanac.",
        chip: "How-to",
      },
      {
        slug: "nfl-com-league-history",
        title: "NFL.com — archive your league history",
        tagline: "NFL.com exposes league data publicly behind the league ID. Paste it, no sign-in needed, every season back to the league's founding.",
        chip: "How-to",
      },
    ],
  },
  {
    kicker: "Editorial",
    title: "The case for keeping the league's story —",
    titleEm: "and what gets it wrong.",
    blurb:
      "Long-form reads on why league history dies, how to move between platforms without losing it, and the recurring mistakes commissioners make.",
    guides: [
      {
        slug: "sleeper-vs-espn-history",
        title: "Sleeper vs ESPN — what each platform actually saves",
        tagline: "Side-by-side: how far back you can see, what data you can export, and where each falls short.",
        chip: "Comparison",
      },
      {
        slug: "migrate-fantasy-league",
        title: "Moving your league between platforms — keeping the history",
        tagline: "Yahoo → ESPN → Sleeper. When commissioners migrate, league history dies. Here's how to preserve it.",
        chip: "How-to",
      },
      {
        slug: "why-league-history-dies",
        title: "Why fantasy league history dies (and how to save it)",
        tagline: "Screenshots get lost. Group chats archive. Platforms change. A long-running league's story deserves better.",
        chip: "Essay",
      },
      {
        slug: "commissioner-mistakes",
        title: "The 5 biggest mistakes commissioners make",
        tagline: "Practical lessons from running and archiving long-standing fantasy leagues.",
        chip: "Essay",
      },
    ],
  },
]

export default async function GuidesIndex() {
  // Server-side auth check so the right-side nav can show "Library"
  // for signed-in readers and "Login" for everyone else.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref="/" ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">Guides · The Sunday Chronicle</div>
          <div className="nav-title">TS<em>C.</em></div>
        </div>
        <div className="pricing-nav-right">
          <Link href="/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Home</span>
          </Link>
          <Link href="/pricing/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Pricing</span>
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

      <section className="hero" style={{ paddingTop: "3rem", paddingBottom: "1.5rem" }}>
        <div className="hero-sup">★ Fantasy football archive guides ★</div>
        <h1 className="hero-title" style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}>
          League history, <em>done right.</em>
        </h1>
        <p className="hero-sub" style={{ maxWidth: "62ch", margin: "0 auto" }}>
          Practical how-tos, buyer&apos;s comparisons, and the editorial case for keeping your league&apos;s story alive — for fantasy commissioners and the people who read what they publish.
        </p>
      </section>

      {/* In-page table of contents — jumps to each category. Renders as a
          horizontal rail; the cards below carry the visual weight. */}
      <div className="section" style={{ maxWidth: "1080px", margin: "0 auto", paddingTop: 0 }}>
        <nav aria-label="Guide categories" className="guides-toc">
          {SECTIONS.map((s) => (
            <a key={s.kicker} href={`#${slugify(s.kicker)}`} className="guides-toc-link">
              <span className="guides-toc-num">·</span>
              <span className="guides-toc-label">{s.kicker}</span>
              <span className="guides-toc-count">{s.guides.length}</span>
            </a>
          ))}
        </nav>
      </div>

      {SECTIONS.map((s) => (
        <div
          key={s.kicker}
          className="section guides-section"
          id={slugify(s.kicker)}
          style={{ maxWidth: "1080px", margin: "0 auto" }}
        >
          <div className="section-header">
            <span className="section-num">§ {s.kicker}</span>
            <span className="section-title">{s.title}</span>
            <span className="section-meta">{s.titleEm}</span>
          </div>
          <p className="guides-section-blurb">{s.blurb}</p>
          <div className="guides-card-grid">
            {s.guides.map((g) => (
              <Link key={g.slug} href={`/guides/${g.slug}/`} className="guide-card">
                {g.chip && <span className="guide-card-chip">{g.chip}</span>}
                <div className="guide-card-title">{g.title}</div>
                <div className="guide-card-desc">{g.tagline}</div>
                <span className="guide-card-cta">
                  Read <span className="guide-card-arrow" aria-hidden>→</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}

      <SiteFooter />
    </main>
  )
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
