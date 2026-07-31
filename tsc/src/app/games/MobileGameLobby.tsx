// The league picker for one game, on a phone.
//
// Whose history to play on is a LIST decision — the names are what's being
// read — so it's the Clubhouse's door list, not a rail of cards with a
// paragraph in each. The game's own pitch is already spent by the time
// anyone reaches this screen (they tapped the card that made it), so what
// survives here is the three beats of how it's played and nothing else.

import Link from 'next/link'
import { loadPoolsForViewer } from './pools'
import { CombinePools } from './CombinePools'
import { ownLeagueHref } from './OwnLeagueCta'
import { MobileGameBar, Chevron } from './MobileGameBar'
import { MobileGamesDock } from './MobileGamesDock'
import { MobileGamesFoot } from './MobileGamesFoot'
import { MAX_COMBINED_LEAGUES } from '@/lib/minigames/deal'
import type { GameDef } from './gameDefs'
import s from './mobile.module.css'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

export async function MobileGameLobby({ game }: { game: GameDef }) {
  const { signedIn, leaguePools } = await loadPoolsForViewer()
  const poolHref = (id: string) => `${game.href}?pool=${encodeURIComponent(id)}`

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

      <section className={s.sec}>
        <div className={s.secHead}>
          <div>
            <span className={s.secNum}>§ 01 · Open to everyone</span>
            <span className={s.secTitle}>Play it now</span>
          </div>
          <span className={s.secSide}>No account</span>
        </div>

        <div className={s.doors}>
          {game.allowsSite && (
            <Link href={poolHref('site')} className={s.door}>
              <span className={s.doorNum} aria-hidden>
                I
              </span>
              <span>
                <span className={s.doorName}>The whole site</span>
                <span className={s.doorDesc}>Teams from leagues you have never heard of.</span>
              </span>
              <span className={s.doorArrow}>
                <Chevron />
              </span>
            </Link>
          )}

          <Link href={poolHref('demo')} className={s.door}>
            <span className={s.doorNum} aria-hidden>
              {game.allowsSite ? 'II' : 'I'}
            </span>
            <span>
              <span className={s.doorName}>The Lakeside League</span>
              <span className={s.doorDesc}>Seven seasons of one league, under borrowed names.</span>
            </span>
            <span className={s.doorArrow}>
              <Chevron />
            </span>
          </Link>
        </div>
      </section>

      <section className={s.sec}>
        <div className={s.secHead}>
          <div>
            <span className={s.secNum}>§ 02 · Your shelf</span>
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
            <div className={s.doors}>
              {leaguePools.map((p, i) => (
                <Link key={p.id} href={poolHref(p.id)} className={s.door}>
                  <span className={s.doorNum} aria-hidden>
                    {ROMAN[i] ?? i + 1}
                  </span>
                  <span>
                    <span className={s.doorName}>{p.label}</span>
                    <span className={s.doorDesc}>{p.note}</span>
                  </span>
                  <span className={s.doorArrow}>
                    <Chevron />
                  </span>
                </Link>
              ))}
            </div>

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
