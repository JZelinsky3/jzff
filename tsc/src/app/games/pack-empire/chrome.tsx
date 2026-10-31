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
// buttons, equal side columns, back on the left and friends on the right. The
// friends page itself puts the profile there, so the dock doesn't need a tab
// for either.
//
// Back always goes UP one level, never to wherever the browser was: a mode
// goes back to Pack Empire, Pack Empire goes back to the Games Page.

import Link from 'next/link'
import { MobileGameBar } from '../MobileGameBar'
import { MobileGamesDock } from '../MobileGamesDock'
import { FriendsMenu } from './FriendsMenu'
import { DAILY, MODES, ModeGlyph, type ModeDef } from './modes'

export type PeSection = ModeDef['id'] | 'home' | 'binder' | 'profile'

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

/** The Home tab's house, at the mode glyphs' size. */
function HomeGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.6 10.4 12 4l8.4 6.4" />
      <path d="M5.6 12v7.6h12.8V12" />
      <path d="M9.9 19.6v-5h4.2v5" />
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
        right={active === 'profile' ? 'profile' : 'friends'}
      />
    )
  }

  const on = active ?? (home ? 'home' : undefined)

  return (
    <nav className="nav pe-nav" aria-label="Pack Empire">
      <div className="pe-nav-left">
        <Link href={back} className="dc-nav-icon" aria-label={backLabel}>
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <Link href="/games/pack-empire/" className="pe-nav-mark">
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
        <Link
          href="/games/pack-empire/"
          className={`pe-nav-mode${on === 'home' ? ' on' : ''}`}
          style={{ '--mode': 'var(--pe-ink)' } as React.CSSProperties}
          aria-current={on === 'home' ? 'page' : undefined}
        >
          <HomeGlyph />
          <span>Home</span>
        </Link>
        {[DAILY, ...MODES].map((m) => (
          <Link
            key={m.id}
            href={m.href}
            className={`pe-nav-mode${on === m.id ? ' on' : ''}`}
            style={{ '--mode': m.color } as React.CSSProperties}
            aria-current={on === m.id ? 'page' : undefined}
          >
            <ModeGlyph id={m.id} />
            <span>{m.id === 'solo' || m.id === 'daily' ? m.nameEm : m.id === 'mega' ? `${m.name} ${m.nameEm}` : m.name}</span>
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
          <FriendsMenu on={on === 'profile'}>
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
