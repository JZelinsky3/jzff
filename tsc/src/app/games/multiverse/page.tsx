import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { dealMultiverse } from '@/lib/minigames/multiverseDeal'
import { GameLobby } from '../GameLobby'
import { MobileGameLobby } from '../MobileGameLobby'
import { MobileGameBar } from '../MobileGameBar'
import { MULTIVERSE_DRAFT } from '../gameDefs'
import { MultiverseDraft } from './MultiverseDraft'
import styles from '../games.module.css'
import mobileStyles from '../mobile.module.css'
import mv from './multiverse.module.css'

// The season is dealt per request (seeded off ?seed= or freshly rolled), so
// this page can never be prerendered.
export const dynamic = 'force-dynamic'

const TITLE = 'The Multiverse Draft · Every player is three players'
const DESC =
  'Draft players across every season your league rostered them, then play out fourteen weeks where each one rolls a different year.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: 'https://thesundaychronicle.app/games/multiverse/' },
  openGraph: {
    type: 'website',
    url: 'https://thesundaychronicle.app/games/multiverse/',
    title: TITLE,
    description: DESC,
    siteName: 'The Sunday Chronicle',
    images: [{ url: '/api/og/games?v=1', width: 1200, height: 630, alt: 'The Multiverse Draft' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/api/og/games?v=1'] },
}

export default async function MultiversePage({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string; seed?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const requested = (sp.pool ?? '').toLowerCase()
  const dealt = requested ? await dealMultiverse(requested, sp.seed ?? null) : null

  const opening = dealt?.ok ? dealt : null
  const openingError = dealt && !dealt.ok ? dealt.error : null

  const mobile = (await getViewMode()) === 'mobile'

  if (mobile && !requested) {
    return <MobileGameLobby game={MULTIVERSE_DRAFT} />
  }

  return (
    <main className={`${mv.theme} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      {mobile ? (
        <MobileGameBar
          left="back"
          kicker="The Games Page"
          title={MULTIVERSE_DRAFT.title}
          titleEm={MULTIVERSE_DRAFT.titleEm}
          signedIn={!!user}
        />
      ) : (
        <nav className="nav">
          <BackButton fallbackHref="/games/" ariaLabel="Back" />
          <div className="nav-center">
            <div className="nav-kicker">The Games Page</div>
            <div className="nav-title">
              The <em>Multiverse Draft</em>
            </div>
          </div>
          <div className="pricing-nav-right">
            <Link href="/games/" className="pricing-nav-link">
              <span className="pricing-nav-link-text">All games</span>
            </Link>
            {user ? (
              <Link href="/dashboard" className="pricing-nav-cta">
                Library
              </Link>
            ) : (
              <Link href="/login" className="pricing-nav-cta">
                Login
              </Link>
            )}
          </div>
        </nav>
      )}

      <div
        className={styles.wrap}
        style={{ '--accent': MULTIVERSE_DRAFT.accent } as React.CSSProperties}
      >
        <div className={styles.head}>
          {!mobile && <div className={styles.kicker}>★ The Multiverse Draft ★</div>}
          <h1 className={styles.title}>
            {opening ? (
              opening.pool.label
            ) : (
              <>
                {MULTIVERSE_DRAFT.title} <em>{MULTIVERSE_DRAFT.titleEm}</em>
              </>
            )}
          </h1>
          <p className={styles.headSub}>
            {opening ? (
              <>
                {opening.pool.sublabel}
                {' · '}
                <Link href={MULTIVERSE_DRAFT.href} className={styles.headSwitch}>
                  Change league
                </Link>
              </>
            ) : (
              'Every player is three players'
            )}
          </p>
        </div>

        {requested ? (
          <MultiverseDraft
            initialDeal={opening}
            initialError={openingError}
            signedIn={!!user}
            // A season opened off a shared ?seed= is a replay of a deal
            // somebody has already played, which is the definition of a run
            // that cannot be ranked. The board refuses it out loud.
            shared={!!sp.seed}
          />
        ) : (
          <GameLobby game={MULTIVERSE_DRAFT} />
        )}
      </div>

      {!mobile && <SiteFooter />}
    </main>
  )
}
