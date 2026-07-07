'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

// Session-scoped visit stack so BackButton can navigate to the actual
// previous page instead of trusting raw history.back(), which overshoots
// when a click lands mid-navigation (history entry not committed yet) or
// when the session history is polluted with forward entries.
//
// Mounted once in the root layout; records every pathname change. When
// the new pathname equals the entry *below* the top, we treat it as a
// back-navigation and pop instead of pushing, so the stack doesn't grow
// [A, B, A, B, ...] as the user bounces between two pages.

export const NAV_STACK_KEY = 'tsc_nav_stack'

export function readNavStack(): string[] {
  try {
    const raw = sessionStorage.getItem(NAV_STACK_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

export function writeNavStack(stack: string[]) {
  try {
    sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack.slice(-25)))
  } catch {
    // storage blocked (private mode etc.); back falls through to history
  }
}

export function NavTracker() {
  const pathname = usePathname()
  useEffect(() => {
    const stack = readNavStack()
    const top = stack[stack.length - 1]
    if (top === pathname) return
    if (stack[stack.length - 2] === pathname) {
      stack.pop() // returned to the previous page; unwind instead of pushing
    } else {
      stack.push(pathname)
    }
    writeNavStack(stack)
  }, [pathname])
  return null
}
