import type { Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { ChroniclePages } from '@/components/landing/ChroniclePages'
import { DemoViewer } from '@/components/landing/DemoViewer'
import { HeroClipping } from '@/components/landing/HeroClipping'
import { LandingNav } from '@/components/landing/LandingNav'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'

// Render the landing at 0.85× initial zoom on phones. The site's mobile
// CSS was tuned at a moment when iOS Safari per-site zoom was nudged to
// 75–85% — most visitors will land at 100% and see a cramped layout
// without this. 0.85 is the compromise between the user's preferred 75%
// and the risk of typography that's too small to read. Users can still
// pinch to zoom in or out.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 0.85,
  maximumScale: 5,
}

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = !!user
  const admin = signedIn ? await isSiteAdmin(user?.id) : false

  const tickerItems = [
    'New · Live Season Hub · Matchup Preview · Best Coach Tracker',
    'New · Manager Hub — six-issue editorial chronicle',
    'New · Trade Grader · Milestone Tracker · Records Watch',
    'Soon · Weekly Recap · Manager DNA · Trade grades + revisits',
    'Sleeper · ESPN · Yahoo · NFL.com',
  ]

  // LandingNav owns its own trigger + mega-menu shape now (Nike-style
  // shared panel). We just pass auth flags and it composes the right
  // triggers and columns for signed-in vs signed-out visitors.

  return (
    <main className="lp-main">
      <div className="ticker">
        <div className="ticker-track">
          <div className="ticker-group">
            {tickerItems.map((t, i) => (
              <span key={`a-${i}`} className="ticker-item">
                <span className="ticker-star">★</span> {t}
              </span>
            ))}
          </div>
          <div className="ticker-group">
            {tickerItems.map((t, i) => (
              <span key={`b-${i}`} className="ticker-item">
                <span className="ticker-star">★</span> {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <nav className="nav">
        <span className="nav-back" style={{ visibility: 'hidden' }}>—</span>
        <div className="nav-center">
          <div className="nav-kicker">Vol. II · The League Almanac</div>
          <div className="nav-title lp-nav-title">The Sunday <em>Chronicle.</em></div>
        </div>
        <LandingNav signedIn={signedIn} admin={admin} />
      </nav>

      {/* ─── HERO ─────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-grid">
          <div className="lp-hero-left">
            <div className="lp-hero-sup">★ JZFF · The Sunday Chronicle · Est. 2026 ★</div>
            <h1 className="lp-hero-title">
              Your league.<br />
              <em>Bound forever.</em>
            </h1>
            <p className="lp-hero-sub">
              An almanac for the history of the league. Bring a league ID
              and we walk every season back to the beginning.
            </p>
            <div className="lp-hero-ctas">
              {signedIn ? (
                <>
                  <Link href="/dashboard" className="dc-btn">Open your library →</Link>
                  <Link href="/dashboard/new" className="dc-btn-ghost">Add a league</Link>
                </>
              ) : (
                <>
                  <Link href="/login?mode=signup" className="dc-btn">Start your archive →</Link>
                  <Link href="/login" className="dc-btn-ghost">Sign in</Link>
                </>
              )}
            </div>
            <div className="lp-hero-meta">
              <span>Free until the 2026 season</span>
              <span className="lp-hero-meta-sep">·</span>
              <span>No card to start</span>
              <span className="lp-hero-meta-sep">·</span>
              <span>Tour the demo below</span>
            </div>
          </div>
          <div className="lp-hero-right">
            <HeroClipping />
          </div>
        </div>
      </section>

      {/* ─── §02 · Horizontal-scroll Pages of the Chronicle ───── */}
      <ChroniclePages />

      {/* ─── §03 · See it live ────────────────────────────────── */}
      <div className="section lp-demo-section">
        <div className="section-header">
          <span className="section-num">§ 03 · See it live</span>
          <span className="section-title">Tour a finished almanac —</span>
          <span className="section-meta">no signup required</span>
        </div>
        <p className="lp-demo-lede">
          Pull the demo below to walk a real league&apos;s seven-year history — every page populated,
          every link working. It&apos;s the exact almanac you&apos;ll get for your league.
        </p>
        <DemoViewer />
      </div>

      {/* ─── §04 · Platforms ──────────────────────────────────── */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 04 · Platforms</span>
          <span className="section-title">Bring your league from —</span>
          <span className="section-meta">more on the way</span>
        </div>
        <div className="lp-platforms">
          <Platform name="Sleeper"  status="Available"   pill="Live" klass="" />
          <Platform name="ESPN"     status="Available"   pill="Live" klass="" />
          <Platform name="NFL.com"  status="Historical"  pill="Live" klass="" />
          <Platform name="Yahoo"    status="Coming soon" pill="Soon" klass="cream" />
        </div>
      </div>

      {/* ─── §05 · Final CTA ──────────────────────────────────── */}
      <div className="section lp-final">
        <div className="lp-final-card">
          <div className="lp-final-kicker">★ Last call · Free preview ★</div>
          <h2 className="lp-final-title">
            Bind <em>your</em> league.
          </h2>
          <p className="lp-final-sub">
            Pull your seasons in under five minutes. Publish a public almanac your league can read,
            argue with, and remember.
          </p>
          <div className="lp-final-ctas">
            {signedIn ? (
              <Link href="/dashboard/new" className="dc-btn">Add a league →</Link>
            ) : (
              <Link href="/login?mode=signup" className="dc-btn">Start your archive →</Link>
            )}
            <Link href="/demo/" target="_blank" rel="noopener" className="dc-btn-ghost">
              Walk the demo
            </Link>
          </div>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}

function Platform({ name, status, pill, klass }: { name: string; status: string; pill: string; klass: string }) {
  return (
    <div className="dc-chapter">
      <div className="dc-chapter-num">●</div>
      <div className="dc-chapter-body">
        <div className="dc-chapter-title">{name}</div>
        <div className="dc-chapter-desc">{status}</div>
      </div>
      <span className={`dc-pill ${klass}`}>{pill}</span>
      <div className="dc-chapter-arrow"></div>
    </div>
  )
}
