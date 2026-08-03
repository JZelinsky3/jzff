'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GAMES } from './gameDefs'
import s from './mobile.module.css'

// The section's whole map, at the thumb. Same pattern as the Clubhouse's
// six-wing dock (HubMobileDock in app/hub/hub-chrome.tsx).
//
// It was a hand-written list of three — the shelf, Roulette, Guess the Draft
// — and stayed three while four more games shipped, so the phone's only
// persistent nav quietly became a list of the two oldest games on the site.
// It is generated off GAMES now: a game is added in gameDefs.ts and it is in
// the dock, which is the only version of this that survives the next one.
//
// Seven slots is the ceiling and we are at it. The labels are GameDef.shortName
// because at 390px each slot gets ~54px, and the icons carry as much of the
// identification as the words do. The active slot takes the game's own accent
// rather than the section gold, so the dock agrees with the board above it.
//
// NOT rendered on a board. Every board owns the bottom of the screen already
// — Roulette's lineup HUD, Guess the Draft's answer bar, the Multiverse
// Draft's card tray. A dock under any of them is a second fixed bar arguing
// with the first over the same thumb.

/** Keyed off GameDef.id. Drawn at 19px, so each is three or four strokes and
    no more: at that size a detailed glyph is a smudge. Where a game has a
    card mark (see ./GameMark) this is the same idea reduced — the wheel, the
    redacted board, the bracket, the line, the clock, the three seasons. */
const ICONS: Record<string, React.ReactNode> = {
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
  // A bracket: two teams in, one out, and the run keeps going right.
  gauntlet: (
    <>
      <path d="M3.5 6.5h5.5v11H3.5" />
      <path d="M9 12h4.5" />
      <path d="M13.5 8.5h7v7h-7z" />
    </>
  ),
  // A price, with the two calls above and below it.
  'over-under': (
    <>
      <path d="M3.5 12h17" />
      <path d="M8.6 8.6 12 5.2l3.4 3.4" />
      <path d="M8.6 15.4 12 18.8l3.4-3.4" />
    </>
  ),
  // Back onto the clock: the same pick, taken again.
  redraft: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.2 4.4v4.2H16" />
      <path d="M12 7.6V12l3 1.8" />
    </>
  ),
  // Three seasons stacked, one of them lit. The card mark says the same
  // thing with numbers in it; this is that shape at 19px.
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

const SHELF = {
  href: '/games/',
  label: 'All',
  accent: '#e8c889',
  icon: (
    <>
      <path d="M3.5 4.5h7v7h-7z" />
      <path d="M13.5 4.5h7v7h-7z" />
      <path d="M3.5 13.5h7v7h-7z" />
      <path d="M13.5 13.5h7v7h-7z" />
    </>
  ),
}

const ITEMS = [
  SHELF,
  ...GAMES.map((g) => ({
    href: g.href,
    label: g.shortName,
    accent: g.accent,
    icon: ICONS[g.id] ?? SHELF.icon,
  })),
]

export function MobileGamesDock() {
  const pathname = usePathname()
  return (
    <nav className={s.dock} aria-label="The Games Page">
      {ITEMS.map((it) => {
        const base = it.href.replace(/\/$/, '')
        // The shelf matches only itself; a game matches its lobby, its board
        // and its leaderboard, which all hang off the same route.
        const active =
          base === '/games' ? pathname === '/games' || pathname === '/games/' : pathname.startsWith(base)
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`${s.dockItem} ${active ? s.dockOn : ''}`}
            style={{ '--accent': it.accent } as React.CSSProperties}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {it.icon}
            </svg>
            {it.label}
          </Link>
        )
      })}
    </nav>
  )
}
