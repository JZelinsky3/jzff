import Link from 'next/link'
import { BackLink } from '@/components/BackLink'

// Shared mobile shell for the React-side content pages (about, guides,
// legal trio, tools, manager) that don't need a bespoke mobile-native
// feed like /dashboard or /league/[slug]. Provides a sticky top bar with
// back arrow, an optional hero block, a content slot, and a quiet
// footer. Prefix: mpg-. Pages just pipe their existing body markup in;
// the desktop layout's heavy .nav grid is bypassed entirely.
export function MobilePageShell({
  backHref,
  backLabel = 'Back',
  barTitle,
  barTitleEm,
  rightLink,
  kicker,
  heroTitle,
  heroTitleEm,
  heroSub,
  signedIn = false,
  bodyClassName,
  children,
}: {
  backHref: string
  backLabel?: string
  barTitle: string
  barTitleEm?: string
  rightLink?: { href: string; label: string }
  kicker?: string
  heroTitle?: string
  heroTitleEm?: string
  heroSub?: React.ReactNode
  signedIn?: boolean
  /** Extra class on .mpg-body. The games tree uses it to drop the body's
      own side padding, because its rows are full-bleed and pad themselves;
      without it every row sat inside two sets of gutters. */
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <main className="mpg">
      <header className="mpg-bar">
        <BackLink href={backHref} className="mpg-bar-back" ariaLabel={backLabel}>
          <svg viewBox="0 0 8 14" width="10" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </BackLink>
        <span className="mpg-bar-title">
          {barTitle}{barTitleEm ? <> <em>{barTitleEm}</em></> : null}
        </span>
        {rightLink ? (
          <Link href={rightLink.href} className="mpg-bar-link">{rightLink.label}</Link>
        ) : (
          <span className="mpg-bar-spacer" />
        )}
      </header>

      {(kicker || heroTitle || heroSub) && (
        <section className="mpg-hero">
          {kicker && <div className="mpg-hero-sup">★ {kicker} ★</div>}
          {heroTitle && (
            <h1 className="mpg-hero-title">
              {heroTitle}
              {heroTitleEm ? <> <em>{heroTitleEm}</em></> : null}
            </h1>
          )}
          {heroSub && <p className="mpg-hero-sub">{heroSub}</p>}
        </section>
      )}

      <div className={bodyClassName ? `mpg-body ${bodyClassName}` : 'mpg-body'}>{children}</div>

      <div className="mpg-footer">
        <Link href="/" className="mpg-footer-link">Home</Link>
        <span className="mpg-footer-sep">·</span>
        <Link href="/pricing" className="mpg-footer-link">Pricing</Link>
        <span className="mpg-footer-sep">·</span>
        <Link href={signedIn ? '/dashboard' : '/login'} className="mpg-footer-link">
          {signedIn ? 'Library' : 'Login'}
        </Link>
      </div>
    </main>
  )
}
