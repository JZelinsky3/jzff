import type { Metadata } from 'next'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { loadPoolsForViewer } from './pools'
import styles from './games.module.css'

export const metadata: Metadata = {
  title: 'The Games Page · Fantasy football minigames built on real league history',
  description:
    'Diversions built out of real fantasy league archives. Roster Roulette deals you random teams from seasons that actually happened and asks you to build a lineup good enough to go 17-0.',
  alternates: { canonical: 'https://thesundaychronicle.app/games/' },
  openGraph: {
    type: 'website',
    url: 'https://thesundaychronicle.app/games/',
    title: 'The Games Page · The Sunday Chronicle',
    description:
      'Diversions built out of real fantasy league archives. Spin for a real team from a real season and see if your lineup goes 17-0.',
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
const COMING_SOON = [
  {
    title: 'Guess the Season',
    body: 'A final standings table with the names stripped out. Work out which year of your league you are looking at.',
  },
  {
    title: 'Bust or Boom',
    body: 'Two draft picks from your league’s history, side by side. Call which one actually returned value.',
  },
]

export default async function GamesPage() {
  const { signedIn, leaguePools } = await loadPoolsForViewer()
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

        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}>§ 01</span>
          <span className={styles.sectionTitle}>Open to everyone</span>
          <span className={styles.sectionMeta}>No account needed</span>
        </div>

        <div className={styles.rail}>
          <Link href="/games/roulette/?pool=site" className={styles.card}>
            <span className={styles.cardTag}>Roster Roulette</span>
            <span className={styles.cardTitle}>The whole site</span>
            <span className={styles.cardBody}>
              The wheel pulls from every published almanac here. Spin, take one
              player off whoever&apos;s team lands, fill seven slots, and see whether
              the lineup goes 17-0.
            </span>
            <span className={styles.cardFoot}>Play now</span>
          </Link>
        </div>

        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}>§ 02</span>
          <span className={styles.sectionTitle}>Your leagues</span>
          <span className={styles.sectionMeta}>
            {signedIn ? `${leaguePools.length} available` : 'Sign in'}
          </span>
        </div>

        {!signedIn ? (
          <div className={styles.empty}>
            <Link href="/login">Sign in</Link> and every league you run or follow
            becomes its own wheel — spins land on your league-mates&apos; real teams
            instead of strangers&apos;.
          </div>
        ) : leaguePools.length === 0 ? (
          <div className={styles.empty}>
            No leagues on your shelf yet.{' '}
            <Link href="/dashboard/new">Build an almanac</Link> and its whole history
            becomes a wheel you can spin.
          </div>
        ) : (
          <div className={styles.rail}>
            {leaguePools.map((p) => (
              <Link
                key={p.id}
                href={`/games/roulette/?pool=${encodeURIComponent(p.id)}`}
                className={styles.card}
              >
                <span className={styles.cardTag}>Roster Roulette</span>
                <span className={styles.cardTitle}>{p.label}</span>
                <span className={styles.cardBody}>
                  Every completed season your league has on the books, one squad per
                  manager per year. Spins land on people you actually know.
                </span>
                <span className={styles.cardFoot}>{p.note}</span>
              </Link>
            ))}
          </div>
        )}

        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}>§ 03</span>
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
