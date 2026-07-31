'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import s from './mobile.module.css'

// The section's whole map, at the thumb. Same pattern as the Clubhouse's
// six-wing dock (HubMobileDock in app/hub/hub-chrome.tsx), at three items
// because that is all this section has: the shelf and the two games.
//
// This is what replaces the hamburger sheet on these pages — with the map
// this short there was never anything for a sheet to hold.
//
// NOT rendered on a board. Both boards already own the bottom of the
// screen: Roulette with its lineup HUD, Guess the Draft with its answer
// bar. A dock under either would be a second fixed bar arguing with the
// first over the same thumb.

const ITEMS = [
  {
    href: '/games/',
    label: 'Games',
    icon: (
      <>
        <path d="M3.5 4.5h7v7h-7z" />
        <path d="M13.5 4.5h7v7h-7z" />
        <path d="M3.5 13.5h7v7h-7z" />
        <path d="M13.5 13.5h7v7h-7z" />
      </>
    ),
  },
  {
    href: '/games/roulette/',
    label: 'Roulette',
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="2.2" />
        <path d="M12 3.5v4" />
        <path d="M12 16.5v4" />
        <path d="M3.5 12h4" />
        <path d="M16.5 12h4" />
      </>
    ),
  },
  {
    href: '/games/guess-the-draft/',
    label: 'Guess',
    icon: (
      <>
        <path d="M4.5 4.5h15v15h-15z" />
        <path d="M7.5 9.5h9" />
        <path d="M7.5 14.5h5" />
      </>
    ),
  },
]

export function MobileGamesDock() {
  const pathname = usePathname()
  return (
    <nav className={s.dock} aria-label="The Games Page">
      {ITEMS.map((it) => {
        const base = it.href.replace(/\/$/, '')
        // The shelf matches only itself; a game matches its lobby and its
        // board, which are the same route with a ?pool= on it.
        const active =
          base === '/games' ? pathname === '/games' || pathname === '/games/' : pathname.startsWith(base)
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`${s.dockItem} ${active ? s.dockOn : ''}`}
          >
            <svg
              viewBox="0 0 24 24"
              width="19"
              height="19"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {it.icon}
            </svg>
            {it.label}
          </Link>
        )
      })}
    </nav>
  )
}
