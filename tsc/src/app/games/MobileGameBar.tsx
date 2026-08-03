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

/** The masthead, folded to a glyph. Used where the left button goes Home —
    an arrow pointing back at the front page is a weaker signal than the
    front page itself. */
export function HomeIcon() {
  return (
    <Ico>
      <path d="M3.5 6.5h17v13h-17z" />
      <path d="M3.5 10h17" />
      <path d="M7 13.2h5" />
      <path d="M7 16.2h5" />
      <path d="M14.8 13.2h5.7" />
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
  kicker,
  title,
  titleEm,
  signedIn,
}: {
  /** Home on the shelf itself, back to the shelf everywhere else. */
  left: 'home' | 'back'
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
        href={signedIn ? '/dashboard' : '/login'}
        className={s.barIco}
        aria-label={signedIn ? 'Your library' : 'Sign in'}
      >
        {signedIn ? (
          <LibraryIcon />
        ) : (
          <Ico>
            <path d="M10 4.5H5.5v15H10" />
            <path d="M14 8l4 4-4 4" />
            <path d="M18 12H9" />
          </Ico>
        )}
      </Link>
    </header>
  )
}
