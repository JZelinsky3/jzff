import Link from 'next/link'
import s from './mobile.module.css'

// Chrome for the mobile games tree, shaped like the Pocket Clubhouse's
// (src/styles/hub-mobile.css): a compact sticky bar with square icon
// buttons, and a fixed dock at the thumb in place of the hamburger sheet.
//
// Deliberately NOT the .mpg-bar shell that /about and /guides wear. Two
// things about it were wrong here: its back button is a disc, which nothing
// else in the mobile trees is, and its side columns are 36px against a 32px
// spacer, which pushes the title four pixels off centre on every page.

function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
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

/** Home, and it has to look like home.
 *
 * This was the masthead folded to a glyph — a ruled rectangle with a
 * headline block — on the theory that the front page identifies itself
 * better than an arrow does. At 17px that theory doesn't survive: a bordered
 * rectangle with lines in it reads as a CARD, which is what half this
 * section's UI already is, so the one button on the bar that leaves the
 * section looked like a tile that had lost its label. A house is a house. */
export function HomeIcon() {
  return (
    <Ico>
      <path d="M3.6 10.4 12 4l8.4 6.4" />
      <path d="M5.6 12v7.6h12.8V12" />
      <path d="M9.9 19.6v-5h4.2v5" />
    </Ico>
  )
}

/** The reader, not their shelf. Sits opposite the back button on a game,
    where "Library" was pointing at the leagues screen — a different section
    entirely, offered at the exact moment somebody is mid-run. */
export function ProfileIcon() {
  return (
    <Ico>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M5 20c.6-3.6 3.4-5.4 7-5.4s6.4 1.8 7 5.4" />
    </Ico>
  )
}

/** A bookshelf, same glyph the Clubhouse bar uses for the library. */
export function LibraryIcon() {
  return (
    <Ico>
      <path d="M4 4.5h3.4v15H4z" />
      <path d="M8.6 7h3.4v12.5H8.6z" />
      <path d="M13.7 6.2l3.3-1 4.1 13.9-3.3 1z" />
      <path d="M3 19.5h18.5" />
    </Ico>
  )
}

export function BackIcon() {
  return (
    <svg
      viewBox="0 0 8 14"
      width="9"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="7 1 1 7 7 13" />
    </svg>
  )
}

export function Chevron() {
  return (
    <svg
      viewBox="0 0 8 14"
      width="8"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="1 1 7 7 1 13" />
    </svg>
  )
}

export function MobileGameBar({
  left,
  right = 'profile',
  kicker,
  title,
  titleEm,
  signedIn,
}: {
  /** Home on the shelf itself, back to the shelf everywhere else. */
  left: 'home' | 'back'
  /**
   * The shelf offers the Library, a game offers the reader themselves.
   *
   * Every page in this tree used to put Library up there, which on a board
   * meant the one persistent button beside a live run pointed at the leagues
   * screen — a different section, and a run this tree cannot get you back to.
   * The Games Page is the one place where "the rest of the site" is the right
   * offer, so it is the only place that makes it. Defaulted, so a new game
   * page gets the quiet version without having to know about this.
   */
  right?: 'library' | 'profile'
  kicker: string
  title: string
  titleEm?: string
  signedIn: boolean
}) {
  return (
    // Tagged because it is the sticky masthead on a phone, and the games that
    // park a collapsed title under it have to measure its height. The desktop
    // `nav.nav` isn't on the page here, so without this hook they measured
    // nothing and scrolled the title behind the bar.
    <header className={s.bar} data-game-bar>
      {left === 'home' ? (
        <Link href="/" className={s.barIco} aria-label="The Sunday Chronicle">
          <HomeIcon />
        </Link>
      ) : (
        <Link href="/games/" className={s.barIco} aria-label="All games">
          <BackIcon />
        </Link>
      )}
      <div className={s.barCenter}>
        <div className={s.barKicker}>{kicker}</div>
        <div className={s.barTitle}>
          {title}
          {titleEm ? (
            <>
              {' '}
              <em>{titleEm}</em>
            </>
          ) : null}
        </div>
      </div>
      <Link
        href={!signedIn ? '/login' : right === 'library' ? '/dashboard' : '/account'}
        className={s.barIco}
        aria-label={!signedIn ? 'Sign in' : right === 'library' ? 'Your library' : 'Your account'}
      >
        {!signedIn ? (
          <Ico>
            <path d="M10 4.5H5.5v15H10" />
            <path d="M14 8l4 4-4 4" />
            <path d="M18 12H9" />
          </Ico>
        ) : right === 'library' ? (
          <LibraryIcon />
        ) : (
          <ProfileIcon />
        )}
      </Link>
    </header>
  )
}
