'use client'

import { usePathname, useSearchParams } from 'next/navigation'

// "Switch to mobile site" pill rendered globally when a phone has opted into
// the desktop layout (dc_view=desktop). Client component so we can read
// usePathname() and build a `to=` that returns to the SAME page in mobile
// mode, not the landing page. Hardcoding `to=/` stranded users on `/`
// every time they tapped it.
export function MobileViewEscape() {
  const pathname = usePathname() || '/'
  const search = useSearchParams()?.toString()
  const current = search ? `${pathname}?${search}` : pathname
  const href = `/api/view/?mode=mobile&to=${encodeURIComponent(current)}`
  return (
    <a className="mview-escape" href={href}>
      ◂ Switch to mobile site
    </a>
  )
}
