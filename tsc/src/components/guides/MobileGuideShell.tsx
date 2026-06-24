import Link from 'next/link'
import { MobilePageShell } from '@/components/mobile/MobilePageShell'

// Mobile version of GuideShell (src/app/guides/_layout.tsx). Renders the
// same article body + JSON-LD scripts inside the slim mobile chrome.
export function MobileGuideShell({
  kicker,
  title,
  titleEm,
  subtitle,
  faqJsonLd,
  howToJsonLd,
  articleAndCrumbsLd,
  byline,
  signedIn,
  children,
}: {
  kicker: string
  title: string
  titleEm: string
  subtitle: string
  faqJsonLd?: object
  howToJsonLd?: object
  articleAndCrumbsLd: object | null
  byline: React.ReactNode
  signedIn: boolean
  children: React.ReactNode
}) {
  return (
    <>
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
      <MobilePageShell
        backHref="/guides/"
        backLabel="Back to guides"
        barTitle="Guide"
        signedIn={signedIn}
        kicker={kicker}
        heroTitle={title}
        heroTitleEm={titleEm}
        heroSub={subtitle}
      >
        <div className="mpg-byline">{byline}</div>
        <article className="mpg-article">{children}</article>

        <div className="mpg-cta">
          <div className="mpg-cta-kicker">★ Try it</div>
          <div className="mpg-cta-title">
            See your league&apos;s <em>full history</em> in 30 seconds.
          </div>
          <div className="mpg-cta-desc">
            Paste your Sleeper, ESPN, or NFL.com league ID. 7-day free trial.
          </div>
          <div className="mpg-cta-btns">
            <Link href="/login?mode=signup" className="dc-btn">Start archive</Link>
            <a href="/demo/" target="_blank" rel="noopener" className="dc-btn-ghost">Tour demo</a>
          </div>
        </div>
      </MobilePageShell>
    </>
  )
}
