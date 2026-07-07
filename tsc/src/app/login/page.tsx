import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { LoginForm } from './login-form'
import { MobileLogin } from './MobileLogin'

// Mobile auth runs in its own app-style tree — 1:1 scale wanted.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export const metadata: Metadata = {
  title: 'Sign in',
  description:
    "Sign in to The Sunday Chronicle to manage your fantasy football league's public almanac, sync history, and curate rivalries.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string; from?: string }>
}) {
  const { next, mode, from } = await searchParams
  const initialMode = mode === 'signup' ? 'signup' : 'signin'

  // Back-arrow target: prefer the explicit `from` param (set by nav.js when
  // a visitor clicks a signup link on the public almanac), fall back to /.
  // Only allow same-origin paths to avoid open-redirect.
  const safeFrom = from && from.startsWith('/') && !from.startsWith('//') ? from : null
  const backHref = safeFrom ?? '/'

  // Post-auth destination: explicit `next` takes priority, then `from` (so a
  // visitor who came from /leagues/jake/ and signed in lands back there), then
  // the Clubhouse. The LoginForm uses this string verbatim on success.
  const postAuthNext = next || safeFrom || undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Already signed in? Honor the requested post-auth destination too — this
  // covers the case where a user clicks Sign In on an almanac, lands on
  // /login, but is already authenticated from a previous tab/session.
  if (user) redirect(postAuthNext ?? '/hub')

  if ((await getViewMode()) === 'mobile') {
    return <MobileLogin backHref={backHref} postAuthNext={postAuthNext} initialMode={initialMode} />
  }

  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref={backHref} ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">Sign in</div>
          <div className="nav-title">The <em>Library.</em></div>
        </div>
        <span className="nav-link" style={{ visibility: 'hidden' }}>—</span>
      </nav>

      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '2rem' }}>
        <div className="hero-sup">★ Open the archive ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}>
          The <em>library.</em>
        </h1>
        <p className="hero-sub">
          Sign in to your archive, or start a new one. Either way takes a few seconds.
        </p>
      </section>

      <div className="section" style={{ maxWidth: '460px' }}>
        <div className="dc-card-static">
          <LoginForm next={postAuthNext} initialMode={initialMode} />
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
