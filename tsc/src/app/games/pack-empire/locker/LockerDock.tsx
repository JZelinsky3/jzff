'use client'

// The phone's tabs inside the Locker Room. Pack Empire is the way out, on the far left,
// and the rest are its own rooms. The games aren't down here: they're on the Locker
// page, which is where a game gets picked. Friends and back live on the top bar.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import s from '../../mobile.module.css'
import { LOCKER_TABS, LockerGlyph, SHOP_TAB } from './tabs'

const ROOMS = ['home', 'shop', 'collection', 'trophies'].flatMap((id) => (id === 'shop' ? SHOP_TAB : (LOCKER_TABS.find((t) => t.id === id) ?? [])))

export function LockerDock() {
  const pathname = usePathname()
  const at = (href: string) => (href.endsWith('/locker/') ? pathname.replace(/\/$/, '') === href.replace(/\/$/, '') : pathname.startsWith(href.replace(/\/$/, '')))
  return (
    <nav className={s.dock} style={{ gridTemplateColumns: `repeat(${ROOMS.length + 1}, 1fr)` }} aria-label="The Locker Room">
      <Link href="/games/pack-empire/" className={s.dockItem}>
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6.500 3.500h11l-.8 1.600.8 1.600v10.600l-.8 1.600.8 1.600h-11l.8-1.600-.8-1.600V6.700l.8-1.600z" />
          <path d="m12 9.200.9 1.900 2 .3-1.500 1.400.4 2-1.800-1-1.800 1 .4-2-1.500-1.400 2-.3z" />
        </svg>
        Empire
      </Link>
      {ROOMS.map((t) => (
        <Link key={t.id} href={t.href} className={`${s.dockItem} ${at(t.href) ? s.dockOn : ''}`} aria-current={at(t.href) ? 'page' : undefined}>
          <LockerGlyph id={t.id} />
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
