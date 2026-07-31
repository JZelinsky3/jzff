import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { dealBlindItem } from '@/lib/minigames/blindDeal'
import { GameLobby } from '../GameLobby'
import { BLIND_ITEM } from '../gameDefs'
import { BlindItem } from './BlindItem'
import styles from '../games.module.css'

// The card is dealt per request (seeded off ?seed= or freshly rolled), so
// this page can never be prerendered.
export const dynamic = 'force-dynamic'

const TITLE = 'Blind Item · Name the manager, date the season'
const DESC = 'Eight drafts from your league, with the names taken out.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: 'https://thesundaychronicle.app/games/blind-item/' },
  openGraph: {
    type: 'website',
    url: 'https://thesundaychronicle.app/games/blind-item/',
    title: TITLE,
    description: DESC,
    siteName: 'The Sunday Chronicle',
    images: [{ url: '/api/og/games?v=1', width: 1200, height: 630, alt: 'Blind Item' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/api/og/games?v=1'] },
}

export default async function BlindItemPage({
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
  const dealt = requested ? await dealBlindItem(requested, sp.seed ?? null) : null

  const opening = dealt?.ok ? dealt : null
  const openingError = dealt && !dealt.ok ? dealt.error : null

  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref="/games/" ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">The Games Page</div>
          <div className="nav-title">Blind <em>Item</em></div>
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

      <div className={styles.wrap}>
        <div className={styles.head}>
          <div className={styles.kicker}>★ Blind Item ★</div>
          <h1 className={styles.title}>
            {opening ? (
              opening.pool.label
            ) : (
              <>
                {BLIND_ITEM.title} <em>{BLIND_ITEM.titleEm}</em>
              </>
            )}
          </h1>
          <p className={styles.headSub}>
            {opening ? (
              <>
                {opening.pool.sublabel}
                {' · '}
                <Link href={BLIND_ITEM.href} className={styles.headSwitch}>
                  Change league
                </Link>
              </>
            ) : (
              'Name the manager, date the season'
            )}
          </p>
        </div>

        {requested ? (
          <BlindItem initialDeal={opening} initialError={openingError} />
        ) : (
          <GameLobby game={BLIND_ITEM} />
        )}
      </div>

      <SiteFooter />
    </main>
  )
}
