// The Locker Room's own bar. Inside Pack Empire but not of it: the modes, the board and
// the binder give way to the Locker's tabs, with Friends and the Library still on the
// right, so going through the door feels like going somewhere. A game on LOCKER_GAMES
// gets a tab here without anyone touching this file.

import Link from 'next/link'
import { MobileGameBar } from '../../MobileGameBar'
import { FriendsMenu } from '../FriendsMenu'
import { LockerDock } from './LockerDock'
import { LOCKER_TABS, LockerGlyph, type LockerTabId } from './tabs'

export { LockerDock }

/** What goes on `main` on every page in here. */
export const ROOM_CLASS = 'pe-theme pe-room'
export const ROOM_COLOR = '#0f1619'

export function LockerChrome({
  mobile,
  signedIn,
  back,
  backLabel,
  kicker,
  title,
  titleEm,
  tab,
}: {
  mobile: boolean
  signedIn: boolean
  back: string
  backLabel: string
  kicker: string
  title: string
  titleEm?: string
  tab: LockerTabId
}) {
  if (mobile) {
    return <MobileGameBar left="back" backHref={back} backLabel={backLabel} kicker={kicker} title={title} titleEm={titleEm} signedIn={signedIn} right="friends" />
  }

  return (
    <nav className="nav pe-nav pe-nav--room" aria-label="The Locker Room">
      <div className="pe-nav-left">
        <Link href={back} className="dc-nav-icon" aria-label={backLabel}>
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <Link href="/games/pack-empire/locker/" className="pe-nav-mark">
          <span className="pe-nav-mark-door" aria-hidden>
            <LockerGlyph id="home" />
          </span>
          <span className="pe-nav-mark-word">
            <span className="pe-nav-mark-kicker">Pack Empire</span>
            <span className="pe-nav-mark-name">
              The Locker <em>Room</em>
            </span>
          </span>
        </Link>
      </div>

      <div className="pe-nav-modes">
        {LOCKER_TABS.map((t) => (
          <Link key={t.id} href={t.href} className={`pe-nav-mode${tab === t.id ? ' on' : ''}`} style={{ '--mode': t.color } as React.CSSProperties} aria-current={tab === t.id ? 'page' : undefined}>
            <LockerGlyph id={t.id} />
            <span>{t.label}</span>
          </Link>
        ))}
      </div>

      <div className="pe-nav-right">
        {signedIn && (
          <FriendsMenu on={false}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="9" cy="8.5" r="3.2" />
              <path d="M3.2 19.5c.6-3.3 3-5.2 5.8-5.2s5.2 1.9 5.8 5.2" />
              <circle cx="16.6" cy="9.4" r="2.5" />
              <path d="M15.6 14.4c2.6-.3 4.7 1.4 5.2 4.3" />
            </svg>
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
