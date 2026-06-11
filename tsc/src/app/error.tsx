"use client"

import Link from "next/link"
import { useEffect } from "react"
import { SiteFooter } from "@/components/SiteFooter"

// Site-wide error boundary, styled to match the Corrections Desk 404.
// Catches render/data errors in app-router pages so visitors never see the
// unstyled Next.js fallback. Must be a client component (Next requirement),
// hence no metadata export here.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface to the console (and Vercel's client log drain) — the visitor
    // only sees the styled notice.
    console.error(error)
  }, [error])

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
          <div className="nav-title">Press <em>stopped.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: "hidden" }} />
      </nav>

      <section className="hero" style={{ textAlign: "center", paddingTop: "5rem", paddingBottom: "4rem" }}>
        <div className="hero-sup">★ Stop the presses ★</div>
        <h1 className="hero-title" style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}>
          Something broke <em>mid-print.</em>
        </h1>
        <p className="hero-sub" style={{ maxWidth: "34rem", margin: "1.5rem auto 0" }}>
          An error stopped this page from rendering. It&apos;s been noted —
          try the press again, or head back to the front page.
        </p>
        <div style={{ display: "flex", gap: ".75rem", justifyContent: "center", flexWrap: "wrap", marginTop: "2.5rem" }}>
          <button type="button" onClick={reset} className="dc-btn">Try again</button>
          <Link href="/" className="dc-btn-ghost">Front page</Link>
        </div>
        {error.digest ? (
          <p style={{ marginTop: "2rem", fontFamily: "var(--font-jetbrains-mono)", fontSize: ".65rem", letterSpacing: ".2em", textTransform: "uppercase", color: "var(--cream-mute)" }}>
            Ref. {error.digest}
          </p>
        ) : null}
      </section>

      <SiteFooter />
    </main>
  )
}
