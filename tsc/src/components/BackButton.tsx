'use client'

import { BackLink } from '@/components/BackLink'

// The standard nav back arrow. Behaviour lives in BackLink/useBackNav, which
// the mobile bars share — this is just the chrome the desktop nav wears.

export function BackButton({
  fallbackHref,
  ariaLabel = 'Back',
}: {
  fallbackHref: string
  ariaLabel?: string
}) {
  return (
    <BackLink href={fallbackHref} className="dc-nav-icon" ariaLabel={ariaLabel}>
      <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="7 1 1 7 7 13" />
      </svg>
    </BackLink>
  )
}
