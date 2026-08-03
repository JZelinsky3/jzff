// The league picker for one game, on a phone.
//
// The game's own pitch is already spent by the time anyone reaches this
// screen — they tapped the card that made it — so what survives here is the
// three beats of how it's played, and then the deck.
//
// The leagues were a Clubhouse door list until 2026-08-02. They're the shared
// ./LeagueDeck now, same component as the desktop lobby: on a page whose whole
// job is games, a list of rows read like a settings screen, and every game
// here DEALS from a league. Two-up at 390px, which the card is sized for.

import Link from 'next/link'
import { loadPoolsForViewer } from './pools'
import { CombinePools } from './CombinePools'
import { LeagueDeck, HouseDeck, type HousePool } from './LeagueDeck'
import { ownLeagueHref } from './OwnLeagueCta'
import { MobileGameBar } from './MobileGameBar'
import { MobileGamesDock } from './MobileGamesDock'
import { MobileGamesFoot } from './MobileGamesFoot'
import { MAX_COMBINED_LEAGUES } from '@/lib/minigames/deal'
import type { GameDef } from './gameDefs'
import s from './mobile.module.css'

export async function MobileGameLobby({ game }: { game: GameDef }) {
  const { signedIn, leaguePools } = await loadPoolsForViewer()
  const poolHref = (id: string) => `${game.href}?pool=${encodeURIComponent(id)}`
  // Same reasoning as the desktop lobby: the board is readable without
  // dealing a wheel first. See GameLobby.
  const boardHref = game.hasBoard
    ? (id: string) => `${game.href}board/?pool=${encodeURIComponent(id)}`
    : undefined

  // See the note in GameLobby: a game with neither pool has nothing to list
  // here, and the empty section reads as a broken page.
  const openToEveryone = game.allowsSite || game.allowsDemo

  // Same house cards as the desktop lobby. The deck is one component in both
  // trees — the card is legible at half a 390px screen because the plate does
  // the identifying, so there was no reason to design a second one.
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
      note: 'Demo · no account',
      statTop: '7',
      statBottom: 'seasons · 2019–2025',
    })
  }

  return (
    <main className={s.root} style={{ '--accent': game.accent } as React.CSSProperties}>
      <MobileGameBar
        left="back"
        kicker="The Games Page"
        title={game.title}
        titleEm={game.titleEm}
        signedIn={signedIn}
      />

      <section className={s.hero}>
        {/* What this screen is FOR. It used to echo the access chip from the
            card that got you here, which §01 says again two inches lower. */}
        <div className={s.heroSup}>★ Pick a league ★</div>
        <h1 className={s.heroTitle}>
          {game.title} <em>{game.titleEm}</em>
        </h1>
        <ol className={s.steps} style={{ marginTop: '0.9rem' }}>
          {game.how.map((step, i) => (
            <li key={step} className={s.step}>
              <span className={s.stepNum}>{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {openToEveryone && (
        <section className={s.sec}>
          <div className={s.secHead}>
            <div>
              <span className={s.secNum}>§ 01 · Open to everyone</span>
              <span className={s.secTitle}>Play it now</span>
            </div>
            <span className={s.secSide}>No account</span>
          </div>

          <HouseDeck pools={housePools} href={poolHref} boardHref={boardHref} />
        </section>
      )}

      <section className={s.sec}>
        <div className={s.secHead}>
          <div>
            <span className={s.secNum}>{openToEveryone ? '§ 02' : '§ 01'} · Your shelf</span>
            <span className={s.secTitle}>People you know</span>
          </div>
          <span className={s.secSide}>
            {signedIn ? `${leaguePools.length} ready` : 'Free to add'}
          </span>
        </div>

        {!signedIn ? (
          <div className={s.empty}>
            <Link href={ownLeagueHref(false)}>Connect your league</Link> and its whole
            history becomes its own board. Syncing is free.
          </div>
        ) : leaguePools.length === 0 ? (
          <div className={s.empty}>
            Nothing on your shelf yet.{' '}
            <Link href={ownLeagueHref(true)}>Add your league</Link> and its history
            becomes something you can play.
          </div>
        ) : (
          <>
            <LeagueDeck pools={leaguePools} href={poolHref} boardHref={boardHref} />

            {game.allowsCombine && leaguePools.length > 1 && (
              <CombinePools pools={leaguePools} max={MAX_COMBINED_LEAGUES} base={game.href} />
            )}
          </>
        )}
      </section>

      <MobileGamesFoot signedIn={signedIn} />
      <MobileGamesDock />
    </main>
  )
}
