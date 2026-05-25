import { NavDropdown, type DropGroup } from '@/components/NavDropdown'
import { DashboardNavBackSlot } from './nav-back-slot'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const groups: DropGroup[] = [
    {
      label: 'Library',
      entries: [
        // Skip "Your leagues" — that's literally this page.
        { type: 'link', href: '/dashboard/new', label: 'New archive' },
      ],
    },
    {
      label: 'Account',
      entries: [
        { type: 'link', href: '/account', label: 'Profile & subscription' },
      ],
    },
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
