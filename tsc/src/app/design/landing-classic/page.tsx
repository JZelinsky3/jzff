import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { ChroniclePages } from '@/components/landing/ChroniclePages'
import { DemoViewer } from '@/components/landing/DemoViewer'
import { HeroClipping } from '@/components/landing/HeroClipping'
import { LandingNav } from '@/components/landing/LandingNav'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'

// Vaulted 2026-07-19: the original desktop landing, preserved intact when
// the broadsheet redesign (formerly /new) took over the homepage. Kept as
// a browsable internal page rather than deleted, in case any part of it
// is wanted back. The mobile fork, FAQ JSON-LD, and mobile-switch pill
// stayed with the live homepage in src/app/page.tsx.
export const metadata: Metadata = {
  title: 'Landing classic · vaulted',
  robots: { index: false, follow: false },
}

export default async function LandingClassicPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = !!user
  const admin = signedIn ? await isSiteAdmin(user?.id) : false

  const tickerItems = [
    'New · Live Season Hub · Matchup Preview · Best Coach Tracker',
    'New · Trade Grader · Milestone Tracker · Records Watch',
    'New · Manager DNA · Live-season tendencies + tells',
    'New · Free tier — one league, forever',
    'Soon · Weekly Recap · Underdog Fantasy',
    'Sleeper · ESPN · Yahoo · NFL.com',
  ]

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
          <Platform name="NFL.com"  status="Testing"  pill="Beta" klass="cream" />
          <Platform name="Yahoo"    status="Testing"  pill="Beta" klass="cream" />
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

      {/* ─── Footer prose — what The Sunday Chronicle is ──────── */}
      <aside className="lp-colophon" aria-labelledby="what-it-is">
        <div className="lp-colophon-inner">
          <div className="lp-colophon-kicker">★ Colophon ★</div>
          <h2 className="lp-colophon-title" id="what-it-is">
            What <em>The Sunday Chronicle</em> is.
          </h2>
          <div className="lp-colophon-prose">
            <p>
              <strong>The Sunday Chronicle is a fantasy football league history almanac.</strong>{' '}
              Paste a Sleeper, ESPN, NFL.com, or Yahoo league ID and it imports every season the
              league has ever existed — drafts, weekly matchups, standings, transactions, playoff
              brackets — then publishes a polished public site your whole league can read at one
              permanent URL.
            </p>
            <p>
              Most league platforms hide or delete old seasons. Group chats lose the context.
              Screenshots scatter. The Sunday Chronicle is the record book for a league&apos;s
              entire history: champions and runners-up, rivalry head-to-heads, draft-by-draft
              boards, manager career dossiers, all-time records, and a season archive that walks
              every year back to year one. Designed like a publication, not a data dump.
            </p>
            <p>
              During the live NFL season, the same almanac stays in sync — Sunday command
              center, matchup previews, best-coach tracking, manager DNA, milestone watches,
              weekly recaps — all updated automatically. Free tier covers one league forever.
              Paid plans from $3/month with a 7-day trial. <Link href="/about/" className="lp-colophon-link">Read more →</Link>
            </p>
          </div>
        </div>
      </aside>

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
