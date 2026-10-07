'use client'

// Counts a page view of a league for /admin/activity. Mounted by the React
// league pages (recap, awards, games); the static almanac pages get the same
// thing as an inline script from the almanac route (leagueVisitScript in
// lib/leagueVisit.ts). Both share the browser id under LEAGUE_VISIT_KEY.

import { useParams, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { LEAGUE_VISIT_KEY } from '@/lib/leagueVisit'

// On a recap edition page the ping also says which edition, and the email's
// utm tags if the reader came from it (recap_views, migration 0075).
function recapContext(pathname: string, year?: string, week?: string) {
  if (!year || !week || !pathname.includes('/recap/')) return undefined
  const q = new URLSearchParams(window.location.search)
  return { year: Number(year), week: Number(week), medium: q.get('utm_medium') ?? '', content: q.get('utm_content') ?? '' }
}

export function LeagueVisitPing() {
  const { slug, year, week } = useParams<{ slug: string; year?: string; week?: string }>()
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
      body: JSON.stringify({ slug, vid, recap: recapContext(pathname, year, week) }),
      keepalive: true,
    }).catch(() => {})
  }, [slug, pathname, year, week])

  return null
}
