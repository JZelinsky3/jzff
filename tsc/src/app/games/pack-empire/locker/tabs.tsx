// The Locker's tabs, for the desktop bar and the phone dock alike.

import { LOCKER_GAMES } from '@/lib/packEmpire/locker/rules'

export type LockerTabId = 'empire' | 'home' | 'shop' | 'collection' | 'trophies' | (string & {})

type LockerTab = { id: LockerTabId; label: string; href: string; color: string }

export const SHOP_TAB: LockerTab = { id: 'shop', label: 'Shop', href: '/games/pack-empire/locker/shop/', color: '#e8a84b' }

/** The desktop's middle row. The Shop sits apart from them, on the right by your FAAB. */
export const LOCKER_TABS: LockerTab[] = [
  { id: 'empire', label: 'Empire', href: '/games/pack-empire/', color: '#e8a84b' },
  { id: 'home', label: 'Locker', href: '/games/pack-empire/locker/', color: '#4fc3b0' },
  { id: 'collection', label: 'Cards', href: '/games/pack-empire/locker/collection/', color: '#79d6ff' },
  ...LOCKER_GAMES.map((g) => ({ id: g.id, label: `${g.title} ${g.titleEm}`, href: g.href, color: '#7be0a2' })),
  { id: 'trophies', label: 'Trophies', href: '/games/pack-empire/locker/trophies/', color: '#f4c06a' },
]

const MARKS: Record<string, React.ReactNode> = {
  empire: (
    <>
      <path d="M6.500 3.500h11l-.8 1.600.8 1.600v10.600l-.8 1.600.8 1.600h-11l.8-1.600-.8-1.600V6.700l.8-1.600z" />
      <path d="m12 9.200.9 1.900 2 .3-1.500 1.400.4 2-1.800-1-1.800 1 .4-2-1.500-1.400 2-.3z" />
    </>
  ),
  trophies: (
    <>
      <path d="M7.500 4h9v5.500a4.500 4.500 0 0 1-9 0z" />
      <path d="M7.500 5.500H4.500c0 3 1 4.500 3.300 5M16.500 5.500h3c0 3-1 4.500-3.300 5" />
      <path d="M12 14v3.500M8.500 20.500c0-2 1.500-3 3.500-3s3.500 1 3.500 3z" />
    </>
  ),
  home: (
    <>
      <rect x="5.5" y="3" width="13" height="18" rx="1.4" />
      <path d="M9 7h6M9 10h6" />
      <path d="M15 14v2.500" />
    </>
  ),
  shop: (
    <>
      <path d="M4 9.500 5.500 4h13L20 9.500" />
      <path d="M5.500 10v10h13V10" />
      <path d="M4 9.500c0 3 5.300 3 5.300 0 0 3 5.400 3 5.400 0 0 3 5.300 3 5.300 0" />
    </>
  ),
  collection: (
    <>
      <rect x="8" y="4" width="11" height="15" rx="1.4" />
      <path d="M5 7.500v11c0 1 .7 1.700 1.700 1.700H14" />
    </>
  ),
}

/** A game's tab draws a route: every game on here is football. */
const GAME_MARK = (
  <>
    <path d="M5 20c0-6 4-7 7-9s4-4 4-7" />
    <path d="m13 6 3-3 3 3" />
    <circle cx="5.500" cy="20" r="1.200" />
  </>
)

export function LockerGlyph({ id }: { id: LockerTabId }) {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {MARKS[id] ?? GAME_MARK}
    </svg>
  )
}
