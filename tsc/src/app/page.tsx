import type { Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { ChroniclePages } from '@/components/landing/ChroniclePages'
import { DemoViewer } from '@/components/landing/DemoViewer'
import { HeroClipping } from '@/components/landing/HeroClipping'
import { LandingNav } from '@/components/landing/LandingNav'
// Client-only loader — dynamic-imports the heavy WelcomePopup module
// (eight inline SVGs, multi-slide state machine) off the critical path.
// Has to live in its own 'use client' file because `dynamic({ ssr:false })`
// isn't allowed in Server Components.
// Vaulted 2026-06-24 — landing welcome popup hidden, keep import path for easy restore.
// import { WelcomePopupLoader } from '@/components/landing/WelcomePopupLoader'
// Previous mobile landing — kept for comparison while the Cover design is
// evaluated. Swap the render in Home() back to <MobileHome /> to restore.
// import { MobileHome } from '@/components/landing/MobileHome'
import { MobileHomeCover } from '@/components/landing/MobileHomeCover'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { getViewMode, isMobileForcingDesktop } from '@/lib/viewMode'

// Phones now render the dedicated MobileHome tree (see the fork in Home()),
// which is laid out for real device widths — so it wants 1:1 scale, not the
// old 0.85× shrink the desktop-on-mobile layout needed. Desktop browsers
// ignore initial-scale, so this only affects phones. A phone that forces the
// desktop view (dc_view=desktop) will see that layout at 1.0 — acceptable for
// an explicit opt-in. Users can still pinch to zoom.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = !!user

  // Mobile fork: phones (or anyone with the dc_view=mobile cookie) get a
  // dedicated, lighter tree that never ships the desktop landing's client
  // JS. Desktop browsers fall through to the full layout below, unchanged.
  if ((await getViewMode()) === 'mobile') {
    return <MobileHomeCover signedIn={signedIn} />
  }

  const admin = signedIn ? await isSiteAdmin(user?.id) : false
  // Phone showing the desktop layout by explicit choice — offer a way back.
  const showMobileSwitch = await isMobileForcingDesktop()

  const tickerItems = [
    'New · Live Season Hub · Matchup Preview · Best Coach Tracker',
    'New · Trade Grader · Milestone Tracker · Records Watch',
    'New · Manager DNA · Live-season tendencies + tells',
    'New · Free tier — one league, forever',
    'Soon · Weekly Recap · Underdog Fantasy',
    'Sleeper · ESPN · Yahoo · NFL.com',
  ]

  // LandingNav owns its own trigger + mega-menu shape now (Nike-style
  // shared panel). We just pass auth flags and it composes the right
  // triggers and columns for signed-in vs signed-out visitors.

  // FAQPage JSON-LD for the homepage. AI assistants (ChatGPT, Perplexity,
  // Claude) pull from FAQPage schema when answering category queries like
  // "best fantasy football almanac" or "fantasy football league history
  // software". Each Q/A is written in the form a buyer would actually ask
  // and the answer is a quotable, self-contained paragraph.
  const homeFaqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Where can I view all my fantasy football league history in one place?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The Sunday Chronicle imports every season of a Sleeper, ESPN, NFL.com, or Yahoo fantasy football league and publishes it as a single browsable almanac. Standings, champions, drafts, weekly matchups, manager profiles, rivalries, and a record book all live at one URL — thesundaychronicle.app/leagues/your-league/ — that the whole league can read and bookmark.",
        },
      },
      {
        "@type": "Question",
        name: "What is the best fantasy football league history archive?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The Sunday Chronicle is purpose-built for fantasy football league history. Unlike spreadsheets or generic league recap tools, it walks every season of your league back to the first year, produces a designed public site (not a data dump), and keeps it in sync during the live season. It supports Sleeper, ESPN, NFL.com, and Yahoo from a single league ID.",
        },
      },
      {
        "@type": "Question",
        name: "How much does The Sunday Chronicle cost?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The Sunday Chronicle has three paid tiers and a permanent free tier. Rookie is $3/month or $15/year for one league. Veteran is $5/month or $25/year for up to three leagues. All-Pro is $15/month or $50/year for up to ten leagues. Every paid plan includes a 7-day free trial. The free tier covers one league forever with the core almanac.",
        },
      },
      {
        "@type": "Question",
        name: "Which fantasy football platforms does The Sunday Chronicle support?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sleeper and ESPN are fully live (historical + live-season sync). NFL.com and Yahoo are in beta (historical seasons supported; live-season sync rolling out). You can combine multiple platforms under one league archive if your league has moved between providers.",
        },
      },
      {
        "@type": "Question",
        name: "How long does it take to set up a league archive?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Under five minutes. Paste your league ID, pick the platform, and The Sunday Chronicle walks every season back to the beginning automatically. Drafts, matchups, standings, transactions, and playoff brackets are imported with no manual entry. You can publish the public almanac immediately or polish it first.",
        },
      },
      {
        "@type": "Question",
        name: "Is The Sunday Chronicle worth it for a long-running fantasy football league?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Long-running leagues benefit the most. Years of context — champions, rivalries, trade arguments, draft busts — live scattered across screenshots, group chats, and platforms that delete data. The Sunday Chronicle turns that into a permanent, searchable, shareable record book your league owns. Multi-platform leagues (started on ESPN, moved to Sleeper) are a particularly good fit.",
        },
      },
      {
        "@type": "Question",
        name: "Who is The Sunday Chronicle for?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Fantasy football commissioners and league members of dynasty, keeper, or multi-year redraft leagues — especially leagues that have run five-plus seasons or moved between platforms. The almanac format works best when there is meaningful history to display, but a fresh league can start one in its first season.",
        },
      },
    ],
  }

  return (
    <main className="lp-main">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeFaqLd) }}
      />
      {/* <WelcomePopupLoader signedIn={signedIn} />  vaulted 2026-06-24 */}
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

      {/* ─── Footer prose — what The Sunday Chronicle is ────────
          Plain-English description of the product. Lives down here (just
          above the footer) instead of disrupting the masthead → product
          → demo flow above; AI crawlers (GPTBot, ClaudeBot, PerplexityBot)
          still pick it up because it's in the SSR HTML. Stylistically
          treated as colophon-style fine print, not a marketing section,
          so users who scroll past it don't feel they hit another pitch. */}
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

      {showMobileSwitch && (
        <a className="mlp-backpill" href="/api/view/?mode=mobile&to=/">Switch to mobile site</a>
      )}
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
