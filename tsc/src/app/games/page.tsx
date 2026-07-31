import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { GAMES } from './gameDefs'
import styles from './games.module.css'

export const metadata: Metadata = {
  title: 'The Games Page · Fantasy football minigames built on real league history',
  description:
    'Diversions built out of real fantasy league archives. Roster Roulette deals you random teams from seasons that actually happened; Guess the Draft hands you a draft with the names taken out and asks whose it was.',
  alternates: { canonical: 'https://thesundaychronicle.app/games/' },
  openGraph: {
    type: 'website',
    url: 'https://thesundaychronicle.app/games/',
    title: 'The Games Page · The Sunday Chronicle',
    description:
      'Diversions built out of real fantasy league archives. Play them on the whole site, on a demo league, or on your own.',
    siteName: 'The Sunday Chronicle',
    images: [{ url: '/api/og/games?v=1', width: 1200, height: 630, alt: 'The Games Page' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Games Page · The Sunday Chronicle',
    images: ['/api/og/games?v=1'],
  },
}

// Games that aren't built yet but are worth telling readers about, so the
// page reads as a section with a future rather than one toy on a shelf.
//
// "Guess the Season" used to live here as its own game and doesn't any more:
// asking only for the year gives a five-season league five possible answers
// and burns out in five rounds. It became the year half of Guess the Draft,
// which asks for the manager too.
//
// Guess the Lineup is the same question with different evidence, and it's
// listed as its own game rather than a mode because the shipped one is named
// for what it shows.
const COMING_SOON = [
  {
    title: 'Guess the Lineup',
    body: 'A starting lineup from the last week of a season, no name attached, same two answers. Blocked until more leagues have their weekly lineups on the books.',
  },
  {
    title: 'Bust or Boom',
    body: 'Two draft picks from your league’s history, side by side. Call which one actually returned value.',
  },
]

export default async function GamesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main>
      <nav className="nav">
        <BackButton fallbackHref="/" ariaLabel="Back" />
        <div className="nav-center">
          <div className="nav-kicker">The Sunday Chronicle</div>
          <div className="nav-title">The <em>Games Page</em></div>
        </div>
        <div className="pricing-nav-right">
          <Link href="/" className="pricing-nav-link">
            <span className="pricing-nav-link-text">Home</span>
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
          <div className={styles.kicker}>★ The back page ★</div>
          <h1 className={styles.title}>
            Games, built out of <em>real seasons.</em>
          </h1>
          <p className={styles.lede}>
            Every almanac on this site is a pile of teams that actually existed.
            These are the things worth doing with that pile when there is no
            football on.
          </p>
        </div>

        {/* Games only. Which league you play one ON is the next screen —
            mixing the two questions into one rail made every league appear
            once per game and left it hard to tell what was what. */}
        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}>§ 01</span>
          <span className={styles.sectionTitle}>Pick a game</span>
          <span className={styles.sectionMeta}>{GAMES.length} to play</span>
        </div>

        <div className={styles.rail}>
          {GAMES.map((g) => (
            <Link key={g.id} href={g.href} className={styles.gameCard}>
              <span className={styles.gameTitle}>
                {g.title} <em>{g.titleEm}</em>
              </span>
              <span className={styles.gameBody}>{g.short}</span>
              <span className={styles.gameHow}>
                {g.how.map((step) => (
                  <span key={step} className={styles.gameStep}>
                    {step}
                  </span>
                ))}
              </span>
              <span className={styles.gameFoot}>
                <span className={styles.gameAccess}>{g.access}</span>
                <span className={styles.gameGo}>Choose a league</span>
              </span>
            </Link>
          ))}
        </div>

        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}>§ 02</span>
          <span className={styles.sectionTitle}>On the drawing board</span>
          <span className={styles.sectionMeta}>Not built yet</span>
        </div>

        <div className={styles.rail}>
          {COMING_SOON.map((g) => (
            <div key={g.title} className={`${styles.card} ${styles.soon}`}>
              <span className={styles.cardTag}>Coming</span>
              <span className={styles.cardTitle}>{g.title}</span>
              <span className={styles.cardBody}>{g.body}</span>
              <span className={styles.cardFoot}>In the works</span>
            </div>
          ))}
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
