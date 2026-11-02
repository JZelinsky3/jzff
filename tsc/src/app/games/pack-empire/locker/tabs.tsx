// The Locker's tabs, for the desktop bar and the phone dock alike.

import { LOCKER_GAMES } from '@/lib/packEmpire/locker/rules'

export type LockerTabId = 'home' | 'shop' | 'collection' | (string & {})

export const LOCKER_TABS: { id: LockerTabId; label: string; href: string; color: string }[] = [
  { id: 'home', label: 'Locker', href: '/games/pack-empire/locker/', color: '#4fc3b0' },
  { id: 'shop', label: 'Shop', href: '/games/pack-empire/locker/shop/', color: '#e8a84b' },
  { id: 'collection', label: 'Cards', href: '/games/pack-empire/locker/collection/', color: '#79d6ff' },
  ...LOCKER_GAMES.map((g) => ({ id: g.id, label: `${g.title} ${g.titleEm}`, href: g.href, color: '#7be0a2' })),
]

const MARKS: Record<string, React.ReactNode> = {
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
