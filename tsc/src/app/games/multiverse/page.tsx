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

/**
 * Two previews, off the same route.
 *
 * A bare link gets the game's own card — it used to get /api/og/games, which
 * is Roster Roulette's 17-0 scoreboard, so every game on the site posted the
 * same picture and none of them was this one.
 *
 * A link off the share button carries the season on it (?w, ?s, ?po), and the
 * card becomes the record plus fourteen weeks of marks. Nothing is read from
 * the database to render it, which is what lets a crawler with no session
 * scrape the finished season: the numbers are in the URL the sharer wrote.
 * They are boasts, not verified stats — the board is where a claim gets
 * checked, and nothing here is posted anywhere.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; s?: string; m?: string; po?: string }>
}): Promise<Metadata> {
  const sp = await searchParams

  const wins = Number(sp.w)
  const hasResult = sp.w !== undefined && Number.isFinite(wins) && wins >= 0 && wins <= 14
  const marks = /^[WLwl]{14}$/.test(sp.s ?? '') ? (sp.s as string).toUpperCase() : null
  const margins = /^[0-9a-yA-Y]{14}$/.test(sp.m ?? '') ? (sp.m as string).toLowerCase() : null
  const po = ['champion', 'final', 'out'].includes(sp.po ?? '') ? sp.po : null

  const og = new URLSearchParams()
  if (hasResult) {
    og.set('w', String(Math.round(wins)))
    if (marks) og.set('s', marks)
    if (margins) og.set('m', margins)
    if (po) og.set('po', po)
  }
  const image = `/api/og/multiverse${og.size ? `?${og}` : ''}`

  const title = hasResult
    ? `${Math.round(wins)}-${14 - Math.round(wins)} in The Multiverse Draft`
    : TITLE
  const desc = hasResult
    ? 'Draft your own board out of the same league and beat it.'
    : DESC

  return {
    title,
    description: desc,
    alternates: { canonical: 'https://thesundaychronicle.app/games/multiverse/' },
    openGraph: {
      type: 'website',
      url: 'https://thesundaychronicle.app/games/multiverse/',
      title,
      description: desc,
      siteName: 'The Sunday Chronicle',
      images: [{ url: image, width: 1200, height: 630, alt: 'The Multiverse Draft' }],
    },
    twitter: { card: 'summary_large_image', title, description: desc, images: [image] },
  }
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
            // Layout is handled in CSS; this is for COPY. A phone gets the
            // short version of every caption, because the long ones wrap to
            // three lines in a header that is two lines tall.
            mobile={mobile}
          />
        ) : (
          <GameLobby game={MULTIVERSE_DRAFT} />
        )}
      </div>

      {!mobile && <SiteFooter />}
    </main>
  )
}
