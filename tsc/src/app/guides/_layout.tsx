// Shared chrome for /guides/* pages. Not a Next.js layout (those wrap routes
// implicitly) — just a reusable component that each guide page composes.

import Link from "next/link"
import { BackButton } from "@/components/BackButton"
import { SiteFooter } from "@/components/SiteFooter"
import { MobileGuideShell } from "@/components/guides/MobileGuideShell"
import { createClient } from "@/lib/supabase/server"
import { getViewMode } from "@/lib/viewMode"
import { GuideToc } from "./_toc"

// Author entity referenced from Article + Organization schema. Lifting the
// byline out of the JSX so the structured-data block and the visible byline
// stay in sync if the author bio ever changes. Identity is the project
// label (JZFF), not a personal name — personal name is intentionally
// excluded from the public site.
const AUTHOR = {
  name: "JZFF",
  role: "Independent fantasy football software · The Sunday Chronicle",
  url: "https://thesundaychronicle.app/about/",
}

export async function GuideShell({
  kicker,
  title,
  titleEm,
  subtitle,
  faqJsonLd,
  howToJsonLd,
  // Slug + title for the BreadcrumbList. Defaults derived from the page's
  // own metadata when not supplied. Passing them explicitly lets callers
  // override the visible breadcrumb title (e.g. shorter than the <h1>).
  breadcrumbSlug,
  breadcrumbTitle,
  // Article schema timestamps. Caller passes ISO strings so each guide
  // claims its own publish/update date — important for AI freshness
  // signals and Google's article-recency weighting.
  datePublished,
  dateModified,
  children,
}: {
  kicker: string
  title: string
  titleEm: string
  subtitle: string
  faqJsonLd?: object
  howToJsonLd?: object
  breadcrumbSlug?: string
  breadcrumbTitle?: string
  datePublished?: string
  dateModified?: string
  children: React.ReactNode
}) {
  // Auth check is server-side so the right-side nav can show "Library"
  // for signed-in readers and "Login" for everyone else. Async server
  // component — callers can await this directly in their JSX.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Default the breadcrumb title to the visible <h1> text so callers
  // don't have to repeat themselves. Strip trailing punctuation /
  // em-dash that reads naturally inline but looks odd in a breadcrumb.
  const crumbTitle = (breadcrumbTitle ?? `${title} ${titleEm}`)
    .replace(/[—\-—.\s]+$/, "")
    .trim()

  // Composite Article + BreadcrumbList graph. Article schema feeds AI
  // assistants (Perplexity especially) the author/timestamp/headline they
  // quote alongside an answer; BreadcrumbList helps Google build sitelinks
  // and lets AI tools cite the section context. Skip both if the caller
  // didn't supply a slug — defensive against routes that wrap GuideShell
  // for non-canonical previews.
  const articleAndCrumbsLd = breadcrumbSlug
    ? {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Article",
            "@id": `https://thesundaychronicle.app/guides/${breadcrumbSlug}/#article`,
            mainEntityOfPage: `https://thesundaychronicle.app/guides/${breadcrumbSlug}/`,
            headline: crumbTitle,
            description: subtitle,
            author: {
              "@type": "Person",
              name: AUTHOR.name,
              url: AUTHOR.url,
              jobTitle: AUTHOR.role,
            },
            publisher: { "@id": "https://thesundaychronicle.app/#org" },
            inLanguage: "en-US",
            isPartOf: { "@id": "https://thesundaychronicle.app/#website" },
            ...(datePublished ? { datePublished } : {}),
            ...(dateModified ? { dateModified } : {}),
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://thesundaychronicle.app/" },
              { "@type": "ListItem", position: 2, name: "Guides", item: "https://thesundaychronicle.app/guides/" },
              { "@type": "ListItem", position: 3, name: crumbTitle, item: `https://thesundaychronicle.app/guides/${breadcrumbSlug}/` },
            ],
          },
        ],
      }
    : null

  // Phone fork: the desktop chrome (nav grid, wide hero, 1100px article
  // container) collapses badly on small widths; route through the slim
  // mobile shell instead. JSON-LD scripts are re-emitted there so SEO
  // doesn't regress.
  if ((await getViewMode()) === 'mobile') {
    const byline = (
      <>
        <span>By <Link href={AUTHOR.url}>{AUTHOR.name}</Link></span>
        {datePublished && (
          <>
            {' · '}
            <span>Published <time dateTime={datePublished}>{formatDate(datePublished)}</time></span>
          </>
        )}
        {dateModified && dateModified !== datePublished && (
          <>
            {' · '}
            <span>Updated <time dateTime={dateModified}>{formatDate(dateModified)}</time></span>
          </>
        )}
      </>
    )
    return (
      <MobileGuideShell
        kicker={kicker}
        title={title}
        titleEm={titleEm}
        subtitle={subtitle}
        faqJsonLd={faqJsonLd}
        howToJsonLd={howToJsonLd}
        articleAndCrumbsLd={articleAndCrumbsLd}
        byline={byline}
        signedIn={!!user}
      >
        {children}
      </MobileGuideShell>
    )
  }

  return (
    <main>
      {articleAndCrumbsLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleAndCrumbsLd) }}
        />
      )}
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      {howToJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
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

      {/* Visible breadcrumb. Mirrors the BreadcrumbList JSON-LD so the
          structured-data assertion is verifiable from the page itself —
          Google penalizes schema that doesn't match visible content. */}
      {breadcrumbSlug && (
        <nav aria-label="Breadcrumb" className="guide-crumbs">
          <ol>
            <li><Link href="/">Home</Link></li>
            <li aria-hidden="true">›</li>
            <li><Link href="/guides/">Guides</Link></li>
            <li aria-hidden="true">›</li>
            <li aria-current="page">{crumbTitle}</li>
          </ol>
        </nav>
      )}

      <section className="hero" style={{ paddingTop: "3rem", paddingBottom: "1.5rem" }}>
        <div className="hero-sup">★ {kicker} ★</div>
        <h1 className="hero-title" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}>
          {title} <em>{titleEm}</em>
        </h1>
        <p className="hero-sub" style={{ maxWidth: "62ch", margin: "0 auto" }}>
          {subtitle}
        </p>
        {/* Author byline + dates. Visible to readers + mirrors the Article
            schema so the E-E-A-T claim is verifiable on-page, not just in
            JSON-LD. AI assistants weight bylines + recency. */}
        <div className="guide-byline">
          <span>
            By <Link href={AUTHOR.url}>{AUTHOR.name}</Link>
          </span>
          {datePublished && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Published <time dateTime={datePublished}>{formatDate(datePublished)}</time>
              </span>
            </>
          )}
          {dateModified && dateModified !== datePublished && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Updated <time dateTime={dateModified}>{formatDate(dateModified)}</time>
              </span>
            </>
          )}
        </div>
      </section>

      {/* Two-column spread: prose left, sticky rail right. The rail carries
          an auto-built table of contents (from the h2s), a small drawn
          "figure" plate that doubles as the demo link, and the byline
          repeated where a magazine would put the contributor note. */}
      <div className="section guide-body">
        <article className="guide-article">
          {children}
        </article>
        <aside className="guide-rail">
          <GuideToc />
          <a href="/demo/" target="_blank" rel="noopener" className="guide-fig">
            <span className="guide-fig-page" aria-hidden>
              <span className="guide-fig-mast">The Sunday <em>Chronicle.</em></span>
              {/* The mini page's "headline" is this guide's subject (the
                  kicker up to the first ·), so each guide's figure reads
                  as its own front page: "Sleeper.", "Editorial.", etc. */}
              <span className="guide-fig-head">{kicker.split('·')[0].trim()}.</span>
              <span className="guide-fig-cols">
                <span /><span /><span />
              </span>
              <span className="guide-fig-strip">
                <span>§ Standings</span>
                <span>§ Rivalries</span>
              </span>
              <span className="guide-fig-seal">★</span>
            </span>
            <span className="guide-fig-caption">Fig. A · Tour a live almanac</span>
          </a>
        </aside>
      </div>

      {/* Closing plate: ornament + pitch, colophon-style rather than a
          boxed card, so the article ends like a printed piece. */}
      <div className="section guide-cta">
        <div className="guide-cta-orn" aria-hidden>✦ ✦ ✦</div>
        <h2 className="guide-cta-title">
          See your league&apos;s <em>full history</em> in 30 seconds.
        </h2>
        <p className="guide-cta-sub">
          Paste your Sleeper, ESPN, or NFL.com league ID. We walk back through
          every season the league has ever existed and print a public almanac
          at <code>thesundaychronicle.app/leagues/your-league/</code>.
          7-day free trial, cancel anytime.
        </p>
        <div className="guide-cta-btns">
          <Link href="/login?mode=signup" className="dc-btn">Start your archive</Link>
          <a href="/demo/" target="_blank" rel="noopener" className="dc-btn-ghost">Tour the demo</a>
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

