import Link from 'next/link'
import { GAMES } from './gameDefs'
import type { GameDef } from './gameDefs'
import { MobileGameBar, Chevron } from './MobileGameBar'
import { MobileGamesDock } from './MobileGamesDock'
import { MobileGamesFoot } from './MobileGamesFoot'
import { GameMark } from './GameMark'
import s from './mobile.module.css'

// The Games Page on a phone.
//
// The first pass at this was the shared content shell (/about, /guides)
// with the desktop copy poured into it, and it read as identical paragraphs
// stacked in identical boxes. Two things fix that, and both are about a
// screen showing every game at once with no hover and no rail:
//
//  · Each card DRAWS its game, via the shared ./GameMark — so they're told
//    apart before a word is read.
//  · The copy is one line each (GameDef.tagline), and the footer is a
//    two-word chip. The pitch and the rules belong on the game's own page,
//    not stacked five times on the way to it.
//
// The desktop hub reached the same conclusion later and now shares both the
// marks and this shape. See ./page.tsx.

export function MobileGames({
  signedIn,
  comingSoon,
}: {
  signedIn: boolean
  comingSoon: { title: string; body: string }[]
}) {
  return (
    <main className={s.root}>
      {/* The one page in this tree that offers the Library: the shelf is where
          leaving for the rest of the site is a reasonable thing to want. Every
          game underneath it gets the profile button instead. */}
      <MobileGameBar
        left="home"
        right="library"
        kicker="The back page"
        title="The"
        titleEm="Games Page"
        signedIn={signedIn}
      />

      <section className={s.hero}>
        <div className={s.heroSup}>★ Est. 2026 ★</div>
        <h1 className={s.heroTitle}>
          Games, built out of <em>real seasons.</em>
        </h1>
        <p className={s.heroSub}>
          Every almanac here is a pile of teams that actually existed.
        </p>
        <div className={s.heroMeta}>
          <span>{GAMES.length} games</span>
          <span>Free to play</span>
        </div>
      </section>

      <section className={s.sec}>
        <div className={s.secHead}>
          <div>
            <span className={s.secNum}>§ 01 · On the table</span>
            <span className={s.secTitle}>Pick a game</span>
          </div>
          <span className={s.secSide}>{GAMES.length} to play</span>
        </div>

        <div className={s.games}>
          {GAMES.map((g: GameDef) => (
            <Link
              key={g.id}
              href={g.href}
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
                  <span className={s.chip}>{g.accessTag}</span>
                  <span className={s.gameGo}>
                    Play
                    <Chevron />
                  </span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className={s.sec}>
        <div className={s.secHead}>
          <div>
            <span className={s.secNum}>§ 02 · The bench</span>
            <span className={s.secTitle}>On the drawing board</span>
          </div>
          <span className={s.secSide}>Not built</span>
        </div>

        <div className={s.doors}>
          {comingSoon.map((g) => (
            <div key={g.title} className={`${s.door} ${s.doorSoon}`}>
              <span className={s.doorNum} aria-hidden>
                ✦
              </span>
              <span>
                <span className={s.doorName}>{g.title}</span>
                <span className={s.doorDesc}>{g.body}</span>
              </span>
              <span className={s.doorSoonTag}>Soon</span>
            </div>
          ))}
        </div>
      </section>

      <MobileGamesFoot signedIn={signedIn} />
      <MobileGamesDock />
    </main>
  )
}
