import Link from 'next/link'
import { GAMES, ROSTER_ROULETTE, GUESS_THE_DRAFT } from './gameDefs'
import type { GameDef } from './gameDefs'
import { MobileGameBar, Chevron } from './MobileGameBar'
import { MobileGamesDock } from './MobileGamesDock'
import { MobileGamesFoot } from './MobileGamesFoot'
import s from './mobile.module.css'

// The Games Page on a phone.
//
// The first pass at this was the shared content shell (/about, /guides)
// with the desktop copy poured into it, and it read as two identical
// paragraphs stacked in two identical boxes. Two things fix that, and both
// are about a phone showing both games at once with no hover and no rail:
//
//  · Each card DRAWS its game — Roulette gets the spin window, Guess the
//    Draft gets a redacted pick list — so they're told apart before a word
//    is read.
//  · The copy is one line each (GameDef.pocket), and the footer is a
//    two-word chip. The desktop card's three-clause pitch and its sentence
//    of access terms filled the bottom of the card between the reader and
//    the thing they were trying to tap.

/** The spin window as it actually looks on the board: two brass rules with
    a landed team between them. An earlier version stacked clipped "ghost"
    rows above and below to suggest the drum turning; at this size they read
    as text cut in half rather than as motion. */
function WheelMark() {
  return (
    <span className={s.mark}>
      <span className={s.markWheel}>
        <span className={s.markWheelYear}>TSC.</span>
        <span className={s.markWheelName}>Can you go 17-0?</span>
      </span>
    </span>
  )
}

/** Three picks with the names inked out, which is the whole game. */
function RedactedMark() {
  const rows: [string, string, string][] = [
    ['R1', '78%', 'RB'],
    ['R2', '92%', 'WR'],
    ['R3', '64%', 'QB'],
  ]
  return (
    <span className={s.mark}>
      <span className={s.markPicks}>
        {rows.map(([rd, width, pos]) => (
          <span key={rd} className={s.markPick}>
            <span className={s.markPickRd}>{rd}</span>
            <span className={s.markPickBar} style={{ width }} />
            <span className={s.markPickPos}>{pos}</span>
          </span>
        ))}
      </span>
    </span>
  )
}

function Mark({ id }: { id: string }) {
  if (id === ROSTER_ROULETTE.id) return <WheelMark />
  if (id === GUESS_THE_DRAFT.id) return <RedactedMark />
  return null
}

export function MobileGames({
  signedIn,
  comingSoon,
}: {
  signedIn: boolean
  comingSoon: { title: string; body: string }[]
}) {
  return (
    <main className={s.root}>
      <MobileGameBar left="home" kicker="The back page" title="The" titleEm="Games Page" signedIn={signedIn} />

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
              <Mark id={g.id} />
              <span className={s.gameBody}>
                <span className={s.gameTitle}>
                  {g.title} <em>{g.titleEm}</em>
                </span>
                <span className={s.gameLine}>{g.pocket}</span>
                <span className={s.gameFoot}>
                  <span className={s.chip}>{g.pocketAccess}</span>
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
