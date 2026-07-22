'use client'

// Floating Support pill for React pages (league management surface). Thin
// wrapper around the same vanilla widget the public almanac uses — it loads
// /pams-template/assets/{css/support.css,js/support.js}, hands over context
// via window.__TSCSupport, and tears the widget down on unmount so it never
// leaks onto non-league pages after client-side navigation.

import { useEffect } from 'react'

declare global {
  interface Window {
    __TSCSupport?: { slug?: string | null; league?: string | null; email?: string | null }
    TSCSupport?: { mount: () => void; unmount: () => void }
  }
}

export function SupportWidget({
  slug,
  league,
  email,
}: {
  slug?: string
  league?: string
  email?: string
}) {
  useEffect(() => {
    window.__TSCSupport = { slug: slug ?? null, league: league ?? null, email: email ?? null }

    if (!document.querySelector('link[data-tsc-support]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = '/pams-template/assets/css/support.css'
      link.setAttribute('data-tsc-support', '')
      document.head.appendChild(link)
    }

    if (document.querySelector('script[data-tsc-support]')) {
      // Script already loaded (or loading) from a previous mount. If the API
      // is up, remount; if it's still fetching, its own load handler mounts.
      window.TSCSupport?.mount()
    } else {
      const script = document.createElement('script')
      script.src = '/pams-template/assets/js/support.js'
      script.defer = true
      script.setAttribute('data-tsc-support', '')
      document.body.appendChild(script)
    }

    return () => {
      window.TSCSupport?.unmount()
    }
  }, [slug, league, email])

  return null
}
