import Link from 'next/link'
import { MobilePageShell } from '@/components/mobile/MobilePageShell'
import { GAMES } from './gameDefs'
import type { GameDef } from './gameDefs'
import styles from './mobile.module.css'

// The Games Page on a phone.
//
// Same two-step as desktop (pick a game, then a league) but shaped like the
// rest of the mobile site: the shared app shell for the bar, hero and
// footer, then one full-width tap card per game.
//
// The three how-it's-played beats are NOT repeated here. They're on the very
// next screen, above the league list, where someone is deciding whether to
// play rather than which game to look at, and stacking them on a phone made
// two cards fill a screen and a half.

export function MobileGames({
  signedIn,
  comingSoon,
}: {
  signedIn: boolean
  comingSoon: { title: string; body: string }[]
}) {
  return (
    <MobilePageShell
      backHref="/"
      barTitle="The"
      barTitleEm="Games Page"
      signedIn={signedIn}
      kicker="The back page"
      heroTitle="Games, built out of"
      heroTitleEm="real seasons."
      heroSub="Every almanac here is a pile of teams that actually existed. These are the things worth doing with it."
      bodyClassName={styles.body}
    >
      <div className={styles.root}>
        <div className={styles.sec}>
          <span className={styles.secNum}>§ 01</span>
          <span className={styles.secTitle}>Pick a game</span>
          <span className={styles.secMeta}>{GAMES.length} to play</span>
        </div>

        <div className={styles.list}>
          {GAMES.map((g: GameDef) => (
            <Link key={g.id} href={g.href} className={styles.game}>
              <span className={styles.gameTitle}>
                {g.title} <em>{g.titleEm}</em>
              </span>
              <span className={styles.gameBody}>{g.short}</span>
              <span className={styles.gameFoot}>
                <span className={styles.gameAccess}>{g.access}</span>
                <span className={styles.gameGo}>
                  Choose a league
                  <Chevron />
                </span>
              </span>
            </Link>
          ))}
        </div>

        <div className={styles.sec}>
          <span className={styles.secNum}>§ 02</span>
          <span className={styles.secTitle}>On the drawing board</span>
          <span className={styles.secMeta}>Not built yet</span>
        </div>

        <div className={styles.list}>
          {comingSoon.map((g) => (
            <div key={g.title} className={styles.soon}>
              <span className={styles.soonTitle}>{g.title}</span>
              <span className={styles.soonBody}>{g.body}</span>
            </div>
          ))}
        </div>

        <div className={styles.tail} />
      </div>
    </MobilePageShell>
  )
}

export function Chevron() {
  return (
    <svg
      viewBox="0 0 8 14"
      width="7"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="1 1 7 7 1 13" />
    </svg>
  )
}
