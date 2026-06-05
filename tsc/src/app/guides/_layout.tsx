// Shared chrome for /guides/* pages. Not a Next.js layout (those wrap routes
// implicitly) — just a reusable component that each guide page composes.

import Link from "next/link"
import { BackButton } from "@/components/BackButton"
import { SiteFooter } from "@/components/SiteFooter"
import { createClient } from "@/lib/supabase/server"

export async function GuideShell({
  kicker,
  title,
  titleEm,
  subtitle,
  faqJsonLd,
  children,
}: {
  kicker: string
  title: string
  titleEm: string
  subtitle: string
  faqJsonLd?: object
  children: React.ReactNode
}) {
  // Auth check is server-side so the right-side nav can show "Library"
  // for signed-in readers and "Login" for everyone else. Async server
  // component — callers can await this directly in their JSX.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return (
    <main>
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      <nav className="nav">
        <BackButton fallbackHref="/guides/" ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">Guides · The Sunday Chronicle</div>
          <div className="nav-title">TS<em>C.</em></div>
        </div>
        <div className="pricing-nav-right">
          <Link href="/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Home</span>
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

      <section className="hero" style={{ paddingTop: "3rem", paddingBottom: "1.5rem" }}>
        <div className="hero-sup">★ {kicker} ★</div>
        <h1 className="hero-title" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}>
          {title} <em>{titleEm}</em>
        </h1>
        <p className="hero-sub" style={{ maxWidth: "62ch", margin: "0 auto" }}>
          {subtitle}
        </p>
      </section>

      <div className="section" style={{ maxWidth: "780px", margin: "0 auto" }}>
        <article style={{ color: "var(--cream-soft)", lineHeight: 1.7, fontSize: "1.02rem" }}>
          {children}
        </article>
      </div>

      <div className="section" style={{ maxWidth: "780px", margin: "0 auto" }}>
        <div className="dc-card-static">
          <div style={{ fontFamily: "var(--mono)", fontSize: ".6rem", letterSpacing: ".22em", textTransform: "uppercase", color: "var(--gold)", marginBottom: ".5rem" }}>
            ★ Try it
          </div>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.5rem", color: "var(--cream)", marginBottom: ".4rem" }}>
            See your league&apos;s <em style={{ color: "var(--gold)" }}>full history</em> in 30 seconds.
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            Paste your Sleeper, ESPN, or NFL.com league ID. We walk back through every season the league has ever existed and produce a public almanac at <code style={{ background: "var(--ink-soft)", padding: ".1rem .35rem", borderRadius: "2px" }}>jzff.online/leagues/your-league/</code>. 7-day free trial, cancel anytime.
          </p>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
            <Link href="/login?mode=signup" className="dc-btn">Start your archive →</Link>
            <a href="/demo/" target="_blank" rel="noopener" className="dc-btn-ghost">Tour the demo</a>
          </div>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}

// Build a standard FAQPage JSON-LD object from a list of Q&A pairs. Sites
// that surface this schema get pulled into AI tool answers more often.
export function faqSchema(pairs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map((p) => ({
      "@type": "Question",
      name: p.q,
      acceptedAnswer: { "@type": "Answer", text: p.a },
    })),
  }
}

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontFamily: "var(--serif)",
      fontSize: "1.55rem",
      color: "var(--cream)",
      marginTop: "2.25rem",
      marginBottom: ".75rem",
    }}>
      {children}
    </h2>
  )
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ marginBottom: "1rem" }}>{children}</p>
}