// Build a HowTo JSON-LD object. Eligible for Google's step-by-step rich
// results and frequently quoted verbatim by AI assistants when answering
// "how do I…" queries. Each step needs a name + plain-text description;
// the optional URL anchors deep-link from the structured data into the
// matching section heading on the page.
export function howToSchema(opts: {
  name: string
  description: string
  totalTime?: string // ISO 8601 duration, e.g. "PT5M"
  steps: { name: string; text: string; url?: string }[]
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: opts.name,
    description: opts.description,
    ...(opts.totalTime ? { totalTime: opts.totalTime } : {}),
    step: opts.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
      ...(s.url ? { url: s.url } : {}),
    })),
  }
}

// Section heading inside a guide article. The visual §-numbering, rules,
// and spacing all come from .guide-h2 (CSS counters), so every guide gets
// the same editorial sectioning without per-page markup.
export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="guide-h2"><span>{children}</span></h2>
}

export function P({ children }: { children: React.ReactNode }) {
  // Cap prose line length even though the article container is wider —
  // grids and tables get the full width, body paragraphs stay readable.
  return <p className="guide-p">{children}</p>
}

// Pull quote: a big serif line set off from the prose with rules, for the
// one sentence per guide that deserves to be read twice. Optional attr
// line renders as a mono credit under the quote.
export function PullQuote({ children, attr }: { children: React.ReactNode; attr?: string }) {
  return (
    <blockquote className="guide-pull">
      <p>{children}</p>
      {attr && <cite>{attr}</cite>}
    </blockquote>
  )
}

// Margin note: a small ruled aside for caveats and asterisks that would
// otherwise clog the prose.
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <aside className="guide-note" role="note">
      <span className="guide-note-star" aria-hidden>★</span>
      <div>{children}</div>
    </aside>
  )
}

// Locale-stable date formatting so the visible byline doesn't shift
// between server and client renders. UTC keeps the rendered string
// deterministic regardless of where the prerender runs.
function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}
