// The board's two navigations.
//
// They used to be two stacked rows of identical mono pills — which game
// above, which ranking below, same size, same border, same radius. Two
// controls that look the same read as one control someone split in half.
//
// They are different questions, so they are different objects now:
//
//   GameRail  — a rail you browse. One entry per game, each with its own
//               mark and its own colour, scrolling sideways on a phone.
//               Present on every board, including the per-game ones under
//               /games/<id>/board/, where it carries the pool along so
//               switching game keeps the league you were reading.
//   KindSeg   — a switch you flip. Two positions in one connected pill.
//
// The marks are the same 24-box glyphs the phone's tab bar draws, kept here
// rather than imported because that file is a client component and this one
// has no reason to be.

import Link from 'next/link'
import { GAMES, type GameDef } from './gameDefs'
import styles from './board.module.css'

const MARKS: Record<string, React.ReactNode> = {
  roulette: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 3.5v4" />
      <path d="M12 16.5v4" />
      <path d="M3.5 12h4" />
      <path d="M16.5 12h4" />
    </>
  ),
  'guess-the-draft': (
    <>
      <path d="M4.5 4.5h15v15h-15z" />
      <path d="M7.5 9.5h9" />
      <path d="M7.5 14.5h5" />
    </>
  ),
  gauntlet: (
    <>
      <path d="M3.5 6.5h5.5v11H3.5" />
      <path d="M9 12h4.5" />
      <path d="M13.5 8.5h7v7h-7z" />
    </>
  ),
  'over-under': (
    <>
      <path d="M3.5 12h17" />
      <path d="M8.6 8.6 12 5.2l3.4 3.4" />
      <path d="M8.6 15.4 12 18.8l3.4-3.4" />
    </>
  ),
  redraft: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.2 4.4v4.2H16" />
      <path d="M12 7.6V12l3 1.8" />
    </>
  ),
  multiverse: (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M4.5 12h15" />
      <path d="M4.5 17.5h15" />
      <circle cx="8.4" cy="6.5" r="1.7" />
      <circle cx="15.2" cy="12" r="1.7" />
      <circle cx="10.6" cy="17.5" r="1.7" />
    </>
  ),
}

export function GameRail({
  activeId,
  href,
  games = GAMES.filter((g) => g.hasBoard),
}: {
  activeId: string
  /** Where a given game's board lives from here. The caller owns the shape
      of that URL, because it differs by tree: the league wing keeps the
      pool in the path, the public boards keep it in a query. */
  href: (g: GameDef) => string
  /** Defaults to the games that keep a board. A game with no run verifier
      would rail onto a page that lists nothing forever. */
  games?: GameDef[]
}) {
  if (games.length < 2) return null
  return (
    <nav className={styles.rail} aria-label="Game">
      {games.map((g) => {
        const on = g.id === activeId
        return (
          <Link
            key={g.id}
            href={href(g)}
            className={`${styles.railItem} ${on ? styles.railOn : ''}`}
            style={{ '--accent': g.accent } as React.CSSProperties}
            aria-current={on ? 'page' : undefined}
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {MARKS[g.id] ?? MARKS.roulette}
            </svg>
            {g.shortName}
          </Link>
        )
      })}
    </nav>
  )
}

export function KindSeg<K extends string>({
  kinds,
  active,
  href,
}: {
  kinds: { kind: K; label: string }[]
  active: K
  href: (k: K) => string
}) {
  return (
    <div className={styles.segWrap}>
      <nav className={styles.seg} aria-label="Ranking">
        {kinds.map((t) => (
          <Link
            key={t.kind}
            href={href(t.kind)}
            className={`${styles.segItem} ${t.kind === active ? styles.segOn : ''}`}
            aria-current={t.kind === active ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
