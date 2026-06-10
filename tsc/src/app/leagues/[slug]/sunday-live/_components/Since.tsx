'use client'

// Relative timestamp ("12s ago"). Renders a static placeholder on SSR + the
// first client render so hydration matches; flips to the live value on mount
// and re-renders every 5s. Avoids the Date.now() hydration trap that bites any
// SSR'd "X ago" widget.

import { useEffect, useState } from 'react'
import { fmtSince } from '../_lib/format'

export function Since({ iso, placeholder = '—' }: { iso: string | null; placeholder?: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    const t = setInterval(() => setMounted((m) => !m && true), 5000)
    return () => clearInterval(t)
  }, [])
  return <>{mounted ? fmtSince(iso) : placeholder}</>
}
