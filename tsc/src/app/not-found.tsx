import type { Metadata } from "next"
import Link from "next/link"
import { SiteFooter } from "@/components/SiteFooter"

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
}

// Site-wide 404, styled as a newspaper correction notice. Catches typo'd
// URLs and notFound() calls in app-router pages. (The public almanac at
// /leagues/<slug>/ is a route handler, so it serves its own matching HTML
// 404 — see src/app/leagues/[slug]/[[...path]]/route.ts.)
export default function NotFound() {
  return (
    <main>
      <nav className="nav">
        <Link href="/" className="dc-nav-icon" aria-label="Back">
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <div className="nav-center">
          <div className="nav-kicker">Corrections Desk · The Sunday Chronicle</div>
          <div className="nav-title">Edition <em>not found.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: "hidden" }} />
      </nav>

      <section className="hero" style={{ textAlign: "center", paddingTop: "5rem", paddingBottom: "4rem" }}>
        <div className="hero-sup">★ Correction · No. 404 ★</div>
        <h1 className="hero-title" style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}>
          This edition <em>doesn&apos;t exist.</em>
        </h1>
        <p className="hero-sub" style={{ maxWidth: "34rem", margin: "1.5rem auto 0" }}>
          The page you&apos;re after was never printed, has moved, or its league
          hasn&apos;t published yet. The Corrections Desk regrets the inconvenience.
        </p>
        <div style={{ display: "flex", gap: ".75rem", justifyContent: "center", flexWrap: "wrap", marginTop: "2.5rem" }}>
          <Link href="/" className="dc-btn">Front page</Link>
          <Link href="/hub/explore/" className="dc-btn-ghost">Browse published almanacs</Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
