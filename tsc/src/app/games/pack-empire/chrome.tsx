// The masthead every Pack Empire page wears.
//
// Desktop gets the site's own nav (BackButton, kicker over title, Library or
// Login on the right), re-coloured for this room by pack-empire.css. Phones
// get the games section's bar, the Pocket Clubhouse shape: square buttons,
// equal side columns, back on the left and the reader on the right.
//
// Back always goes UP one level, never to wherever the browser was: a mode
// goes back to Pack Empire, Pack Empire goes back to the Games Page.

import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { MobileGameBar } from '../MobileGameBar'

export function PeChrome({
  mobile,
  signedIn,
  back,
  backLabel,
  kicker,
  title,
  titleEm,
  home = false,
}: {
  mobile: boolean
  signedIn: boolean
  back: string
  backLabel: string
  kicker: string
  title: string
  titleEm?: string
  /** The Pack Empire front page itself, which links out to the whole shelf. */
  home?: boolean
}) {
  if (mobile) {
    return (
      <MobileGameBar
        left="back"
        backHref={back}
        backLabel={backLabel}
        kicker={kicker}
        title={title}
        titleEm={titleEm}
        signedIn={signedIn}
      />
    )
  }

  return (
    <nav className="nav">
      <BackButton fallbackHref={back} ariaLabel={backLabel} />
      <div className="nav-center">
        <div className="nav-kicker">{kicker}</div>
        <div className="nav-title">
          {title}
          {titleEm ? (
            <>
              {' '}
              <em>{titleEm}</em>
            </>
          ) : null}
        </div>
      </div>
      <div className="pricing-nav-right">
        <Link href={home ? '/games/' : '/games/pack-empire/'} className="pricing-nav-link">
          <span className="pricing-nav-link-text">{home ? 'All games' : 'Pack Empire'}</span>
        </Link>
        <Link href={signedIn ? '/dashboard' : '/login'} className="pricing-nav-cta">
          {signedIn ? 'Library' : 'Login'}
        </Link>
      </div>
    </nav>
  )
}
