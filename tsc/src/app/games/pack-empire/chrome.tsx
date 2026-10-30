// The masthead every Pack Empire page wears.
//
// Desktop gets the game's own bar rather than the site's: the wordmark on the
// left, the four modes across the middle as tabs in their own colours (the
// one you're in lit), and the binder and friends as tools on the right.
// Joey: the site nav's row of words (ALL GAMES, BINDER, FRIENDS) is right for
// the almanac and flat for a game. It keeps the `nav` class, so it stays
// sticky and everything that measures the masthead (the score strip) still
// finds it.
//
// Phones get the games section's bar, the Pocket Clubhouse shape: square
// buttons, equal side columns, back on the left and the reader on the right.
//
// Back always goes UP one level, never to wherever the browser was: a mode
// goes back to Pack Empire, Pack Empire goes back to the Games Page.

import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { MobileGameBar } from '../MobileGameBar'
import { MobileGamesDock } from '../MobileGamesDock'
import { FriendsMenu } from './FriendsMenu'
import { MODES, ModeGlyph, type ModeDef } from './modes'

export type PeSection = ModeDef['id'] | 'home' | 'binder'

function BinderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="3.5" width="14" height="17" rx="1.6" />
      <path d="M9 3.5v17" />
      <path d="M3.5 7.5H6.5M3.5 12H6.5M3.5 16.5H6.5" />
      <rect x="11.5" y="7.5" width="4.5" height="6" rx="0.6" />
    </svg>
  )
}

function FriendsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.2 19.5c.6-3.3 3-5.2 5.8-5.2s5.2 1.9 5.8 5.2" />
      <circle cx="16.6" cy="9.4" r="2.5" />
      <path d="M15.6 14.4c2.6-.3 4.7 1.4 5.2 4.3" />
    </svg>
  )
}

/** The phone's tabs, on every Pack Empire page that isn't a table. */
export function PeDock({ signedIn }: { signedIn: boolean }) {
  return <MobileGamesDock empire signedIn={signedIn} boardHref="/games/pack-empire/board/" />
}

export function PeChrome({
  mobile,
  signedIn,
  back,
  backLabel,
  kicker,
  title,
  titleEm,
  active,
  home = false,
}: {
  mobile: boolean
  signedIn: boolean
  back: string
  backLabel: string
  kicker: string
  title: string
  titleEm?: string
  /** The tab to light on desktop: a mode, the binder, or the front page. */
  active?: PeSection
  /** The Pack Empire front page itself, whose back goes to the whole shelf. */
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

  const on = active ?? (home ? 'home' : undefined)

  return (
    <nav className="nav pe-nav" aria-label="Pack Empire">
      <div className="pe-nav-left">
        <BackButton fallbackHref={back} ariaLabel={backLabel} />
        <Link href="/games/pack-empire/" className={`pe-nav-mark${on === 'home' ? ' on' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/games/pack-empire/packs/qb.webp" alt="" className="pe-nav-mark-pack" />
          <span className="pe-nav-mark-word">
            <span className="pe-nav-mark-kicker">{home ? 'The Games Page' : 'Pack Empire'}</span>
            <span className="pe-nav-mark-name">
              Pack <em>Empire</em>
            </span>
          </span>
        </Link>
      </div>

      <div className="pe-nav-modes">
        {MODES.map((m) => (
          <Link
            key={m.id}
            href={m.href}
            className={`pe-nav-mode${on === m.id ? ' on' : ''}`}
            style={{ '--mode': m.color } as React.CSSProperties}
            aria-current={on === m.id ? 'page' : undefined}
          >
            <ModeGlyph id={m.id} />
            <span>{m.id === 'solo' ? m.nameEm : m.id === 'mega' ? `${m.name} ${m.nameEm}` : m.name}</span>
          </Link>
        ))}
      </div>

      <div className="pe-nav-right">
        {signedIn && (
          <Link
            href="/games/pack-empire/binder/"
            className={`pe-nav-tool${on === 'binder' ? ' on' : ''}`}
            aria-current={on === 'binder' ? 'page' : undefined}
          >
            <BinderIcon />
            <span>Binder</span>
          </Link>
        )}
        {signedIn && (
          <FriendsMenu>
            <FriendsIcon />
            <span>Friends</span>
          </FriendsMenu>
        )}
        <Link href={signedIn ? '/dashboard' : '/login'} className="pe-nav-cta">
          {signedIn ? 'Library' : 'Login'}
        </Link>
      </div>
    </nav>
  )
}
