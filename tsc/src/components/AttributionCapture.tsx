'use client'

// First-touch signup attribution.
//
// Mounted in the root layout so it runs on every page, which is what makes it
// work across the auth boundary: someone taps an Instagram ad, lands with
// ?utm_source=instagram, browses signed out, signs up with Google, and comes
// back to /dashboard. The cookie survives that whole trip, and this component
// mounts again on the dashboard — now with a session — so the POST lands.
//
// Deliberately NOT threaded through signUp({ options: { data }}), which would
// mean touching both login forms, handle_new_user, the Google helper and the
// auth callback, and would still miss the magic-link path. One cookie plus one
// idempotent POST covers every auth method the same way.

import { useEffect } from 'react'

const COOKIE = 'tsc_attr'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

type Attr = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  first_referrer?: string
}

function readCookie(name: string): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null
}

// Host only. We want "chatgpt.com", not the full URL someone came from.
function referrerHost(): string | undefined {
  if (!document.referrer) return undefined
  try {
    const h = new URL(document.referrer).hostname
    // Same-site navigation is not a referral.
    if (h === window.location.hostname) return undefined
    return h.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

export function AttributionCapture() {
  useEffect(() => {
    let attr: Attr | null = null

    // First touch wins: never overwrite an existing cookie.
    const existing = readCookie(COOKIE)
    if (existing) {
      try {
        attr = JSON.parse(existing) as Attr
      } catch {
        attr = null
      }
    }

    if (!attr) {
      const q = new URLSearchParams(window.location.search)
      const trim = (v: string | null) => (v ? v.trim().slice(0, 120) || undefined : undefined)
      const next: Attr = {
        utm_source: trim(q.get('utm_source')),
        utm_medium: trim(q.get('utm_medium')),
        utm_campaign: trim(q.get('utm_campaign')),
        first_referrer: referrerHost(),
      }
      // Nothing to remember about a direct, untagged landing.
      if (!next.utm_source && !next.utm_medium && !next.utm_campaign && !next.first_referrer) return
      attr = next
      document.cookie =
        `${COOKIE}=${encodeURIComponent(JSON.stringify(attr))}; path=/; max-age=${MAX_AGE}; samesite=lax`
    }

    // Fire and forget. The route no-ops when signed out or when the profile
    // already carries attribution, so repeating this on every page is cheap
    // and safe — but skip the obvious repeat within a single session.
    if (sessionStorage.getItem(COOKIE + '_sent')) return
    sessionStorage.setItem(COOKIE + '_sent', '1')
    fetch('/api/attribution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attr),
      keepalive: true,
    }).catch(() => {
      // Attribution is never worth surfacing an error to a user over.
      sessionStorage.removeItem(COOKIE + '_sent')
    })
  }, [])

  return null
}
