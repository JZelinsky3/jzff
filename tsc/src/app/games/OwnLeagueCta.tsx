// "Now play it on your own league."
//
// Shown on a game's RECAP, and only after a run on the site-wide or demo
// pool. The recap is the one moment someone has felt the game work and has a
// reason to want it pointed at people they know; before that, on the lobby,
// they have the least reason of all and the same words read as a wall.
//
// Suppressed when the run was on the player's own league, where there is
// nothing to offer and the line would just be noise between them and another
// game.
//
// Deliberately quieter than the game's own buttons. Playing again is still
// the thing the recap most wants you to do, and a loud second CTA competing
// with it would cost more runs than it gains signups.
//
// No 'use client' of its own: it holds no state, so it simply compiles into
// whichever client bundle imports it. Both game boards do.

import Link from 'next/link'
import styles from './games.module.css'

/** Where a reader goes to get their own league onto the site. */
export function ownLeagueHref(signedIn: boolean): string {
  // Signed in already: straight to the real flow, no interstitial.
  // Signed out: the signup tab rather than the sign-in tab, with the flow as
  // the destination, so a visitor who has never been here lands on the form
  // that applies to them instead of one asking for a password they don't have.
  return signedIn ? '/dashboard/new' : '/login?mode=signup&next=%2Fdashboard%2Fnew'
}

export function OwnLeagueCta({ signedIn, line }: { signedIn: boolean; line: string }) {
  return (
    <div className={styles.ownCta}>
      <span className={styles.ownCtaLine}>{line}</span>
      <Link href={ownLeagueHref(signedIn)} className={styles.ownCtaLink}>
        {signedIn ? 'Add your league' : 'Connect your league'}
      </Link>
    </div>
  )
}
