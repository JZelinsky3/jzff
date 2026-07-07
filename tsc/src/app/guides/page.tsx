import type { Metadata } from "next"
import Link from "next/link"
import { BackButton } from "@/components/BackButton"
import { SiteFooter } from "@/components/SiteFooter"
import { MobileGuides } from "@/components/guides/MobileGuides"
import { createClient } from "@/lib/supabase/server"
import { getViewMode } from "@/lib/viewMode"
import { GuideBrowser } from "./_GuideBrowser"
import { SECTIONS } from "./_data"

export const metadata: Metadata = {
  title: "Guides · Fantasy football league history, archives, and commissioner tools",
  description:
    "Practical guides for fantasy football commissioners: how to archive your league's history from Sleeper, ESPN, Yahoo, or NFL.com, plus buyer's guides comparing the active league-management, almanac, recap, and trade-analysis tools in 2026.",
  alternates: { canonical: "https://thesundaychronicle.app/guides/" },
}

// Server component: renders nav, masthead, and hands off to the client-side
// GuideBrowser which owns the search input + result list + grouped browse
// view. Splitting it this way keeps the SSR markup (good for crawlers) the
// same as the no-JS browse experience — search is purely additive.

export default async function GuidesIndex() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if ((await getViewMode()) === 'mobile') {
    return <MobileGuides signedIn={!!user} />
  }

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
          <Link href="/about/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">About</span>
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
          Practical how-tos, buyer&apos;s comparisons, and the editorial case for keeping your league&apos;s story alive. Written for fantasy commissioners and the people who read what they publish.
        </p>
        <div className="hero-dateline">
          <span><strong>{SECTIONS.reduce((n, s) => n + s.guides.length, 0)}</strong> Guides</span>
          <span className="hero-dateline-sep" aria-hidden>·</span>
          <span><strong>{SECTIONS.length}</strong> Shelves</span>
          <span className="hero-dateline-sep" aria-hidden>·</span>
          <span>Free to read</span>
        </div>
      </section>

      <GuideBrowser />

      <SiteFooter />
    </main>
  )
}
