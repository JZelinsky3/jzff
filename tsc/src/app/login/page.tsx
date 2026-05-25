import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string; from?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const { next, mode, from } = await searchParams
  const initialMode = mode === 'signup' ? 'signup' : 'signin'

  // Back-arrow target: prefer the explicit `from` param (set by nav.js when
  // a visitor clicks a signup link on the public almanac), fall back to /.
  // Only allow same-origin paths to avoid open-redirect.
  const backHref = from && from.startsWith('/') && !from.startsWith('//') ? from : '/'

  return (
    <main>
      <nav className="nav">
        <Link href={backHref} className="dc-nav-icon" aria-label="Back">
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
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
          <LoginForm next={next} initialMode={initialMode} />
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
