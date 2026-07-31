// The league picker for one game.
//
// Second step of the two-step: /games chose the game, this chooses whose
// history to play it on. Shared by both games so the shape of the choice is
// identical wherever you came from, with the differences (site-wide pool,
// combined wheels) declared on the GameDef rather than branched on by name.

import Link from 'next/link'
import { loadPoolsForViewer } from './pools'
import { CombinePools } from './CombinePools'
import { ownLeagueHref } from './OwnLeagueCta'
import { MAX_COMBINED_LEAGUES } from '@/lib/minigames/deal'
import type { GameDef } from './gameDefs'
import styles from './games.module.css'

export async function GameLobby({ game }: { game: GameDef }) {
  const { signedIn, leaguePools } = await loadPoolsForViewer()
  const poolHref = (id: string) => `${game.href}?pool=${encodeURIComponent(id)}`

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

      <div className={styles.sectionHead}>
        <span className={styles.sectionNum}>§ 01</span>
        <span className={styles.sectionTitle}>Open to everyone</span>
        <span className={styles.sectionMeta}>No account needed</span>
      </div>

      <div className={styles.rail}>
        {game.allowsSite && (
          <Link href={poolHref('site')} className={styles.card}>
            <span className={styles.cardTag}>Everyone</span>
            <span className={styles.cardTitle}>The whole site</span>
            <span className={styles.cardBody}>
              Deals from every published almanac here, so the teams come from
              leagues you have never heard of.
            </span>
            <span className={styles.cardFoot}>Play now</span>
          </Link>
        )}

        {/* One league's whole history, for anyone without one of their own.
            For Roulette the site wheel deals a different league every spin,
            so it never shows what playing YOUR league is like; for Guess the Draft
            there is no site pool at all and this is the only way in. */}
        <Link href={poolHref('demo')} className={styles.card}>
          <span className={styles.cardTag}>Demo</span>
          <span className={styles.cardTitle}>The Lakeside League</span>
          <span className={styles.cardBody}>{game.demoBody}</span>
          <span className={styles.cardFoot}>Try it without an account</span>
        </Link>
      </div>

      <div className={styles.sectionHead}>
        <span className={styles.sectionNum}>§ 02</span>
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
          <div className={styles.rail}>
            {leaguePools.map((p) => (
              <Link key={p.id} href={poolHref(p.id)} className={styles.card}>
                <span className={styles.cardTag}>Your league</span>
                <span className={styles.cardTitle}>{p.label}</span>
                <span className={styles.cardBody}>{game.leagueBody}</span>
                <span className={styles.cardFoot}>{p.note}</span>
              </Link>
            ))}
          </div>

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
