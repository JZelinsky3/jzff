// The league picker for one game.
//
// Second step of the two-step: /games chose the game, this chooses whose
// history to play it on. Shared by both games so the shape of the choice is
// identical wherever you came from, with the differences (site-wide pool,
// combined wheels) declared on the GameDef rather than branched on by name.

import Link from 'next/link'
import { loadPoolsForViewer } from './pools'
import { CombinePools } from './CombinePools'
import { LeagueDeck, HouseDeck, type HousePool } from './LeagueDeck'
import { ownLeagueHref } from './OwnLeagueCta'
import { MAX_COMBINED_LEAGUES } from '@/lib/minigames/deal'
import type { GameDef } from './gameDefs'
import styles from './games.module.css'

export async function GameLobby({ game }: { game: GameDef }) {
  const { signedIn, leaguePools } = await loadPoolsForViewer()
  const poolHref = (id: string) => `${game.href}?pool=${encodeURIComponent(id)}`

  // A game with neither a site pool nor a demo has nothing to put under
  // "Open to everyone", and an empty section under that heading reads as a
  // page that failed to load rather than as a game with an entry fee.
  const openToEveryone = game.allowsSite || game.allowsDemo

  // The house's own cards, in the same shape as a league's. Their stat line
  // is the thing that makes them worth taking: how much history is behind
  // each, which is the only comparison that matters before you play.
  const housePools: HousePool[] = []
  if (game.allowsSite) {
    housePools.push({
      id: 'site',
      label: 'The Whole Site',
      monogram: 'TSC',
      note: 'Every published almanac',
      statTop: 'All',
      statBottom: 'leagues on the site',
    })
  }
  if (game.allowsDemo) {
    housePools.push({
      id: 'demo',
      label: 'The Lakeside League',
      monogram: 'LL',
      note: 'Demo · no account needed',
      statTop: '7',
      statBottom: 'seasons · 2019–2025',
    })
  }

  return (
    <>
      {/* How it's played, before anything is chosen. On the old page this
          lived nowhere: the rail went straight to pools and you learned the
          rules by pressing things. */}
      <div className={styles.brief}>
        <p className={styles.briefBlurb}>{game.blurb}</p>
        <ol className={styles.briefHow}>
          {game.how.map((step, i) => (
            <li key={step} className={styles.briefStep}>
              <span className={styles.briefNum}>{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {openToEveryone && (
        <>
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>§ 01</span>
            <span className={styles.sectionTitle}>Open to everyone</span>
            <span className={styles.sectionMeta}>No account needed</span>
          </div>

          <HouseDeck pools={housePools} href={poolHref} />
        </>
      )}

      <div className={styles.sectionHead}>
        <span className={styles.sectionNum}>{openToEveryone ? '§ 02' : '§ 01'}</span>
        <span className={styles.sectionTitle}>Your leagues</span>
        <span className={styles.sectionMeta}>
          {signedIn ? `${leaguePools.length} available` : 'Free to add'}
        </span>
      </div>

      {/* "Sign in" was the wrong verb here. Most people reading this arrived
          from a link and have never had an account, so an invitation to sign
          in reads as a wall in front of the game rather than an offer — and
          it drops them on the password tab of a form they can't use yet. */}
      {!signedIn ? (
        <div className={styles.empty}>
          <Link href={ownLeagueHref(false)}>Connect your league</Link> and its whole
          history becomes its own board, played on people you actually know
          instead of strangers. Syncing is free.
        </div>
      ) : leaguePools.length === 0 ? (
        <div className={styles.empty}>
          No leagues on your shelf yet.{' '}
          <Link href={ownLeagueHref(true)}>Add your league</Link> and its whole
          history becomes something you can play.
        </div>
      ) : (
        <>
          <LeagueDeck pools={leaguePools} href={poolHref} />

          {/* Needs two leagues to mean anything, so it stays out of the way
              of anyone who only has one, and only for games where mixing
              leagues is coherent at all. */}
          {game.allowsCombine && leaguePools.length > 1 && (
            <CombinePools pools={leaguePools} max={MAX_COMBINED_LEAGUES} base={game.href} />
          )}
        </>
      )}
    </>
  )
}
