import type { Metadata } from "next"
import Link from "next/link"
import { SiteFooter } from "@/components/SiteFooter"

export const metadata: Metadata = {
  title: "About — Fantasy football league archive built for commissioners",
  description:
    "The Sunday Chronicle turns any fantasy football league's full history into a polished, public-facing almanac. Works with Sleeper, ESPN, and NFL.com.",
  alternates: { canonical: "https://jzff.online/about/" },
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
        text: "Three tiers. Rookie at $3/month or $15/year for 1 league. Veteran at $5/month or $25/year for up to 3 leagues. All-Pro at $15/month or $50/year for up to 10 leagues. Every plan has a 10-day free trial; one trial per user lifetime.",
      },
    },
    {
      "@type": "Question",
      name: "Who is The Sunday Chronicle for?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Fantasy football commissioners running long-standing dynasty or redraft leagues who want a permanent shareable record of their league's history — especially leagues that have moved between platforms or have years of context scattered across screenshots and group chats.",
      },
    },
    {
      "@type": "Question",
      name: "Where can I see what the almanac looks like?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Visit jzff.online/demo/ for a fully-populated demo built from a real seven-year fantasy league's history — no signup required.",
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

export default function AboutPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <nav className="nav">
        <Link href="/" className="dc-nav-icon" aria-label="Back">
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <div className="nav-center">
          <div className="nav-kicker">About · The Sunday Chronicle</div>
          <div className="nav-title">What <em>this is.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: "hidden" }} />
      </nav>

      <section className="hero" style={{ paddingTop: "3rem", paddingBottom: "1.5rem" }}>
        <div className="hero-sup">★ For the commissioner who keeps the records ★</div>
        <h1 className="hero-title" style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}>
          A league's <em>history,</em> done right.
        </h1>
        <p className="hero-sub">
          The Sunday Chronicle turns your fantasy football league&apos;s full history into
          a polished public almanac. Paste a Sleeper, ESPN, or NFL.com league ID; we walk
          back through every season the league has existed and produce a single canonical
          archive: champions, drafts, head-to-head records, rivalries, weekly pick&apos;ems.
        </p>
      </section>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · What it is</span>
          <span className="section-title">Built for commissioners —</span>
          <span className="section-meta">one URL for your league&apos;s entire past</span>
        </div>
        <FaqItem q="What is The Sunday Chronicle?">
          A SaaS that takes any fantasy football league ID and turns the league&apos;s
          entire history into a public-facing almanac. Standings, champion rolls,
          season archives, the record book, draft history, manager dossiers, hand-curated
          rivalries, weekly pick&apos;ems, power rankings — all rendered into a
          single shareable URL like <code>jzff.online/leagues/your-league/</code>.
        </FaqItem>
        <FaqItem q="Who is it for?">
          Fantasy football commissioners running long-standing leagues. Especially
          useful for dynasty leagues, leagues that have moved between platforms
          (Yahoo → ESPN → Sleeper, etc), and leagues with years of stories scattered
          across screenshots, group chats, and platform UIs that change every year.
        </FaqItem>
        <FaqItem q="Which platforms does it support?">
          <strong>Sleeper</strong> (full historical + live season). <strong>ESPN</strong>{" "}
          (full historical + live season — private leagues need a SWID + espn_s2 cookie
          paste). <strong>NFL.com</strong> (historical seasons only; NFL.com hasn&apos;t
          reopened current-year leagues yet). <strong>Yahoo</strong> is coming soon,
          blocked on Yahoo&apos;s developer portal.
        </FaqItem>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 02 · Pricing</span>
          <span className="section-title">Three tiers —</span>
          <span className="section-meta">10-day free trial on every plan</span>
        </div>
        <FaqItem q="How much does it cost?">
          <strong>Rookie</strong> — $3/mo or $15/yr, archive 1 league.{" "}
          <strong>Veteran</strong> — $5/mo or $25/yr, archive up to 3 leagues.{" "}
          <strong>All-Pro</strong> — $15/mo or $50/yr, archive up to 10 leagues. Every
          plan includes a 10-day free trial; one trial per user lifetime. See{" "}
          <Link href="/pricing" style={{ color: "var(--gold)" }}>pricing</Link>.
        </FaqItem>
        <FaqItem q="Can I see what the public almanac looks like before signing up?">
          Yes — visit <Link href="/demo/" style={{ color: "var(--gold)" }}>jzff.online/demo/</Link>{" "}
          for a fully-populated demo built from a real seven-year league&apos;s history.
          No signup required.
        </FaqItem>
        <FaqItem q="What happens if I cancel my subscription?">
          Your leagues remain in good standing for 6 months after cancellation in case
          you resubscribe. After 6 months without a new subscription, the leagues are
          permanently deleted (we&apos;ll show you the exact date on your dashboard).
        </FaqItem>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 03 · The team</span>
          <span className="section-title">A one-person product —</span>
          <span className="section-meta">say hi</span>
        </div>
        <FaqItem q="Who built it?">
          Built and maintained by JZFF — a long-time fantasy commissioner who got tired
          of league history living scattered across screenshots and group chats. Reach
          out at{" "}
          <a href="mailto:jzffgames@gmail.com" style={{ color: "var(--gold)" }}>
            jzffgames@gmail.com
          </a>{" "}
          with feedback, feature requests, or bugs.
        </FaqItem>
        <FaqItem q="Where can I start?">
          Visit <Link href="/" style={{ color: "var(--gold)" }}>jzff.online</Link> →
          click Sign Up → paste your league ID. We do the rest.
        </FaqItem>
      </div>

      <SiteFooter />
    </main>
  )
}

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="dc-card-static" style={{ marginBottom: "1rem" }}>
      <h2 style={{
        fontFamily: "var(--serif)",
        fontSize: "1.35rem",
        color: "var(--cream)",
        marginBottom: ".6rem",
      }}>
        {q}
      </h2>
      <div style={{ color: "var(--cream-soft)", lineHeight: 1.6, fontSize: ".95rem" }}>
        {children}
      </div>
    </div>
  )
}
