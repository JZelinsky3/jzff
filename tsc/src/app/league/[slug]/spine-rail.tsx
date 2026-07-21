'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const CHAPTERS = [
  { key: 'sources', seg: 'sources', numeral: 'I', label: 'Sources' },
  { key: 'members', seg: 'setup', numeral: 'II', label: 'Members' },
  { key: 'rivalries', seg: 'rivalries', numeral: 'III', label: 'Feuds' },
  { key: 'season', seg: 'live', numeral: 'IV', label: 'Season' },
  { key: 'settings', seg: 'settings', numeral: 'V', label: 'Settings' },
  { key: 'present', seg: 'present', numeral: 'VI', label: 'Present' },
] as const

// The thumb index: fore-edge tabs down the right side of the volume, one
// per chapter, so you can turn straight to any department without going
// back to the contents page first.
export function SpineRail({ slug, canManage }: { slug: string; canManage: boolean }) {
  const pathname = (usePathname() ?? '').replace(/\/+$/, '')
  const chapters = canManage ? CHAPTERS : CHAPTERS.filter((c) => c.key !== 'present')

  return (
    <nav className="lo-spine" aria-label="Chapters">
      {chapters.map((c) => {
        const href = `/league/${slug}/${c.seg}`
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={c.key}
            href={href}
            className={`lo-spine-tab lo-spine-tab--${c.key}${active ? ' active' : ''}`}
            title={c.label}
            aria-current={active ? 'page' : undefined}
          >
            <b>{c.numeral}</b>
            <span>{c.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
