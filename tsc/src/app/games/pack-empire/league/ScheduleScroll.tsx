'use client'

// The season strip runs sideways; this keeps this week in view, so week six
// doesn't open on week one.

import { useLayoutEffect, useRef } from 'react'

export function ScheduleScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = ref.current
    const now = box?.querySelector<HTMLElement>('.pe-ls-week.now') ?? box?.querySelector<HTMLElement>('.pe-ls-week.next')
    if (!box || !now) return
    // This week second from the left, last week still in sight.
    const target = (now.previousElementSibling as HTMLElement | null) ?? now
    box.scrollLeft += target.getBoundingClientRect().left - box.getBoundingClientRect().left - 4
  }, [])
  return (
    <div className="pe-ls" ref={ref}>
      {children}
    </div>
  )
}
