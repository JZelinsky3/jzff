import Link from 'next/link'
import { MobileLoginForm } from './mobile-login-form'

// App-style mobile auth screen. Server component; the form itself is the
// only client island. No "scaled-down desktop" — single-column app shell
// with crest, segmented control, large pill inputs, bottom CTA.
export function MobileLogin({
  backHref,
  postAuthNext,
  initialMode,
}: {
  backHref: string
  postAuthNext: string | undefined
  initialMode: 'signin' | 'signup'
}) {
  const titleCopy = initialMode === 'signup'
    ? { sup: '★ Start your archive ★', head: 'Open your', em: 'library.', sub: "Make an account in seconds — we'll walk every season for you." }
    : { sup: '★ Welcome back ★', head: 'Open your', em: 'library.', sub: 'Sign in to your archive. A few seconds and you’re back in.' }

  return (
    <main className="mlogin">
      <header className="mlogin-bar">
        <Link href={backHref} className="mlogin-bar-back" aria-label="Back">
          <svg viewBox="0 0 8 14" width="10" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <span className="mlogin-bar-title">The Sunday <em>Chronicle.</em></span>
        <span className="mlogin-bar-spacer" aria-hidden />
      </header>

      <section className="mlogin-hero">
        <div className="mlogin-crest" aria-hidden>
          <span className="mlogin-crest-star">★</span>
        </div>
        <div className="mlogin-sup">{titleCopy.sup}</div>
        <h1 className="mlogin-title">
          {titleCopy.head}<br /><em>{titleCopy.em}</em>
        </h1>
        <p className="mlogin-sub">{titleCopy.sub}</p>
      </section>

      <section className="mlogin-card">
        <MobileLoginForm next={postAuthNext} initialMode={initialMode} />
      </section>

      <footer className="mlogin-foot">
        {/* "View desktop site" link removed 2026-06-24 — see MobilePricing. */}
        <Link href="/about" className="mlogin-foot-link">About</Link>
        <span className="mlogin-foot-sep">·</span>
        <Link href="/pricing" className="mlogin-foot-link">Pricing</Link>
      </footer>
    </main>
  )
}
