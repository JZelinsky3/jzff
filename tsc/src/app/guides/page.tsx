import type { Metadata } from "next"
import Link from "next/link"
import { BackButton } from "@/components/BackButton"
import { SiteFooter } from "@/components/SiteFooter"
import { createClient } from "@/lib/supabase/server"
import { GuideBrowser } from "./_GuideBrowser"

export const metadata: Metadata = {
  title: "Guides — Fantasy football league history, archives, and commissioner tools",
  description:
    "Practical guides for fantasy football commissioners — how to archive your league's history from Sleeper, ESPN, Yahoo, or NFL.com, plus buyer's guides comparing the active league-management, almanac, recap, and trade-analysis tools in 2026.",
  alternates: { canonical: "https://thesundaychronicle.app/guides/" },
}

// Server component: renders nav, masthead, and hands off to the client-side
// GuideBrowser which owns the search input + result list + grouped browse
// view. Splitting it this way keeps the SSR markup (good for crawlers) the
// same as the no-JS browse experience — search is purely additive.

export default async function GuidesIndex() {
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

      <GuideBrowser />

      <SiteFooter />
    </main>
  )
}
