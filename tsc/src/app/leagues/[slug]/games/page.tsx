import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { GameMark } from '@/app/games/GameMark'
import { MobileGamesDock } from '@/app/games/MobileGamesDock'
import { MobileGameBar } from '@/app/games/MobileGameBar'
import styles from '@/app/games/games.module.css'
import s from '@/app/games/mobile.module.css'
import { gamesBase, leagueGames, loadLeagueGamesMeta } from './leagueGames'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const league = await loadLeagueGamesMeta(slug)
  return {
    title: `Games · ${league.name}`,
    description: `Minigames dealt out of ${league.name}'s own history: real teams, real drafts, real weeks, people you actually know.`,
    alternates: { canonical: `https://thesundaychronicle.app${gamesBase(slug)}` },
    openGraph: {
      type: 'website',
      url: `https://thesundaychronicle.app${gamesBase(slug)}`,
      title: `Games · ${league.name}`,
      description: `Minigames dealt out of ${league.name}'s own history.`,
      siteName: 'The Sunday Chronicle',
      images: [{ url: '/api/og/games?v=1', width: 1200, height: 630, alt: 'Games' }],
    },
  }
}

export default async function LeagueGamesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [league, supabase, mobile] = await Promise.all([
    loadLeagueGamesMeta(slug),
    createClient(),
    getViewMode().then((v) => v === 'mobile'),
  ])
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const games = leagueGames()
  const base = gamesBase(slug)
  const boardHref = `${base}board/`
  const span =
    league.firstYear && league.lastYear && league.firstYear !== league.lastYear
      ? `${league.firstYear}–${league.lastYear}`
      : league.firstYear
        ? String(league.firstYear)
        : null

  // The line under the masthead. It is the league's own numbers rather than a
  // pitch, because the pitch was already made by whatever link got somebody
  // here, and "seven seasons" is the thing that decides whether a wheel is
  // worth spinning.
  const stat = [
    league.seasons > 0 ? `${league.seasons} completed season${league.seasons === 1 ? '' : 's'}` : null,
    span,
    league.managers > 0 ? `${league.managers} managers` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (mobile) {
    return (
      <main className={s.root}>
        <MobileGameBar
          left="back"
          backHref={`/leagues/${slug}/`}
          right="profile"
          kicker={league.name}
          title="The"
          titleEm="Games Page"
          signedIn={!!user}
        />

        <section className={s.hero}>
          <div className={s.heroSup}>★ Your league ★</div>
          <h1 className={s.heroTitle}>
            Games, built out of <em>your seasons.</em>
          </h1>
          <p className={s.heroSub}>
            Every one of these deals off {league.name}. No league to pick.
          </p>
          <div className={s.heroMeta}>
            {league.seasons > 0 && (
              <span>
                {league.seasons} season{league.seasons === 1 ? '' : 's'}
              </span>
            )}
            {span && <span>{span}</span>}
          </div>
        </section>

        <section className={s.sec}>
          <div className={s.secHead}>
            <div>
              <span className={s.secNum}>§ 01 · On the table</span>
              <span className={s.secTitle}>Pick a game</span>
            </div>
            <span className={s.secSide}>{games.length} to play</span>
          </div>

          <div className={s.games}>
            {games.map((g) => (
              <Link
                key={g.id}
                href={`${base}${g.id}/`}
                className={s.game}
                style={{ '--accent': g.accent } as React.CSSProperties}
              >
                <GameMark id={g.id} />
                <span className={s.gameBody}>
                  <span className={s.gameTitle}>
                    {g.title} <em>{g.titleEm}</em>
                  </span>
                  <span className={s.gameLine}>{g.tagline}</span>
                  <span className={s.gameFoot}>
                    <span className={s.chip}>{league.abbreviation ?? league.name}</span>
                    <span className={s.gameGo}>Play</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className={s.sec}>
          <div className={s.secHead}>
            <div>
              <span className={s.secNum}>§ 02 · Standing</span>
              <span className={s.secTitle}>The board</span>
            </div>
            <span className={s.secSide}>All games</span>
          </div>
          <div className={s.empty}>
            One leaderboard for the whole league, switchable by game.{' '}
            <Link href={boardHref}>Read the board</Link>.
          </div>
        </section>

        <MobileGamesDock
          base={base}
          home={{ href: base, label: 'Shelf', icon: 'shelf' }}
          boardHref={boardHref}
          signedIn={!!user}
          leagueSlug={slug}
          leagueName={league.name}
        />
      </main>
    )
  }

  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref={`/leagues/${slug}/`} ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">{league.name}</div>
          <div className="nav-title">
            The <em>Games Page</em>
          </div>
        </div>
        <div className="pricing-nav-right">
          <Link href={`/leagues/${slug}/`} className="pricing-nav-link">
            <span className="pricing-nav-link-text">Almanac</span>
          </Link>
          <Link href={boardHref} className="pricing-nav-cta">
            The Board
          </Link>
        </div>
      </nav>

      <div className={styles.wrap}>
        <div className={styles.head}>
          <div className={styles.kicker}>★ {league.name} ★</div>
          <h1 className={styles.title}>
            Games, built out of <em>your seasons.</em>
          </h1>
          <p className={styles.lede}>
            Every game on this page is already pointed at {league.name}. Nothing
            to choose, nothing to sign into: the wheel lands on people you know,
            the drafts are ones you were there for, and the weeks actually
            happened.
          </p>
          {stat && <p className={styles.headSub}>{stat}</p>}
        </div>

        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}>§ 01</span>
          <span className={styles.sectionTitle}>Pick a game</span>
          <span className={styles.sectionMeta}>{games.length} to play</span>
        </div>

        <div className={styles.gameRail}>
          {games.map((g, i) => (
            <Link
              key={g.id}
              href={`${base}${g.id}/`}
              className={i === 0 ? `${styles.gameCard} ${styles.gameLead}` : styles.gameCard}
              style={{ '--accent': g.accent } as React.CSSProperties}
            >
              <GameMark id={g.id} variant={i === 0 ? 'lead' : 'poster'} />
              <span className={styles.gameCardBody}>
                <span className={styles.gameNo} aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={styles.gameTitle}>
                  {g.title} <em>{g.titleEm}</em>
                </span>
                <span className={styles.gameLine}>{g.tagline}</span>
                <span className={styles.gameFoot}>
                  <span className={styles.gameAccess}>{league.abbreviation ?? league.name}</span>
                  <span className={styles.gameGo}>Play</span>
                </span>
              </span>
            </Link>
          ))}
        </div>

        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}>§ 02</span>
          <span className={styles.sectionTitle}>The board</span>
          <span className={styles.sectionMeta}>Every game, one page</span>
        </div>

        <div className={styles.empty}>
          Every run played on {league.name} lands on one leaderboard, switchable
          by game. <Link href={boardHref}>Read the board</Link>.
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
