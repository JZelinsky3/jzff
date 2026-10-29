'use client'

// Reading the browser's own storage without a setState-in-an-effect.
//
// The server can't see localStorage, so the first render has to match the
// server's (nothing stored), and the real value arrives with hydration. That
// is exactly what useSyncExternalStore is for: the server snapshot is the
// fallback, the client snapshot is the stored value, and React switches
// between them without an extra render pass of our own.

import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

/** Tell every reader that something this tab wrote has changed. */
export function storageChanged() {
  listeners.forEach((cb) => cb())
}

export function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    () => null
  )
}

const noop = () => () => {}

/** False on the server and during hydration, true after. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  )
}

/** The page's own origin, for writing out a full link. */
export function useOrigin(): string {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => ''
  )
}
