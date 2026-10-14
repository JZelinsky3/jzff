// The report takes a second or two to build (a season of lineups and one
// 8,000-run sim per week), so the page and its image share a cached copy.
// Tagged like the almanac bundle, so a sync refreshes it at once.

import { unstable_cache } from 'next/cache'
import { loadReport, type ReportResult } from './build'

export function loadReportCached(
  league: { id: string; name: string; slug: string; owner_id: string | null },
  week: number | null,
): Promise<ReportResult> {
  return unstable_cache(() => loadReport(league, week), ['progress-report', 'v4', league.id, String(week ?? 'latest')], {
    revalidate: 900,
    tags: [`league-${league.id}`],
  })()
}
