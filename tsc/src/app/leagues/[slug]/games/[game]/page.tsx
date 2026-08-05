import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { PlayGame } from '@/app/games/PlayGame'
import { MobileGameBar } from '@/app/games/MobileGameBar'
import styles from '@/app/games/games.module.css'
import mobileStyles from '@/app/games/mobile.module.css'
import { gameDefById, gamesBase, isPlayableGameId, loadLeagueGamesMeta } from '../leagueGames'

// The deal is rolled per request (seeded off ?seed= or freshly rolled), so
// this page can never be prerendered.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; game: string }>
}): Promise<Metadata> {
  const { slug, game } = await params
  const def = gameDefById(game)
  if (!def) return {}
  const league = await loadLeagueGamesMeta(slug)
  const name = `${def.title} ${def.titleEm}`
  return {
    title: `${name} · ${league.name}`,
    description: def.tagline,
    alternates: { canonical: `https://thesundaychronicle.app${gamesBase(slug)}${game}/` },
    openGraph: {
      type: 'website',
      url: `https://thesundaychronicle.app${gamesBase(slug)}${game}/`,
      title: `${name} · ${league.name}`,
      description: def.tagline,
      siteName: 'The Sunday Chronicle',
      images: [{ url: '/api/og/games?v=1', width: 1200, height: 630, alt: name }],
    },
    twitter: { card: 'summary_large_image', title: `${name} · ${league.name}`, description: def.tagline },
  }
}

export default async function LeagueGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; game: string }>
  searchParams: Promise<{ seed?: string; mode?: string }>
}) {
  const [{ slug, game }, sp] = await Promise.all([params, searchParams])
  if (!isPlayableGameId(game)) notFound()
  const def = gameDefById(game)
  if (!def) notFound()

  const [league, supabase, mobile] = await Promise.all([
    loadLeagueGamesMeta(slug),
    createClient(),
    getViewMode().then((v) => v === 'mobile'),
  ])
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const base = gamesBase(slug)

  // No ?pool= and no lobby. The pool is the league, which is the whole point
  // of this wing existing — see ../leagueGames.ts.
  const surface = (
    <PlayGame
      game={game}
      pool={slug}
      seed={sp.seed ?? null}
      mode={sp.mode ?? null}
      signedIn={!!user}
      mobile={mobile}
    />
  )

  return (
    // No tab bar on a board: the game already owns the bottom of the screen
    // (Roulette's lineup HUD, the Gauntlet's call button, the Multiverse
    // Draft's card tray). `boardRoot` also takes the hamburger sheet off.
    <main className={mobile ? mobileStyles.boardRoot : undefined}>
      {mobile ? (
        <MobileGameBar
          left="back"
          backHref={base}
          backLabel="This league's games"
          kicker={league.name}
          title={def.title}
          titleEm={def.titleEm}
          signedIn={!!user}
        />
      ) : (
        <nav className="nav">
          <BackButton fallbackHref={base} ariaLabel="Back" />
          <div className="nav-center">
            <div className="nav-kicker">{league.name}</div>
            <div className="nav-title">
              {def.title} <em>{def.titleEm}</em>
            </div>
          </div>
          <div className="pricing-nav-right">
            <Link href={base} className="pricing-nav-link">
              <span className="pricing-nav-link-text">All games</span>
            </Link>
            <Link href={`${base}board/?game=${def.id}`} className="pricing-nav-cta">
              The Board
            </Link>
          </div>
        </nav>
      )}

      <div className={styles.wrap} style={{ '--accent': def.accent } as React.CSSProperties}>
        <div className={styles.head}>
          {!mobile && (
            <div className={styles.kicker}>
              ★ {def.title} {def.titleEm} ★
            </div>
          )}
          <h1 className={styles.title}>{league.name}</h1>
          <p className={styles.headSub}>
            {def.tagline}
            {' · '}
            <Link href={`${base}board/?game=${def.id}`} className={styles.headSwitch}>
              The board
            </Link>
          </p>
        </div>

        {surface}
      </div>

      {/* The mobile board ends in a fixed bottom bar. A site footer under it
          is a second footer nobody scrolls past the first to read. */}
      {!mobile && <SiteFooter />}
    </main>
  )
}
