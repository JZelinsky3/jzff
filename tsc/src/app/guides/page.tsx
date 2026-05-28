import type { Metadata } from "next"
import Link from "next/link"
import { BackButton } from "@/components/BackButton"
import { SiteFooter } from "@/components/SiteFooter"

export const metadata: Metadata = {
  title: "Guides — Fantasy football league history, archives, and commissioner tools",
  description:
    "Practical guides for fantasy football commissioners — how to archive your league's history from Sleeper, ESPN, or NFL.com, what each platform actually saves, and how to keep your league's story alive after platforms change or commissioners move on.",
  alternates: { canonical: "https://jzff.online/guides/" },
}

const GUIDES = [
  {
    slug: "sleeper-league-history",
    title: "How to archive your Sleeper league history",
    tagline: "Every season, every draft, every champion — pulled from any Sleeper league ID in 30 seconds.",
  },
  {
    slug: "espn-league-history",
    title: "How to see your ESPN league's full history (even private leagues)",
    tagline: "ESPN hides old seasons behind a clunky interface. Here's how to pull every year — including private leagues — into one public almanac.",
  },
  {
    slug: "yahoo-league-history",
    title: "How to archive your Yahoo fantasy league history",
    tagline: "Yahoo needs a one-time OAuth sign-in. After that, every season your league has played comes back as a clean public almanac.",
  },
  {
    slug: "nfl-com-league-history",
    title: "How to archive your NFL.com fantasy league history",
    tagline: "NFL.com exposes league data publicly behind the league ID. Paste it, no sign-in needed, every season back to the league's founding.",
  },
  {
    slug: "migrate-fantasy-league",
    title: "Moving your league between platforms — keeping the history",
    tagline: "Yahoo → ESPN → Sleeper. When commissioners migrate, league history dies. Here's how to preserve it.",
  },
  {
    slug: "why-league-history-dies",
    title: "Why fantasy league history dies (and how to save it)",
    tagline: "Screenshots get lost. Group chats archive. Platforms change. A long-running league's story deserves better.",
  },
  {
    slug: "sleeper-vs-espn-history",
    title: "Sleeper vs ESPN — what each platform actually saves",
    tagline: "Side-by-side: how far back you can see, what data you can export, and where each falls short.",
  },
  {
    slug: "commissioner-mistakes",
    title: "The 5 biggest mistakes commissioners make with league history",
    tagline: "Practical lessons from running and archiving long-standing fantasy leagues.",
  },
]

export default function GuidesIndex() {
  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref="/" ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">Guides · The Sunday Chronicle</div>
          <div className="nav-title">TS<em>C.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: "hidden" }} />
      </nav>

      <section className="hero" style={{ paddingTop: "3rem", paddingBottom: "1.5rem" }}>
        <div className="hero-sup">★ Fantasy football archive guides ★</div>
        <h1 className="hero-title" style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}>
          League history, <em>done right.</em>
        </h1>
        <p className="hero-sub" style={{ maxWidth: "62ch", margin: "0 auto" }}>
          Practical how-tos for fantasy commissioners. Archiving your league&apos;s past, navigating platform differences, and keeping the story alive when seasons end.
        </p>
      </section>

      <div className="section" style={{ maxWidth: "920px", margin: "0 auto" }}>
        <div className="toc guides-list">
          <div className="toc-body">
            {GUIDES.map((g, i) => (
              <Link key={g.slug} href={`/guides/${g.slug}/`} className="toc-row">
                <div className="toc-chapter">Ch. {i + 1}</div>
                <div className="toc-title-wrap">
                  <div className="toc-title">{g.title}</div>
                  <div className="toc-desc">{g.tagline}</div>
                </div>
                <div className="toc-arrow">→</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
