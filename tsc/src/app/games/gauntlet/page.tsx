import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { dealGauntlet } from '@/lib/minigames/gauntletDeal'
import { GameLobby } from '../GameLobby'
import { MobileGameLobby } from '../MobileGameLobby'
import { MobileGameBar } from '../MobileGameBar'
import { isGauntletMode } from '@/lib/minigames/gauntlet'
import { THE_GAUNTLET } from '../gameDefs'
import { TheGauntlet } from './TheGauntlet'
import styles from '../games.module.css'
import mobileStyles from '../mobile.module.css'

// The run is dealt per request (seeded off ?seed= or freshly rolled), so this
// page can never be prerendered.
export const dynamic = 'force-dynamic'

const TITLE = 'The Gauntlet · Call them until you miss'
const DESC = 'Two teams, one week of your league’s history. Say who won, and keep saying it.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: 'https://thesundaychronicle.app/games/gauntlet/' },
  openGraph: {
    type: 'website',
    url: 'https://thesundaychronicle.app/games/gauntlet/',
    title: TITLE,
    description: DESC,
    siteName: 'The Sunday Chronicle',
    images: [{ url: '/api/og/games?v=1', width: 1200, height: 630, alt: 'The Gauntlet' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/api/og/games?v=1'] },
}

export default async function GauntletPage({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string; seed?: string; mode?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // No pool means nobody has chosen a league yet, so this route is the lobby
  // rather than the board. A link carrying ?pool= still goes straight to the
  // first question, which is what every shared link does.
  const requested = (sp.pool ?? '').toLowerCase()
  // The card of ten is the default: sudden death can be over in four seconds,
  // which is a rough way to meet a game.
  const mode = isGauntletMode(sp.mode) ? sp.mode : 'ten'
  const dealt = requested ? await dealGauntlet(requested, mode, sp.seed ?? null) : null

  const opening = dealt?.ok ? dealt : null
  const openingError = dealt && !dealt.ok ? dealt.error : null

  const mobile = (await getViewMode()) === 'mobile'

  if (mobile && !requested) {
    return <MobileGameLobby game={THE_GAUNTLET} />
  }

  return (
    // No dock on a board: the call button already holds the bottom of the
    // screen. `boardRoot` takes the hamburger sheet off the page.
    <main className={mobile ? mobileStyles.boardRoot : undefined}>
      {mobile ? (
        <MobileGameBar
          left="back"
          kicker="The Games Page"
          title={THE_GAUNTLET.title}
          titleEm={THE_GAUNTLET.titleEm}
          signedIn={!!user}
        />
      ) : (
        <nav className="nav">
          <BackButton fallbackHref="/games/" ariaLabel="Back" />
          <div className="nav-center">
            <div className="nav-kicker">The Games Page</div>
            <div className="nav-title">The <em>Gauntlet</em></div>
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

      <div className={styles.wrap} style={{ '--accent': THE_GAUNTLET.accent } as React.CSSProperties}>
        <div className={styles.head}>
          {!mobile && <div className={styles.kicker}>★ The Gauntlet ★</div>}
          <h1 className={styles.title}>
            {opening ? (
              opening.pool.label
            ) : (
              <>
                {THE_GAUNTLET.title} <em>{THE_GAUNTLET.titleEm}</em>
              </>
            )}
          </h1>
          <p className={styles.headSub}>
            {opening ? (
              <>
                {opening.pool.sublabel}
                {' · '}
                <Link href={THE_GAUNTLET.href} className={styles.headSwitch}>
                  Change league
                </Link>
              </>
            ) : (
              'Call them until you miss'
            )}
          </p>
        </div>

        {requested ? (
          <TheGauntlet
            initialDeal={opening}
            initialError={openingError}
            signedIn={!!user}
          />
        ) : (
          <GameLobby game={THE_GAUNTLET} />
        )}
      </div>

      {/* The mobile board calls from a fixed bottom bar, so a site footer
          under it is a second footer nobody scrolls past the first to read. */}
      {!mobile && <SiteFooter />}
    </main>
  )
}
