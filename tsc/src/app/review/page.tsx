import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { MobileReview } from '@/components/review/MobileReview'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { ReviewForm } from './review-form'

// Landing page for the end-of-testing review request. The email's five stars
// each link here with ?r= already set, so a tester who clicks "4 stars" in
// their inbox arrives with four stars lit and one button left to press. That
// one-click head start is the whole reason this is a page and not a "reply
// to this email" ask — a reply gives prose with no number attached, and most
// people never write it.

export const metadata: Metadata = {
  title: 'Review · The Sunday Chronicle',
  description: 'Tell us how the testing season went. Takes about a minute.',
  alternates: { canonical: 'https://thesundaychronicle.app/review/' },
  // Nothing to gain from indexing a feedback form.
  robots: { index: false, follow: false },
}

// Accept 1 .. 5 in half steps from the email links; anything else is ignored
// rather than clamped, so a mangled URL just lands on an unrated form.
function parseRating(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1 || n > 5) return null
  return (n * 2) % 1 === 0 ? n : null
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; src?: string }>
}) {
  const { r, src } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const rating = parseRating(r)

  // Phones get the dedicated mpg- tree rather than the desktop .nav grid.
  if ((await getViewMode()) === 'mobile') {
    return (
      <MobileReview
        initialRating={rating}
        source={src ?? null}
        signedInEmail={user?.email ?? null}
        signedIn={!!user}
      />
    )
  }

  return (
    <main>
      <nav className="nav">
        <div className="nav-center">
          <div className="nav-kicker">Review · The Sunday Chronicle</div>
          <div className="nav-title">How did <em>it go?</em></div>
        </div>
        <div className="pricing-nav-right">
          <Link href="/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Home</span>
          </Link>
          <Link href="/pricing/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Pricing</span>
          </Link>
          {user ? (
            <Link href="/dashboard" className="pricing-nav-cta">Dashboard</Link>
          ) : (
            <Link href="/login" className="pricing-nav-cta">Sign in</Link>
          )}
        </div>
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1rem' }}>
        <div className="hero-sup">★ The testing season closes August 16 ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.8rem)' }}>
          One minute, honestly.
        </h1>
        <p className="hero-sub">
          You used this while it was free and unfinished. The harsh notes are worth more
          than the kind ones.
        </p>
      </section>

      <div className="section" style={{ paddingBottom: '4rem' }}>
        <ReviewForm
          initialRating={rating}
          source={src ?? null}
          signedInEmail={user?.email ?? null}
        />
      </div>

      <SiteFooter />
    </main>
  )
}
