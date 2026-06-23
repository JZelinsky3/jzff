import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

// Dynamic sitemap (replaces the old hand-maintained public/sitemap.xml,
// which had gone stale — it predated the Yahoo + NFL.com guides and the
// Clubhouse). Static marketing/SEO pages are listed by hand; every
// published public almanac is pulled from Supabase so new leagues start
// getting crawled the moment a commissioner hits Publish.
//
// Deliberately excluded: /league/* (private management UI), /dashboard,
// /account, /hub/analyzer (interactive tool, nothing to index), and
// unpublished or setup-placeholder almanacs.

// Without this the sitemap is prerendered once at build time and newly
// published leagues wouldn't appear until the next deploy. Hourly is plenty.
export const revalidate = 3600

const BASE = 'https://thesundaychronicle.app'

// path → [changeFrequency, priority]. Trailing slashes everywhere to match
// `trailingSlash: true` in next.config.ts so crawlers never eat a 308.
const STATIC_PAGES: Array<[string, MetadataRoute.Sitemap[number]['changeFrequency'], number]> = [
  ['/', 'weekly', 1.0],
  ['/about/', 'monthly', 0.9],
  ['/pricing/', 'monthly', 0.8],
  ['/demo/', 'weekly', 0.9],
  ['/guides/', 'monthly', 0.9],
  ['/guides/sleeper-league-history/', 'monthly', 0.8],
  ['/guides/espn-league-history/', 'monthly', 0.8],
  ['/guides/yahoo-league-history/', 'monthly', 0.8],
  ['/guides/nfl-com-league-history/', 'monthly', 0.8],
  ['/guides/migrate-fantasy-league/', 'monthly', 0.8],
  ['/guides/sleeper-vs-espn-history/', 'monthly', 0.8],
  ['/guides/commissioner-mistakes/', 'monthly', 0.7],
  ['/guides/why-league-history-dies/', 'monthly', 0.7],
  // Category / comparison pages targeting AI-visibility gap queries:
  // "best fantasy football almanac", "fantasy football league history
  // software", "best fantasy football recap services", "fantasy football
  // league management software reviews". Higher priority than the deeper
  // guides because they're the discovery entry points for buyers.
  ['/guides/best-fantasy-football-almanac/', 'monthly', 0.85],
  ['/guides/fantasy-football-league-history-software/', 'monthly', 0.85],
  ['/guides/best-fantasy-football-recap/', 'monthly', 0.8],
  ['/guides/fantasy-football-league-management-software/', 'monthly', 0.85],
  // Tool-category gap pages — zero-competitor queries from the AI-visibility
  // report ("fantasy football trade analysis tools", "milestone tracking",
  // "manager DNA analysis"). TSC already has these features; the pages
  // document them in buyer-query shape.
  ['/guides/fantasy-football-trade-analyzer/', 'monthly', 0.8],
  ['/guides/fantasy-football-milestone-tracker/', 'monthly', 0.8],
  ['/guides/fantasy-football-manager-analysis/', 'monthly', 0.8],
  // Platform-setup hub — single landing page that links out to each of
  // the per-platform how-tos. Replaces the 4 individual nav lines.
  ['/guides/set-up-your-league/', 'monthly', 0.85],
  // Demo subpages. The /demo/ root is the marketing entry, but the chapter
  // pages contain the bulk of the indexable almanac content — real league
  // data rendered as HTML. Listing them separately gets each chapter into
  // Google + the AI training scrapes individually. Test/layout pages
  // (trade-themes, draft-layouts, tables-demo, vote-icons) are intentionally
  // excluded — they're internal design experiments, not finished content.
  ['/demo/standings.html', 'weekly', 0.7],
  ['/demo/records.html', 'weekly', 0.7],
  ['/demo/seasons/', 'weekly', 0.7],
  ['/demo/managers/', 'weekly', 0.7],
  ['/demo/draft/', 'weekly', 0.7],
  ['/demo/rivalries/', 'weekly', 0.7],
  ['/demo/pickems/', 'weekly', 0.6],
  ['/demo/powerrank/', 'weekly', 0.6],
  ['/demo/live/', 'weekly', 0.65],
  ['/demo/live/matchup-preview/', 'weekly', 0.6],
  ['/demo/live/best-coach/', 'weekly', 0.6],
  ['/demo/live/records-watch/', 'weekly', 0.6],
  ['/demo/live/milestones/', 'weekly', 0.6],
  ['/demo/live/trades/', 'weekly', 0.6],
  ['/hub/', 'weekly', 0.7],
  ['/hub/explore/', 'weekly', 0.7],
  ['/hub/records/', 'weekly', 0.6],
  ['/hub/numbers/', 'weekly', 0.5],
  ['/hub/whats-new/', 'weekly', 0.5],
  ['/privacy/', 'yearly', 0.3],
  ['/terms/', 'yearly', 0.3],
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_PAGES.map(([path, changeFrequency, priority]) => ({
    url: `${BASE}${path}`,
    changeFrequency,
    priority,
  }))

  // Published almanacs. UDFA-locked leagues stay listed — their index pages
  // still render (locked chapters show the upgrade badge, not a 404).
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('leagues')
      .select('slug, published_at')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
    for (const row of data ?? []) {
      entries.push({
        url: `${BASE}/leagues/${row.slug}/`,
        lastModified: row.published_at ? new Date(row.published_at) : undefined,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  } catch {
    // A Supabase hiccup shouldn't 500 the sitemap — serve the static pages
    // and let the next crawl pick up the league URLs.
  }

  return entries
}
