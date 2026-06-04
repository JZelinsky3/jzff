'use client'

import { NavDropdown, type DropGroup } from '@/components/NavDropdown'

// Top-right hamburger menu for /account. Two top-level shortcuts (Library and
// New archive), then a Leagues group with one expandable entry per owned
// league. Each league expands into Setup (admin /league/<slug>/setup) and
// Home (public hub /league/<slug>/).
export function AccountNavMenu({
  leagues,
}: {
  leagues: { slug: string; name: string }[]
}) {
  const groups: DropGroup[] = [
    {
      label: '',
      entries: [
        { type: 'link', href: '/dashboard',     label: 'Library'     },
        { type: 'link', href: '/dashboard/new', label: 'New archive' },
      ],
    },
  ]

  if (leagues.length > 0) {
    groups.push({
      label: 'Leagues',
      entries: leagues.map((l) => ({
        type: 'sub',
        label: l.name,
        items: [
          { href: `/league/${l.slug}/setup`, label: 'Setup' },
          { href: `/league/${l.slug}`,       label: 'Home'  },
        ],
      })),
    })
  }

  return <NavDropdown groups={groups} position="right" includeSignOut />
}
