import { NavDropdown, type DropGroup } from '@/components/NavDropdown'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { getViewMode } from '@/lib/viewMode'
import { DashboardNavBackSlot } from './nav-back-slot'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Mobile pages under /dashboard (MobileLibrary, MobileNewArchive) ship
  // their own sticky top bar + back arrow. Rendering the desktop <nav> on
  // top of them would stack two chromes and produce a duplicate back arrow.
  if ((await getViewMode()) === 'mobile') {
    return <>{children}</>
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = await isSiteAdmin(user?.id)

  const groups: DropGroup[] = [
    {
      label: 'Library',
      entries: [
        // Skip "Your leagues" — that's literally this page.
        { type: 'link', href: '/dashboard/new', label: 'New archive' },
        { type: 'link', href: '/hub', label: 'The Clubhouse' },
      ],
    },
    {
      label: 'Account',
      entries: [
        { type: 'link', href: '/account', label: 'Profile' },
      ],
    },
    ...(admin
      ? [{
          label: 'Site admin',
          entries: [{ type: 'link' as const, href: '/admin', label: 'Admin console' }],
        }]
      : []),
  ]

  return (
    <>
      <nav className="nav">
        {/* Left slot: invisible on /dashboard, back arrow on sub-pages like /new. */}
        <DashboardNavBackSlot />
        <div className="nav-center">
          <div className="nav-kicker">Vol. II · The Library</div>
          <div className="nav-title" style={{ letterSpacing: '.04em' }}>
            TS<em>C.</em>
          </div>
        </div>
        <NavDropdown groups={groups} position="right" includeSignOut />
      </nav>
      {children}
    </>
  )
}
