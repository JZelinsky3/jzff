import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { dealRedraft } from '@/lib/minigames/redraftDeal'
import { isRedraftMode } from '@/lib/minigames/redraft'
import { GameLobby } from '../GameLobby'
import { MobileGameLobby } from '../MobileGameLobby'
import { MobileGameBar } from '../MobileGameBar'
import { REDRAFT } from '../gameDefs'
import { Redraft } from './Redraft'
import styles from '../games.module.css'
import mobileStyles from '../mobile.module.css'

// The board is dealt per request (seeded off ?seed= or freshly rolled), so
// this page can never be prerendered.
export const dynamic = 'force-dynamic'

const TITLE = 'Redraft · Do it again, knowing how it went'
const DESC = 'Take over a real draft slot from your league and pick again, with hindsight.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: 'https://thesundaychronicle.app/games/redraft/' },
  openGraph: {
    type: 'website',
    url: 'https://thesundaychronicle.app/games/redraft/',
    title: TITLE,
    description: DESC,
    siteName: 'The Sunday Chronicle',
    images: [{ url: '/api/og/games?v=1', width: 1200, height: 630, alt: 'Redraft' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/api/og/games?v=1'] },
}

export default async function RedraftPage({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string; seed?: string; mode?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const requested = (sp.pool ?? '').toLowerCase()
  // Whole draft is the default: your opponent is a person rather than a
  // round, which is the version worth arguing about.
  const mode = isRedraftMode(sp.mode) ? sp.mode : 'manager'
  const dealt = requested ? await dealRedraft(requested, mode, sp.seed ?? null) : null

  const opening = dealt?.ok ? dealt : null
  const openingError = dealt && !dealt.ok ? dealt.error : null

  const mobile = (await getViewMode()) === 'mobile'

  if (mobile && !requested) {
    return <MobileGameLobby game={REDRAFT} />
  }

  return (
    <main className={mobile ? mobileStyles.boardRoot : undefined}>
      {mobile ? (
        <MobileGameBar
          left="back"
          kicker="The Games Page"
          title={REDRAFT.title}
          titleEm={REDRAFT.titleEm}
          signedIn={!!user}
        />
      ) : (
        <nav className="nav">
          <BackButton fallbackHref="/games/" ariaLabel="Back" />
          <div className="nav-center">
            <div className="nav-kicker">The Games Page</div>
            <div className="nav-title">The <em>Redraft</em></div>
          </div>
          <div className="pricing-nav-right">
            <Link href="/games/" className="pricing-nav-link">
              <span className="pricing-nav-link-text">All games</span>
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
      )}

      <div className={styles.wrap} style={{ '--accent': REDRAFT.accent } as React.CSSProperties}>
        <div className={styles.head}>
          {!mobile && <div className={styles.kicker}>★ Redraft ★</div>}
          <h1 className={styles.title}>
            {opening ? (
              opening.pool.label
            ) : (
              <>
                {REDRAFT.title} <em>{REDRAFT.titleEm}</em>
              </>
            )}
          </h1>
          <p className={styles.headSub}>
            {opening ? (
              <>
                {opening.pool.sublabel}
                {' · '}
                <Link href={REDRAFT.href} className={styles.headSwitch}>
                  Change league
                </Link>
              </>
            ) : (
              'Do it again, knowing how it went'
            )}
          </p>
        </div>

        {requested ? (
          <Redraft initialDeal={opening} initialError={openingError} signedIn={!!user} />
        ) : (
          <GameLobby game={REDRAFT} />
        )}
      </div>

      {!mobile && <SiteFooter />}
    </main>
  )
}
