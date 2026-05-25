'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function LeagueBackLink({ slug }: { slug: string }) {
  const pathname = usePathname() ?? ''
  const hub = `/league/${slug}`
  const onHub = pathname === hub || pathname === `${hub}/`
  const href = onHub ? '/dashboard' : hub
  const label = onHub ? 'Back to library' : 'Back to league'

  return (
    <Link href={href} className="dc-nav-icon" aria-label={label}>
      <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="7 1 1 7 7 13" />
      </svg>
    </Link>
  )
}
