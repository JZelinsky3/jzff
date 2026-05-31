'use client'

import { usePathname } from 'next/navigation'
import { NavDropdown, type DropGroup, type SubItem } from '@/components/NavDropdown'

// Top-right hamburger menu for every page under /league/<slug>/. Lists the
// admin sub-pages (hiding the one you're on) plus shortcuts to the league hub,
// the dashboard, and the public almanac. Built on top of the shared NavDropdown
// so styles + click-outside / Escape behavior match the rest of the site.
export function AdminNavMenu({
  slug,
  isOwner = false,
  liveYear = null,
}: {
  slug: string
  isOwner?: boolean
  liveYear?: number | null
}) {
  const pathname = usePathname() ?? ''
  const hub = `/league/${slug}`
  const onHub = pathname === hub || pathname === `${hub}/`

  const liveLabel = liveYear ? `${liveYear} Season` : 'Current Season'

  const allAdmin = [
    { href: `${hub}/setup`,     label: 'Members'   },
    { href: `${hub}/sources`,   label: 'Sources'   },
    { href: `${hub}/rivalries`, label: 'Rivalries' },
    { href: `${hub}/settings`,  label: 'Settings'  },
    { href: `${hub}/live`,      label: liveLabel   },
  ]
  // Hide the page you're currently on so the menu only shows places you can go.
  const adminPages = allAdmin.filter((p) => !pathname.startsWith(p.href))

  const navigateItems: SubItem[] = []
  navigateItems.push({ href: '/dashboard', label: 'Library' })
  navigateItems.push({ href: '/account', label: 'Account' })
  if (!onHub) {
    navigateItems.push({ href: hub, label: 'League hub' })
  }
  navigateItems.push({ kind: 'signout', label: 'Sign out' })

  const groups: DropGroup[] = []
  if (adminPages.length > 0) {
    groups.push({
      label: 'Admin',
      entries: adminPages.map((p) => ({ type: 'link', href: p.href, label: p.label })),
    })
  }
  if (isOwner && !pathname.startsWith(`${hub}/present`)) {
    groups.push({
      label: 'Showcase',
      entries: [{ type: 'link', href: `${hub}/present`, label: 'Presentation mode' }],
    })
  }
  groups.push({
    label: '',
    entries: [{ type: 'sub', label: 'Navigate', items: navigateItems, highlight: true }],
  })

  return <NavDropdown groups={groups} position="right" />
}
