'use client'

// The phone's tabs inside the Locker. Back and Friends live on the top bar, so these
// are only the Locker's own rooms.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import s from '../../mobile.module.css'
import { LOCKER_TABS, LockerGlyph } from './tabs'

export function LockerDock() {
  const pathname = usePathname()
  const at = (href: string) => (href.endsWith('/locker/') ? pathname.replace(/\/$/, '') === href.replace(/\/$/, '') : pathname.startsWith(href.replace(/\/$/, '')))
  return (
    <nav className={s.dock} style={{ gridTemplateColumns: `repeat(${LOCKER_TABS.length}, 1fr)` }} aria-label="The Locker">
      {LOCKER_TABS.map((t) => (
        <Link key={t.id} href={t.href} className={`${s.dockItem} ${at(t.href) ? s.dockOn : ''}`} aria-current={at(t.href) ? 'page' : undefined}>
          <LockerGlyph id={t.id} />
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
