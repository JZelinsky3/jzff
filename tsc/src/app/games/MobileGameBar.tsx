import Link from 'next/link'

// The app bar the two game BOARDS wear on a phone.
//
// The boards themselves stay responsive — one game engine, two layouts —
// but the desktop `.nav` above them never was: three columns of link
// clusters that collapse into a scaled-down row nobody can tap. This is the
// same sticky bar the rest of the mobile site uses (.mpg-bar, globals.css),
// so a board opens looking like /about or /guides rather than like a
// desktop page someone zoomed out of.
//
// No right-hand link on purpose: the global hamburger (.msm-root) is fixed
// to that exact slot on every page, and it fades out with the header while
// a game is being played. Putting a second control under it would stack two
// tap targets on the same 32 pixels.
//
// `data-game-bar` is how the Roulette board finds its own height when it
// parks the collapsed title on spin — it used to query `nav.nav`, which
// isn't on the page any more once this bar replaces it.
export function MobileGameBar({
  backHref,
  title,
  titleEm,
}: {
  backHref: string
  title: string
  titleEm?: string
}) {
  return (
    <header className="mpg-bar" data-game-bar>
      <Link href={backHref} className="mpg-bar-back" aria-label="Back">
        <svg
          viewBox="0 0 8 14"
          width="10"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="7 1 1 7 7 13" />
        </svg>
      </Link>
      <span className="mpg-bar-title">
        {title}
        {titleEm ? (
          <>
            {' '}
            <em>{titleEm}</em>
          </>
        ) : null}
      </span>
      <span className="mpg-bar-spacer" />
    </header>
  )
}
