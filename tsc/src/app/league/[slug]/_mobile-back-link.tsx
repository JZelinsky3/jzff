'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Mobile sub-page back arrow rendered by the league layout. Hidden on the
// Live Season Hub specifically — that screen is reached often and the
// back-to-league arrow above the page title was just noise; the global
// MobileSiteMenu (avatar trigger) still provides nav. Other subpages
// (/settings, /rivalries, /sources, etc.) keep the arrow.
const HIDE_BACK_ON = [/\/live\/?$/]

export function MobileLeagueBackLink({ slug }: { slug: string }) {
  const pathname = usePathname() || ''
  if (HIDE_BACK_ON.some((re) => re.test(pathname))) {
    return <span className="mlsub-bar-spacer" aria-hidden />
  }
  return (
    <Link href={`/league/${slug}`} className="mlsub-bar-back" aria-label="Back to league">
      <svg viewBox="0 0 8 14" width="10" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="7 1 1 7 7 13" />
      </svg>
    </Link>
  )
}
