import { NavDropdown, type DropGroup } from '@/components/NavDropdown'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
// getViewMode fork vaulted 2026-06-24 — see fork comment below.
import { DashboardNavBackSlot } from './nav-back-slot'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Mobile fork vaulted 2026-06-24 — /dashboard now always serves the
  // desktop tree (which renders responsively on phones), so the nav must
  // always render too. /dashboard/new still uses MobileNewArchive; that
  // page hides this nav with its own sticky bar via CSS, so leaving the
  // nav on doesn't double-stack chrome there.
  // if ((await getViewMode()) === 'mobile') {
  //   return <>{children}</>
  // }

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
