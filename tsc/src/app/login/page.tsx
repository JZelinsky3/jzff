import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BackButton } from '@/components/BackButton'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { LoginForm } from './login-form'
import { MobileLogin } from './MobileLogin'
import l from './login.module.css'

// Mobile auth runs in its own app-style tree — 1:1 scale wanted.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export const metadata: Metadata = {
  title: 'Login',
  description:
    "Login to The Sunday Chronicle to manage your fantasy football league's public almanac, sync history, and curate rivalries.",
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
    <main className={l.page}>
      <header className={l.bar}>
        <span className={l.barLeft}>
          <BackButton fallbackHref={backHref} ariaLabel="Back" />
        </span>
        <Link href="/" className={l.brand}>
          The Sunday <em>Chronicle.</em>
        </Link>
        <span className={l.barRight}>Members&rsquo; desk</span>
      </header>

      <section className={l.stage}>
        <p className={l.kicker}>★ Subscriber services ★</p>
        <h1 className={l.title}>
          Open your <em>archive.</em>
        </h1>
        <p className={l.sub}>
          Login to your library, or start a new chronicle. A few seconds either way.
        </p>

        <div className={l.card}>
          <LoginForm next={postAuthNext} initialMode={initialMode} />
        </div>

        <p className={l.fine}>
          Just browsing? <Link href="/demo/">The demo league is open to everyone</Link>
        </p>
      </section>
    </main>
  )
}
