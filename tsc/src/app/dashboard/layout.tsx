import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { getViewMode } from '@/lib/viewMode'
import { LibraryIndexBook, type IndexGroup } from './library-index'
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

  const groups: IndexGroup[] = [
    {
      label: 'Library',
      links: [
        // Skip "Your leagues" — that's literally this page.
        { href: '/dashboard/new', label: 'New archive' },
        { href: '/hub', label: 'The Clubhouse' },
        { href: '/guides', label: 'Guides' },
      ],
    },
    {
      label: 'Account',
      links: [
        { href: '/account', label: 'Profile' },
        { href: '/pricing', label: 'Plans' },
      ],
    },
    ...(admin
      ? [{
          label: 'Site admin',
          links: [{ href: '/admin', label: 'Admin console' }],
        }]
      : []),
  ]

  return (
    <>
      <nav className="nav">
        {/* Left slot: Reader's Card chip on /dashboard, back arrow on sub-pages like /new. */}
        <DashboardNavBackSlot />
        <div className="nav-center">
          <div className="nav-kicker">Vol. II · The Library</div>
          <div className="nav-title" style={{ letterSpacing: '.04em' }}>
            TS<em>C.</em>
          </div>
        </div>
        <LibraryIndexBook groups={groups} email={user?.email ?? null} />
      </nav>
      {children}
    </>
  )
}
