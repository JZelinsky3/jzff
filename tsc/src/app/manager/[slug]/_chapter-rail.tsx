// The chapter rail must run on the client — it reads usePathname() to know
// which route is active and scrolls the active tab into view. It's the only
// interactive piece of the shared kit; everything else in _shared.tsx is
// server-renderable, so the helpers / atoms can be called from server pages
// without Next.js wrapping them as client references.

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

export type ChapterId = 'front' | 'standings' | 'drafts' | 'records' | 'rivals' | 'trophies' | 'setup'

export const CHAPTERS: { id: ChapterId; label: string; path: (slug: string) => string }[] = [
  { id: 'front',     label: 'Front Page',      path: (s) => `/manager/${s}` },
  { id: 'standings', label: 'Standings Desk',  path: (s) => `/manager/${s}/standings` },
  { id: 'drafts',    label: 'Draft Room',      path: (s) => `/manager/${s}/drafts` },
  { id: 'records',   label: 'Record Book',     path: (s) => `/manager/${s}/records` },
  { id: 'rivals',    label: 'Society Page',    path: (s) => `/manager/${s}/rivals` },
  { id: 'trophies',  label: 'Trophy Room',     path: (s) => `/manager/${s}/trophies` },
  { id: 'setup',     label: 'Manager Setup',   path: (s) => `/manager/${s}/settings` },
]

export function ChapterRail({ slug }: { slug: string }) {
  const path = usePathname() ?? ''
  const railRef = useRef<HTMLDivElement>(null)
  const activeId = activeChapter(path, slug)

  useEffect(() => {
    const tab = railRef.current?.querySelector<HTMLElement>(`[data-tab="${activeId}"]`)
    tab?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeId])

  return (
    <nav className="mh-rail" ref={railRef} aria-label="Chapters">
      {CHAPTERS.map((c, i) => {
        const active = c.id === activeId
        return (
          <Link
            key={c.id}
            data-tab={c.id}
            href={c.path(slug)}
            className={`mh-tab ${active ? 'is-active' : ''}`}
          >
            <span className="mh-tab-num">{String(i + 1).padStart(2, '0')}</span>
            {c.label}
          </Link>
        )
      })}
    </nav>
  )
}

function activeChapter(path: string, slug: string): ChapterId {
  const tail = path.replace(`/manager/${slug}`, '').replace(/^\//, '').split('/')[0] ?? ''
  if (tail === '')          return 'front'
  if (tail === 'standings') return 'standings'
  if (tail === 'drafts')    return 'drafts'
  if (tail === 'records')   return 'records'
  if (tail === 'rivals')    return 'rivals'
  if (tail === 'trophies')  return 'trophies'
  if (tail === 'settings')  return 'setup'
  return 'front'
}
