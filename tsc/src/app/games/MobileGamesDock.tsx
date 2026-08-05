'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { GAMES } from './gameDefs'
import s from './mobile.module.css'

// The section's nav at the thumb, in the almanac's grammar.
//
// This was seven slots — the shelf plus one per shipped game — sized so that
// GameDef.shortName got about six characters each at 390px, with a comment
// admitting seven was the ceiling. It was the ceiling: a sixth game shipped,
// the labels stopped being the words anyone uses for the games, and the tree
// still carried a MobileGamesFoot repeating four of the same links directly
// above it.
//
// The almanac solved this years earlier and the fix is to copy it. Its bar
// (mobile-app.js, buildShell) never lists more than five destinations and
// never lists a CHAPTER'S CONTENTS at all — History, Week and Desks are
// buttons that open a sheet. So:
//
//   Shelf · Games · [Board] · More
//
// Games opens the six with their marks and taglines, which is more than the
// dock ever showed and takes one more tap to reach. Board only appears where
// a pool is known — inside a league, where it means that league's board —
// because a leaderboard tab that can't name its pool has nowhere to go. More
// absorbs the old MobileGamesFoot.
//
// NOT rendered on a board. Every board owns the bottom of the screen already
// (Roulette's lineup HUD, Guess the Draft's answer bar, the Multiverse
// Draft's card tray), and a dock under any of them is a second fixed bar
// arguing with the first over the same thumb.

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

const SHELF_ICON = (
  <>
    <path d="M3.5 4.5h7v7h-7z" />
    <path d="M13.5 4.5h7v7h-7z" />
    <path d="M3.5 13.5h7v7h-7z" />
    <path d="M13.5 13.5h7v7h-7z" />
  </>
)

const ALMANAC_ICON = (
  <>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
  </>
)

const GAMES_ICON = (
  <>
    <rect x="2.5" y="7" width="19" height="10" rx="3" />
    <path d="M7 10.5v3" />
    <path d="M5.5 12h3" />
    <circle cx="16" cy="11" r="1" />
    <circle cx="18.4" cy="13.4" r="1" />
  </>
)

const BOARD_ICON = (
  <>
    <path d="M9 4.5h6v15H9z" />
    <path d="M3.5 10h5.5v9.5H3.5z" />
    <path d="M15 8h5.5v11.5H15z" />
  </>
)

const MORE_ICON = (
  <>
    <circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none" />
  </>
)

function Glyph({ children, size = 19 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

/** Native <dialog>, same as the almanac's sheets: the top layer means it is
    never trapped under the sticky bar or a board's own stacking context,
    which is the trap documented in the pams .section z-index note. */
function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={s.sheet}
      onClose={onClose}
      onClick={(e) => {
        // Clicking the backdrop lands on the dialog itself, never on a child.
        if (e.target === ref.current) onClose()
      }}
    >
      <div className={s.sheetHandle} aria-hidden />
      <div className={s.sheetTitle}>{title}</div>
      {children}
    </dialog>
  )
}

export type GamesDockProps = {
  /** Where this tree's game routes hang off: '/games/' on the public shelf,
      '/leagues/<slug>/games/' inside a league. Every href below is built
      from it, so one component serves both trees. */
  base?: string
  /** Left tab. Inside a league it goes back to the almanac hub, so the
      section never reads as somewhere you left the league to get to. */
  home?: { href: string; label: string; icon: 'shelf' | 'almanac' }
  /** Present only when the pool is already known — inside a league. */
  boardHref?: string
  signedIn?: boolean
  /** Slug of the league this tree belongs to, when it belongs to one. Adds
      the almanac's own rows to the More sheet. */
  leagueSlug?: string
  leagueName?: string
}

