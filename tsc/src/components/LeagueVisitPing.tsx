'use client'

// Counts a page view of a league for /admin/activity. Mounted by the React
// league pages (recap, awards, games); the static almanac pages get the same
// thing as an inline script from the almanac route (leagueVisitScript in
// lib/leagueVisit.ts). Both share the browser id under LEAGUE_VISIT_KEY.

import { useParams, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { LEAGUE_VISIT_KEY } from '@/lib/leagueVisit'

export function LeagueVisitPing() {
  const { slug } = useParams<{ slug: string }>()
  const pathname = usePathname()

  useEffect(() => {
    let vid: string | null
    try {
      vid = localStorage.getItem(LEAGUE_VISIT_KEY)
      if (!vid) {
        vid = crypto.randomUUID()
        localStorage.setItem(LEAGUE_VISIT_KEY, vid)
      }
    } catch {
      // No storage means a new id every page, which would count one person
      // as many. Better to not count them.
      return
    }
    void fetch('/api/visit/league', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, vid }),
      keepalive: true,
    }).catch(() => {})
  }, [slug, pathname])

  return null
}
