import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { dealOverUnder } from '@/lib/minigames/overUnderDeal'
import { GameLobby } from '../GameLobby'
import { MobileGameLobby } from '../MobileGameLobby'
import { MobileGameBar } from '../MobileGameBar'
import { OVER_UNDER } from '../gameDefs'
import { OverUnder } from './OverUnder'
import styles from '../games.module.css'
import mobileStyles from '../mobile.module.css'

// The card is priced per request (seeded off ?seed= or freshly rolled), so
// this page can never be prerendered.
export const dynamic = 'force-dynamic'

const TITLE = 'The Over/Under · Beat the book on your own league'
const DESC = 'Ten real team-weeks from your league, ten lines. Say which way each one went.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: 'https://thesundaychronicle.app/games/over-under/' },
  openGraph: {
    type: 'website',
    url: 'https://thesundaychronicle.app/games/over-under/',
    title: TITLE,
    description: DESC,
    siteName: 'The Sunday Chronicle',
    images: [{ url: '/api/og/games?v=1', width: 1200, height: 630, alt: 'The Over/Under' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/api/og/games?v=1'] },
}

export default async function OverUnderPage({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string; seed?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const requested = (sp.pool ?? '').toLowerCase()
  const dealt = requested ? await dealOverUnder(requested, sp.seed ?? null) : null

  const opening = dealt?.ok ? dealt : null
  const openingError = dealt && !dealt.ok ? dealt.error : null

  const mobile = (await getViewMode()) === 'mobile'

  if (mobile && !requested) {
    return <MobileGameLobby game={OVER_UNDER} />
  }

  return (
    <main className={mobile ? mobileStyles.boardRoot : undefined}>
      {mobile ? (
        <MobileGameBar
          left="back"
          kicker="The Games Page"
          title={OVER_UNDER.title}
          titleEm={OVER_UNDER.titleEm}
          signedIn={!!user}
        />
      ) : (
        <nav className="nav">
          <BackButton fallbackHref="/games/" ariaLabel="Back" />
          <div className="nav-center">
            <div className="nav-kicker">The Games Page</div>
            <div className="nav-title">The <em>Over/Under</em></div>
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

      <div className={styles.wrap} style={{ '--accent': OVER_UNDER.accent } as React.CSSProperties}>
        <div className={styles.head}>
          {!mobile && <div className={styles.kicker}>★ The Over/Under ★</div>}
          <h1 className={styles.title}>
            {opening ? (
              opening.pool.label
            ) : (
              <>
                {OVER_UNDER.title} <em>{OVER_UNDER.titleEm}</em>
              </>
            )}
          </h1>
          <p className={styles.headSub}>
            {opening ? (
              <>
                {opening.pool.sublabel}
                {' · '}
                <Link href={OVER_UNDER.href} className={styles.headSwitch}>
                  Change league
                </Link>
              </>
            ) : (
              'Beat the book on your own league'
            )}
          </p>
        </div>

        {requested ? (
          <OverUnder initialDeal={opening} initialError={openingError} signedIn={!!user} />
        ) : (
          <GameLobby game={OVER_UNDER} />
        )}
      </div>

      {!mobile && <SiteFooter />}
    </main>
  )
}
