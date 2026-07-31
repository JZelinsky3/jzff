// The league picker for one game, on a phone.
//
// Same content as GameLobby, laid out as a list instead of a rail of cards.
// Choosing a league is a list decision — the labels are what's being read,
// not the blurbs — and eight stacked cards is eight screens of scrolling for
// a choice that fits on one.

import Link from 'next/link'
import { MobilePageShell } from '@/components/mobile/MobilePageShell'
import { loadPoolsForViewer } from './pools'
import { CombinePools } from './CombinePools'
import { ownLeagueHref } from './OwnLeagueCta'
import { Chevron } from './MobileGames'
import { MAX_COMBINED_LEAGUES } from '@/lib/minigames/deal'
import type { GameDef } from './gameDefs'
import styles from './mobile.module.css'

export async function MobileGameLobby({ game }: { game: GameDef }) {
  const { signedIn, leaguePools } = await loadPoolsForViewer()
  const poolHref = (id: string) => `${game.href}?pool=${encodeURIComponent(id)}`

  return (
    <MobilePageShell
      backHref="/games/"
      barTitle={game.title}
      barTitleEm={game.titleEm}
      signedIn={signedIn}
      kicker="The Games Page"
      heroTitle={game.title}
      heroTitleEm={game.titleEm}
      bodyClassName={styles.body}
    >
      <div className={styles.root}>
        {/* The rules, before anything is chosen. On a phone the blurb runs
            first and the three beats follow it, because the beats are what
            someone actually skims. */}
        <div className={styles.brief}>
          <p className={styles.briefBlurb}>{game.blurb}</p>
          <ol className={styles.steps}>
            {game.how.map((step, i) => (
              <li key={step} className={styles.step}>
                <span className={styles.stepNum}>{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.sec}>
          <span className={styles.secNum}>§ 01</span>
          <span className={styles.secTitle}>Open to everyone</span>
          <span className={styles.secMeta}>No account</span>
        </div>

        <div className={styles.pools}>
          {game.allowsSite && (
            <Link href={poolHref('site')} className={styles.pool}>
              <span className={styles.poolMain}>
                <span className={styles.poolTag}>Everyone</span>
                <span className={styles.poolLabel}>The whole site</span>
                <span className={styles.poolNote}>
                  Teams from leagues you have never heard of.
                </span>
              </span>
              <span className={styles.chev}>
                <Chevron />
              </span>
            </Link>
          )}

          <Link href={poolHref('demo')} className={styles.pool}>
            <span className={styles.poolMain}>
              <span className={styles.poolTag}>Demo</span>
              <span className={styles.poolLabel}>The Lakeside League</span>
              <span className={styles.poolNote}>Seven seasons of one league. No account.</span>
            </span>
            <span className={styles.chev}>
              <Chevron />
            </span>
          </Link>
        </div>

        <div className={styles.sec}>
          <span className={styles.secNum}>§ 02</span>
          <span className={styles.secTitle}>Your leagues</span>
          <span className={styles.secMeta}>
            {signedIn ? `${leaguePools.length} available` : 'Free to add'}
          </span>
        </div>

        {!signedIn ? (
          <div className={styles.empty}>
            <Link href={ownLeagueHref(false)}>Connect your league</Link> and its whole
            history becomes its own board, played on people you know. Syncing is free.
          </div>
        ) : leaguePools.length === 0 ? (
          <div className={styles.empty}>
            Nothing on your shelf yet.{' '}
            <Link href={ownLeagueHref(true)}>Add your league</Link> and its history
            becomes something you can play.
          </div>
        ) : (
          <>
            <div className={styles.pools}>
              {leaguePools.map((p) => (
                <Link key={p.id} href={poolHref(p.id)} className={styles.pool}>
                  <span className={styles.poolMain}>
                    <span className={styles.poolTag}>Your league</span>
                    <span className={styles.poolLabel}>{p.label}</span>
                    <span className={styles.poolNote}>{p.note}</span>
                  </span>
                  <span className={styles.chev}>
                    <Chevron />
                  </span>
                </Link>
              ))}
            </div>

            {game.allowsCombine && leaguePools.length > 1 && (
              <div className={styles.inset}>
                <CombinePools pools={leaguePools} max={MAX_COMBINED_LEAGUES} base={game.href} />
              </div>
            )}
          </>
        )}

        <div className={styles.tail} />
      </div>
    </MobilePageShell>
  )
}
