import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { dealGuessDraft } from '@/lib/minigames/guessDraftDeal'
import { GameLobby } from '../GameLobby'
import { MobileGameLobby } from '../MobileGameLobby'
import { MobileGameBar } from '../MobileGameBar'
import { GUESS_THE_DRAFT } from '../gameDefs'
import { GuessTheDraft } from './GuessTheDraft'
import styles from '../games.module.css'

// The card is dealt per request (seeded off ?seed= or freshly rolled), so
// this page can never be prerendered.
export const dynamic = 'force-dynamic'

const TITLE = 'Guess the Draft · Name the manager, date the season'
const DESC = 'Eight drafts from your league, with the names taken out.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: 'https://thesundaychronicle.app/games/guess-the-draft/' },
  openGraph: {
    type: 'website',
    url: 'https://thesundaychronicle.app/games/guess-the-draft/',
    title: TITLE,
    description: DESC,
    siteName: 'The Sunday Chronicle',
    images: [{ url: '/api/og/games?v=1', width: 1200, height: 630, alt: 'Guess the Draft' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/api/og/games?v=1'] },
}

export default async function GuessTheDraftPage({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string; seed?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // No pool means nobody has chosen a league yet, so this route is the lobby
  // rather than the board. A link that carries ?pool= still goes straight to
  // the cards, which is what every shared link does.
  const requested = (sp.pool ?? '').toLowerCase()
  const dealt = requested ? await dealGuessDraft(requested, sp.seed ?? null) : null

  const opening = dealt?.ok ? dealt : null
  const openingError = dealt && !dealt.ok ? dealt.error : null

  const mobile = (await getViewMode()) === 'mobile'

  // Lobby on a phone is a list of leagues, so it gets the full mobile shell
  // rather than the board's bare app bar.
  if (mobile && !requested) {
    return <MobileGameLobby game={GUESS_THE_DRAFT} />
  }

  return (
    <main>
      {mobile ? (
        <MobileGameBar
          backHref="/games/"
          title={GUESS_THE_DRAFT.title}
          titleEm={GUESS_THE_DRAFT.titleEm}
        />
      ) : (
      <nav className="nav">
        <BackButton fallbackHref="/games/" ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">The Games Page</div>
          <div className="nav-title">Guess the <em>Draft</em></div>
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

      <div className={styles.wrap}>
        <div className={styles.head}>
          {/* Named in the bar above on a phone; repeating it here costs the
              board a line of the fold. */}
          {!mobile && <div className={styles.kicker}>★ Guess the Draft ★</div>}
          <h1 className={styles.title}>
            {opening ? (
              opening.pool.label
            ) : (
              <>
                {GUESS_THE_DRAFT.title} <em>{GUESS_THE_DRAFT.titleEm}</em>
              </>
            )}
          </h1>
          <p className={styles.headSub}>
            {opening ? (
              <>
                {opening.pool.sublabel}
                {' · '}
                <Link href={GUESS_THE_DRAFT.href} className={styles.headSwitch}>
                  Change league
                </Link>
              </>
            ) : (
              'Name the manager, date the season'
            )}
          </p>
        </div>

        {requested ? (
          <GuessTheDraft
            initialDeal={opening}
            initialError={openingError}
            signedIn={!!user}
          />
        ) : (
          <GameLobby game={GUESS_THE_DRAFT} />
        )}
      </div>

      {/* The mobile board answers from a fixed bottom bar, so a site footer
          under it is a second footer nobody scrolls past the first to read. */}
      {!mobile && <SiteFooter />}
    </main>
  )
}