export function MobileGamesDock({
  base = '/games/',
  home = { href: '/games/', label: 'Shelf', icon: 'shelf' },
  boardHref,
  signedIn = false,
  leagueSlug,
  leagueName,
}: GamesDockProps) {
  const pathname = usePathname()
  const [sheet, setSheet] = useState<'games' | 'more' | null>(null)

  // Every row in a sheet closes it on the way out, so the ordinary path needs
  // nothing here. The back button is the exception: Next keeps this component
  // mounted across a client-side route change, so a sheet opened by a tap
  // would still be sitting over the page you went back to.
  useEffect(() => {
    const onPop = () => setSheet(null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // GameDef.href is absolute under /games/. Inside a league the same game
  // lives at <base><id>/, so the id is what travels, not the href.
  const hrefFor = (id: string, fallback: string) =>
    base === '/games/' ? fallback : `${base}${id}/`

  const onShelf = pathname === base.replace(/\/$/, '') || pathname === base
  const activeGame = GAMES.find((g) => {
    const h = hrefFor(g.id, g.href).replace(/\/$/, '')
    return pathname === h || pathname.startsWith(`${h}/`)
  })
  const onBoard = !!boardHref && pathname.replace(/\/$/, '') === boardHref.replace(/\/$/, '')

  const cols = boardHref ? 4 : 3

  return (
    <>
      <nav
        className={s.dock}
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        aria-label="The Games Page"
      >
        <Link
          href={home.href}
          className={`${s.dockItem} ${onShelf ? s.dockOn : ''}`}
          aria-current={onShelf ? 'page' : undefined}
        >
          <Glyph>{home.icon === 'almanac' ? ALMANAC_ICON : SHELF_ICON}</Glyph>
          {home.label}
        </Link>

        <button
          type="button"
          className={`${s.dockItem} ${activeGame ? s.dockOn : ''}`}
          style={activeGame ? ({ '--accent': activeGame.accent } as React.CSSProperties) : undefined}
          aria-haspopup="dialog"
          onClick={() => setSheet('games')}
        >
          <Glyph>{GAMES_ICON}</Glyph>
          {activeGame ? activeGame.shortName : 'Games'}
        </button>

        {boardHref && (
          <Link
            href={boardHref}
            className={`${s.dockItem} ${onBoard ? s.dockOn : ''}`}
            aria-current={onBoard ? 'page' : undefined}
          >
            <Glyph>{BOARD_ICON}</Glyph>
            Board
          </Link>
        )}

        <button
          type="button"
          className={s.dockItem}
          aria-haspopup="dialog"
          onClick={() => setSheet('more')}
        >
          <Glyph>{MORE_ICON}</Glyph>
          More
        </button>
      </nav>

      <Sheet
        open={sheet === 'games'}
        onClose={() => setSheet(null)}
        title={
          <>
            Pick a <em>game</em>
          </>
        }
      >
        <div className={s.sheetGames}>
          {GAMES.map((g) => {
            const href = hrefFor(g.id, g.href)
            const on = activeGame?.id === g.id
            return (
              <Link
                key={g.id}
                href={href}
                className={`${s.sheetGame} ${on ? s.sheetGameOn : ''}`}
                style={{ '--accent': g.accent } as React.CSSProperties}
                onClick={() => setSheet(null)}
              >
                <span className={s.sheetGameIco} aria-hidden>
                  <Glyph size={20}>{ICONS[g.id] ?? SHELF_ICON}</Glyph>
                </span>
                <span className={s.sheetGameBody}>
                  <span className={s.sheetGameName}>
                    {g.title} <em>{g.titleEm}</em>
                  </span>
                  <span className={s.sheetGameLine}>{g.tagline}</span>
                </span>
                {on && (
                  <span className={s.sheetGameHere} aria-label="You are here">
                    ★
                  </span>
                )}
              </Link>
            )
          })}
        </div>
        <Link href={home.href} className={s.sheetLink} onClick={() => setSheet(null)}>
          {base === '/games/' ? 'The whole shelf' : `Back to ${leagueName ?? 'the almanac'}`}
        </Link>
      </Sheet>

      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title="More">
        {leagueSlug && (
          <>
            <span className={s.sheetLabel}>The almanac</span>
            <Link
              href={`/leagues/${leagueSlug}/`}
              className={s.sheetRow}
              onClick={() => setSheet(null)}
            >
              {leagueName ?? 'League home'}
            </Link>
            <Link
              href={`/leagues/${leagueSlug}/standings`}
              className={s.sheetRow}
              onClick={() => setSheet(null)}
            >
              Standings
            </Link>
            <Link
              href={`/leagues/${leagueSlug}/seasons/`}
              className={s.sheetRow}
              onClick={() => setSheet(null)}
            >
              Season archives
            </Link>
            <div className={s.sheetDivider} />
          </>
        )}

        <span className={s.sheetLabel}>The Sunday Chronicle</span>
        <Link href="/" className={s.sheetRow} onClick={() => setSheet(null)}>
          Home
        </Link>
        {!leagueSlug && (
          <Link href="/games/" className={s.sheetRow} onClick={() => setSheet(null)}>
            The Games Page
          </Link>
        )}
        <Link href="/hub" className={s.sheetRow} onClick={() => setSheet(null)}>
          Clubhouse
        </Link>
        <Link
          href={signedIn ? '/dashboard' : '/login'}
          className={s.sheetRow}
          onClick={() => setSheet(null)}
        >
          {signedIn ? 'Your library' : 'Sign in'}
        </Link>

        <div className={s.sheetDivider} />
        <a
          href={`/api/view/?mode=desktop&to=${encodeURIComponent(pathname)}`}
          className={s.sheetRow}
        >
          Desktop site
        </a>
      </Sheet>
    </>
  )
}
